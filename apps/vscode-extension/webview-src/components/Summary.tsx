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

  if (review.progress) {
    rows.splice(4, 0, ['进度', `${review.progress.index}/${review.progress.total}`])
    rows.splice(5, 0, ['当前文件', review.progress.filePath])
    rows.splice(6, 0, ['阶段', review.progress.message])
  }

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
