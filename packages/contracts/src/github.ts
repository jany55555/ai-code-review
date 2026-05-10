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
