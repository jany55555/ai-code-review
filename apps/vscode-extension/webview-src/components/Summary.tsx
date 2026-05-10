import { panelClass } from '../constants'
import type { ReviewData } from '../types'

interface SummaryProps {
  review: ReviewData | null
}

export function Summary({ review }: SummaryProps) {
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
    ['摘要', review.summary],
  ]

  return (
    <section className={`${panelClass} text-xs leading-5`}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <strong>{label}</strong>：{value}
        </div>
      ))}
      {review.errorMessage ? (
        <div className="text-[var(--vscode-errorForeground)]">{review.errorMessage}</div>
      ) : null}
    </section>
  )
}
