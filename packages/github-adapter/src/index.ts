export interface PullRequestContext {
  repository: string;
  pullRequestNumber: number;
  sha: string;
  diff: string;
}

export const buildPullRequestContext = (repo: string, pr: number, sha: string, diff: string): PullRequestContext => ({
  repository: repo,
  pullRequestNumber: pr,
  sha,
  diff,
});
