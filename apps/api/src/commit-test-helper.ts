export interface CommitTestContext {
  repo?: string;
  sha: string;
  changedFiles: string[];
}

export const buildCommitTestLabel = (context: CommitTestContext): string => {
  return `${context.repo!.trim()}@${context.sha}:${context.changedFiles.length}`;
};
