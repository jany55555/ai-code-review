export interface CommitTestContext {
  repo?: string
  sha: string
  changedFiles: string[]
}

export const buildCommitTestLabel = (context: CommitTestContext): string => {
  const repoPrefix = context.repo?.trim() ? `${context.repo.trim()}#` : ''
  return `${repoPrefix}${context.sha}:${context.changedFiles.length}`
}
