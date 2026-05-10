export interface CommitTestContext {
  repo?: string
  sha: string
  changedFiles: string[]
}

export const buildCommitTestLabel = (context: CommitTestContext): string => {
  return ``
}
