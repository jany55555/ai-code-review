import { buttonClass } from '../constants'

interface ToolbarProps {
  onRefresh: () => void
  onShowReport: () => void
}

export function Toolbar({ onRefresh, onShowReport }: ToolbarProps) {
  return (
    <section className="toolbar" aria-label="功能区">
      <div className="toolbar-title">操作</div>
      <div className="toolbar-actions">
        <button className={buttonClass} onClick={onRefresh}>刷新</button>
        <button className={buttonClass} onClick={onShowReport}>查看报告</button>
      </div>
    </section>
  )
}
