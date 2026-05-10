import { useMemo, useState } from 'react'
import { panelClass, sectionTitleClass } from '../constants'
import type { ReviewData } from '../types'

interface SummaryProps {
  review: ReviewData | null
}

const SUMMARY_COLLAPSE_THRESHOLD = 140

export function Summary({ review }: SummaryProps) {
  const [expanded, setExpanded] = useState(false)

  if (!review) {
    return (
      <section className={`${panelClass} text-xs leading-5`}>
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

  const shouldCollapse = review.summary.length > SUMMARY_COLLAPSE_THRESHOLD
  const summaryText = useMemo(() => {
    if (!shouldCollapse || expanded) return review.summary
    return `${review.summary.slice(0, SUMMARY_COLLAPSE_THRESHOLD)}...`
  }, [expanded, review.summary, shouldCollapse])

  if (review.progress) {
    rows.splice(4, 0, ['进度', `${review.progress.index}/${review.progress.total}`])
    rows.splice(5, 0, ['当前文件', review.progress.filePath])
    rows.splice(6, 0, ['阶段', review.progress.message])
  }

  return (
    <section className={`${panelClass} text-xs leading-5`}>
      <div className={sectionTitleClass}>审查概览</div>
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[56px_1fr] items-start gap-2">
            <strong className="text-[var(--vscode-descriptionForeground)]">{label}</strong>
            <span className="break-all">{value}</span>
          </div>
        ))}

        <div className="grid grid-cols-[56px_1fr] items-start gap-2">
          <strong className="text-[var(--vscode-descriptionForeground)]">摘要</strong>
          <div>
            <p className="m-0 break-words whitespace-pre-wrap">{summaryText}</p>
            {shouldCollapse ? (
              <button
                className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[var(--vscode-textLink-foreground)] hover:underline"
                onClick={() => setExpanded(value => !value)}
              >
                {expanded ? '收起' : '展开'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {review.errorMessage ? (
        <div className="mt-2 text-[var(--vscode-errorForeground)]">{review.errorMessage}</div>
      ) : null}
    </section>
  )
}
