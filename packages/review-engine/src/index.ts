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

const splitDiffByFile = (rawDiff: string): Array<{ filePath: string; diff: string }> => {
  const lines = rawDiff.split('\n');
  const chunks: Array<{ filePath: string; diff: string }> = [];

  let currentFilePath = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentFilePath || currentLines.length === 0) return;
    chunks.push({ filePath: currentFilePath, diff: currentLines.join('\n') });
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flush();
      currentLines = [line];
      const match = line.match(/ b\/(.+)$/);
      currentFilePath = match?.[1] ?? 'unknown';
      continue;
    }

    if (currentLines.length > 0) {
      currentLines.push(line);
    }
  }

  flush();
  return chunks;
};

export const runReview = async (
  context: PullRequestContext,
  modelClient: ReviewModelClient,
  onProgress?: (progress: { index: number; total: number; filePath: string }) => void,
): Promise<ReviewRun> => {
  const filtered = filterDiff(context.diff);
  const fileDiffs = splitDiffByFile(filtered);

  if (fileDiffs.length === 0) {
    return {
      id: `review_${Date.now()}`,
      repository: context.repository,
      pullRequestNumber: context.pullRequestNumber,
      sha: context.sha,
      summary: '没有可审查的代码变更。',
      issues: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: '通过',
    };
  }

  const summaries: string[] = [];
  const allIssues: ReviewIssue[] = [];

  for (let i = 0; i < fileDiffs.length; i += 1) {
    const item = fileDiffs[i];
    onProgress?.({ index: i + 1, total: fileDiffs.length, filePath: item.filePath });

    const { summary, issues } = await modelClient.reviewDiff({ ...context, diff: item.diff });
    if (summary?.trim()) summaries.push(`[${item.filePath}] ${summary.trim()}`);

    for (const issue of issues) {
      allIssues.push({
        ...issue,
        id: `${item.filePath}:${issue.id}`,
      });
    }
  }

  return {
    id: `review_${Date.now()}`,
    repository: context.repository,
    pullRequestNumber: context.pullRequestNumber,
    sha: context.sha,
    summary: summaries.join('\n'),
    issues: allIssues,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: allIssues.length === 0 ? '通过' : '有问题',
  };
};
