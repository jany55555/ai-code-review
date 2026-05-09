import Fastify from 'fastify';
import { ClaudeReviewClient } from '@ai-code-review/llm-client';
import { InMemoryStore } from '@ai-code-review/storage';
import { runReview } from '@ai-code-review/review-engine';
import { buildPullRequestContext } from '@ai-code-review/github-adapter';
import type { ReviewRun, ReviewStatus } from '@ai-code-review/contracts';

const app = Fastify({ logger: true });
const store = new InMemoryStore();
const reviewClient = new ClaudeReviewClient();

app.get('/health', async () => ({ ok: true }));

const sseClients = new Map<string, Set<(data: unknown) => void>>();

const broadcast = (repo: string, data: unknown) => {
  const targets = sseClients.get(repo);
  if (!targets) return;
  for (const send of targets) send(data);
};

const toStatus = (hasIssues: boolean): ReviewStatus => {
  return hasIssues ? '有问题' : '通过';
};

const makeReview = (body: { repo: string; pr: number; sha: string; trigger?: 'manual' | 'post-commit' | 'ci' }, review: ReviewRun): ReviewRun => ({
  ...review,
  trigger: body.trigger ?? 'manual',
  status: toStatus(review.issues.length > 0),
  updatedAt: new Date().toISOString(),
});

app.post('/review/run', async (request, reply) => {
  const body = request.body as {
    repo: string;
    pr: number;
    sha: string;
    diff: string;
    trigger?: 'manual' | 'post-commit' | 'ci';
  };

  const draft: ReviewRun = {
    id: `review_${Date.now()}`,
    repository: body.repo,
    pullRequestNumber: body.pr,
    sha: body.sha,
    summary: '排队中',
    issues: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: '排队中',
    trigger: body.trigger ?? 'manual',
  };
  store.saveReview(draft);
  store.saveReviewEvent(draft.id, '排队中');
  broadcast(body.repo, { type: 'review.status', review: draft });

  store.saveReviewEvent(draft.id, '审查中');
  const running: ReviewRun = { ...draft, status: '审查中', updatedAt: new Date().toISOString() };
  store.saveReview(running);
  broadcast(body.repo, { type: 'review.status', review: running });

  try {
    const review = await runReview(
      buildPullRequestContext(body.repo, body.pr, body.sha, body.diff),
      reviewClient,
    );

    const saved = makeReview(body, { ...review, createdAt: draft.createdAt, updatedAt: new Date().toISOString(), status: '通过' });
    const finalReview: ReviewRun = { ...saved, status: toStatus(saved.issues.length > 0) };
    store.saveReview(finalReview);
    store.saveReviewEvent(finalReview.id, finalReview.status);
    broadcast(body.repo, { type: 'review.completed', review: finalReview });
    return reply.send(finalReview);
  } catch (error) {
    const fallback: ReviewRun = {
      id: draft.id,
      repository: body.repo,
      pullRequestNumber: body.pr,
      sha: body.sha,
      summary: '审查服务暂时不可用，请稍后重试。',
      issues: [
        {
          id: 'review-unavailable',
          filePath: 'N/A',
          line: 1,
          severity: 'warning',
          title: 'AI 审查网关超时',
          evidence: String(error),
          suggestion: '当前提交已完成，但自动审查失败。可稍后点击“刷新审查结果”重试。',
          confidence: 1,
        },
      ],
      createdAt: draft.createdAt,
      updatedAt: new Date().toISOString(),
      status: '失败',
      trigger: body.trigger ?? 'manual',
      errorMessage: String(error),
    };

    store.saveReview(fallback);
    store.saveReviewEvent(fallback.id, '失败', String(error));
    broadcast(body.repo, { type: 'review.completed', review: fallback });
    request.log.error(error);
    return reply.code(200).send(fallback);
  }
});

app.get('/review/latest/:repo', async (request, reply) => {
  const { repo } = request.params as { repo: string };
  const review = store.getLatestReviewByRepo(repo) ?? store.getLatestReview();
  if (!review) {
    return reply.code(404).send({ message: 'Review not found' });
  }
  return review;
});

app.get('/review/events/:repo', async (request, reply) => {
  const { repo } = request.params as { repo: string };
  const review = store.getLatestReviewByRepo(repo) ?? store.getLatestReview();
  if (!review) {
    return reply.code(404).send({ message: 'Review not found' });
  }
  return { review, events: store.listReviewEvents(review.id) };
});

app.get('/review/stream/:repo', async (request, reply) => {
  const { repo } = request.params as { repo: string };
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.flushHeaders?.();

  const send = (data: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const bucket = sseClients.get(repo) ?? new Set<(data: unknown) => void>();
  bucket.add(send);
  sseClients.set(repo, bucket);

  const latest = store.getLatestReviewByRepo(repo);
  if (latest) send({ type: 'review.snapshot', review: latest });
  send({ type: 'hello', repo });

  request.raw.on('close', () => {
    const current = sseClients.get(repo);
    if (!current) return;
    current.delete(send);
    if (current.size === 0) sseClients.delete(repo);
  });
});

app.get('/review/:repo/:pr', async (request, reply) => {
  const { repo, pr } = request.params as { repo: string; pr: string };
  const review = store.getReviewByPR(repo, Number(pr));
  if (!review) {
    return reply.code(404).send({ message: 'Review not found' });
  }
  return review;
});

app.post('/feedback', async (request) => {
  const body = request.body as {
    reviewId: string;
    issueId: string;
    state: 'accepted' | 'ignored' | 'needs_more_context';
    note?: string;
  };

  store.saveFeedback({
    reviewId: body.reviewId,
    issueId: body.issueId,
    state: body.state,
    note: body.note,
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
});

app.listen({ port: Number(process.env.PORT ?? 8787), host: '0.0.0.0' });
