export type ReviewProvider = 'claude' | 'openai' | 'gemini';

export interface PullRequestContext {
  repository: string;
  pullRequestNumber: number;
  sha: string;
  diff: string;
  provider?: ReviewProvider;
  model?: string;
}

export const buildPullRequestContext = (
  repo: string,
  pr: number,
  sha: string,
  diff: string,
  provider?: ReviewProvider,
  model?: string,
): PullRequestContext => ({
  repository: repo,
  pullRequestNumber: pr,
  sha,
  diff,
  provider,
  model,
});
