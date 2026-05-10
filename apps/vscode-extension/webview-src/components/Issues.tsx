import { buttonClass, emptyClass } from '../constants'
import type { ReviewData, ReviewIssue } from '../types'
import { isPendingStatus } from '../utils/review'
import { SeverityBadge } from './SeverityBadge'

interface IssueGroup {
  filePath: string
  issues: ReviewIssue[]
}

interface IssuesProps {
  review: ReviewData | null
  groupedIssues: IssueGroup[]
  filteredCount: number
  onOpenIssue: (issueId: string) => void
  onCopyFixPrompt: (issueId: string) => void
}

function IssueItem({
  issue,
  onOpenIssue,
  onCopyFixPrompt,
}: {
  issue: ReviewIssue
  onOpenIssue: (issueId: string) => void
  onCopyFixPrompt: (issueId: string) => void
}) {
  return (
    <div className="rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2">
      <div className="mb-1 flex items-center gap-2">
        <SeverityBadge severity={issue.severity} />
        <h3 className="m-0 text-[13px] leading-5">{issue.title}</h3>
      </div>
      <div className="mb-1 break-all text-xs text-[var(--vscode-descriptionForeground)]">
        {issue.filePath}:{issue.line}
      </div>
      <p className="m-0 text-xs leading-5 break-words">{issue.evidence}</p>
      <p className="m-0 mt-1 text-xs leading-5 break-words">{issue.suggestion}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={buttonClass} onClick={() => onOpenIssue(issue.id)}>打开问题</button>
        <button className={buttonClass} onClick={() => onCopyFixPrompt(issue.id)}>
          复制修复提示词
        </button>
      </div>
    </div>
  )
}

export function Issues({
  review,
  groupedIssues,
  filteredCount,
  onOpenIssue,
  onCopyFixPrompt,
}: IssuesProps) {
  if (!review) return <section className={emptyClass}>暂无审查结果。</section>
  if (isPendingStatus(review.status)) {
    return <section className={emptyClass}>等待审查结果推送...</section>
  }
  if (filteredCount === 0) {
    const text = review.issues?.length ? '当前筛选条件下无问题。' : '未发现问题。'
    return <section className={emptyClass}>{text}</section>
  }

  return (
    <section className="flex flex-col gap-3">
      {groupedIssues.map(group => (
        <article
          key={group.filePath}
          className="rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] p-3"
        >
          <header className="mb-2 break-all text-xs font-semibold text-[var(--vscode-descriptionForeground)]">
            {group.filePath} ({group.issues.length})
          </header>
          <div className="flex flex-col gap-2">
            {group.issues.map(issue => (
              <IssueItem
                key={issue.id}
                issue={issue}
                onOpenIssue={onOpenIssue}
                onCopyFixPrompt={onCopyFixPrompt}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
