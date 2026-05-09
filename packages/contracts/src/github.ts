export interface PullRequestContext {
  repository: string;
  pullRequestNumber: number;
  sha: string;
  diff: string;
}
