import { useMemo, useState } from 'react'
import { panelClass, sectionTitleClass } from '../constants'
import type { ReviewData } from '../types'

interface SummaryProps {
  review: ReviewData | null
}

const SUMMARY_COLLAPSE_THRESHOLD = 140

export function Summary({ review }: SummaryProps) {
  const [expanded, setExpanded] = useState(false)
  const summary = review?.summary ?? ''
  const shouldCollapse = summary.length > SUMMARY_COLLAPSE_THRESHOLD
  const summaryText = useMemo(() => {
    if (!shouldCollapse || expanded) return summary
    return `${summary.slice(0, SUMMARY_COLLAPSE_THRESHOLD)}...`
  }, [expanded, summary, shouldCollapse])

  if (!review) {
    return (
      <section className={panelClass}>
        暂无审查结果，等待后端推送或手动刷新。
      </section>
    )
  }

  const rows: Array<[string, string | undefined]> = [
    ['状态', review.status],
    ['仓库', review.repository],
    ['提交', review.sha],
    ['触发', review.trigger ?? 'manual'],
  ]

  if (review.progress) {
    rows.splice(4, 0, ['进度', `${review.progress.index}/${review.progress.total}`])
    rows.splice(5, 0, ['当前文件', review.progress.filePath])
    rows.splice(6, 0, ['阶段', review.progress.message])
  }

  return (
    <section className={panelClass}>
      <div className={sectionTitleClass}>审查概览</div>
      <div className="summary-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="summary-row">
            <strong className="summary-label">{label}</strong>
            <span className="summary-value">{value}</span>
          </div>
        ))}

        <div className="summary-row">
          <strong className="summary-label">摘要</strong>
          <div>
            <p className="summary-text">{summaryText}</p>
            {shouldCollapse ? (
              <button
                className="link-button"
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? '收起' : '展开'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {review.errorMessage ? (
        <div className="error-text">{review.errorMessage}</div>
      ) : null}
    </section>
  )
}
