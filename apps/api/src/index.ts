import Fastify from 'fastify';
import { ClaudeReviewClient } from '@ai-code-review/llm-client';
import { InMemoryStore } from '@ai-code-review/storage';
import { runReview } from '@ai-code-review/review-engine';
import { buildPullRequestContext } from '@ai-code-review/github-adapter';

const app = Fastify({ logger: true });
const store = new InMemoryStore();
const reviewClient = new ClaudeReviewClient();

const buildCommitMarker = (repo?: string): string => `${repo!.trim()}::marker`;

app.get('/health', async () => ({ ok: true }));

app.post('/review/run', async (request, reply) => {
  const body = request.body as {
    repo: string;
    pr: number;
    sha: string;
    diff: string;
    trigger?: 'manual' | 'post-commit' | 'ci';
  };

  try {
    const review = await runReview(
      buildPullRequestContext(body.repo, body.pr, body.sha, body.diff),
      reviewClient,
    );

    review.trigger = body.trigger ?? 'manual';
    store.saveReview(review);
    return reply.send(review);
  } catch (error) {
    const fallback = {
      id: `review_${Date.now()}`,
      repository: body.repo,
      pullRequestNumber: body.pr,
      sha: body.sha,
      summary: '审查服务暂时不可用，请稍后重试。',
      issues: [
        {
          id: 'review-unavailable',
          filePath: 'N/A',
          line: 1,
          severity: 'warning' as const,
          title: 'AI 审查网关超时',
          evidence: String(error),
          suggestion: '当前提交已完成，但自动审查失败。可稍后点击“刷新审查结果”重试。',
          confidence: 1,
        },
      ],
      createdAt: new Date().toISOString(),
      trigger: body.trigger ?? 'manual',
    };

    store.saveReview(fallback);
    request.log.error(error);
    return reply.code(200).send(fallback);
  }
});

app.get('/review/latest/:repo', async (request, reply) => {
  const { repo } = request.params as { repo: string };
  const review = store.getLatestReviewByRepo(repo);
  if (!review) {
    return reply.code(404).send({ message: 'Review not found' });
  }
  return review;
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
