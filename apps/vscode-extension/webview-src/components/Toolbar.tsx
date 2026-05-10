import { buttonClass } from '../constants'

interface ToolbarProps {
  onRefresh: () => void
  onShowReport: () => void
}

export function Toolbar({ onRefresh, onShowReport }: ToolbarProps) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] p-2.5" aria-label="功能区">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
        操作
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={buttonClass} onClick={onRefresh}>刷新</button>
        <button className={buttonClass} onClick={onShowReport}>查看报告</button>
      </div>
    </section>
  )
}
