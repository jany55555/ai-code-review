import type { PullRequestContext, ReviewIssue, ReviewRun } from '@ai-code-review/contracts';

export interface ReviewModelClient {
  reviewDiff(context: PullRequestContext): Promise<{ summary: string; issues: ReviewIssue[] }>;
}

const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.lock', '.css', '.scss', '.less', '.json']);

export const filterDiff = (rawDiff: string): string => {
  const lines = rawDiff.split('\n');
  const kept: string[] = [];
  let skipCurrent = false;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/ b\/(.+)$/);
      const file = match?.[1] ?? '';
      const ext = file.includes('.') ? `.${file.split('.').pop()}` : '';
      skipCurrent = SKIP_EXTENSIONS.has(ext);
    }
    if (!skipCurrent) {
      kept.push(line);
    }
  }

  return kept.join('\n');
};

export const runReview = async (
  context: PullRequestContext,
  modelClient: ReviewModelClient,
): Promise<ReviewRun> => {
  const filtered = filterDiff(context.diff);
  const { summary, issues } = await modelClient.reviewDiff({ ...context, diff: filtered });

  return {
    id: `review_${Date.now()}`,
    repository: context.repository,
    pullRequestNumber: context.pullRequestNumber,
    sha: context.sha,
    summary,
    issues,
    createdAt: new Date().toISOString(),
  };
};
