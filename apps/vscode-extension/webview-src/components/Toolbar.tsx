import { buttonClass } from '../constants'

interface ToolbarProps {
  onRefresh: () => void
  onShowReport: () => void
}

export function Toolbar({ onRefresh, onShowReport }: ToolbarProps) {
  return (
    <section className="flex flex-wrap items-center gap-2" aria-label="功能区">
      <button className={buttonClass} onClick={onRefresh}>刷新</button>
      <button className={buttonClass} onClick={onShowReport}>查看报告</button>
    </section>
  )
}
