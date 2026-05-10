import { buttonClass, emptyClass, panelClass, sectionTitleClass, subtleButtonClass } from '../constants'
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
    <article className="issue-card">
      <div className="issue-card-head">
        <div className="issue-main">
          <h3 className="issue-title">{issue.title}</h3>
          <div className="issue-path">
            {issue.filePath}:{issue.line}
          </div>
        </div>
        <SeverityBadge severity={issue.severity} />
      </div>

      <div className="issue-section">
        <div className="issue-section-title">证据</div>
        <p className="issue-text">{issue.evidence}</p>
      </div>

      <div className="issue-section">
        <div className="issue-section-title">建议</div>
        <p className="issue-text">{issue.suggestion}</p>
      </div>

      <div className="issue-actions">
        <button className={buttonClass} onClick={() => onOpenIssue(issue.id)}>定位代码</button>
        <button className={subtleButtonClass} onClick={() => onCopyFixPrompt(issue.id)}>
          复制修复提示词
        </button>
      </div>
    </article>
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
    <section className={`${panelClass} issues-panel`}>
      <div className={sectionTitleClass}>问题列表</div>
      {groupedIssues.map(group => (
        <section key={group.filePath} className="issue-group">
          <header className="issue-group-header">
            <span className="issue-group-path">
              {group.filePath}
            </span>
            <span className="issue-group-count">
              {group.issues.length} 条
            </span>
          </header>
          <div className="issue-list">
            {group.issues.map(issue => (
              <IssueItem
                key={issue.id}
                issue={issue}
                onOpenIssue={onOpenIssue}
                onCopyFixPrompt={onCopyFixPrompt}
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  )
}
