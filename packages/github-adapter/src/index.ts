export type ReviewProvider = 'claude' | 'openai' | 'gemini';

export interface PullRequestContext {
  repository: string;
  pullRequestNumber: number;
  sha: string;
  diff: string;
  provider?: ReviewProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export const buildPullRequestContext = (
  repo: string,
  pr: number,
  sha: string,
  diff: string,
  provider?: ReviewProvider,
  model?: string,
  apiKey?: string,
  baseUrl?: string,
): PullRequestContext => ({
  repository: repo,
  pullRequestNumber: pr,
  sha,
  diff,
  provider,
  model,
  apiKey,
  baseUrl,
});
