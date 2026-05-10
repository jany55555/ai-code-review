import type { IssueSeverity } from '../types'
import { inputClass, panelClass, sectionTitleClass } from '../constants'

interface FiltersProps {
  severity: 'all' | IssueSeverity
  onSeverityChange: (severity: 'all' | IssueSeverity) => void
  query: string
  onQueryChange: (query: string) => void
}

export function Filters({ severity, onSeverityChange, query, onQueryChange }: FiltersProps) {
  return (
    <section className={`${panelClass} text-xs`}>
      <div className={sectionTitleClass}>筛选</div>
      <div className="filters-row">
        <label className="filter-item">
          <span className="field-label">级别</span>
          <select
            className={inputClass}
            value={severity}
            onChange={event => onSeverityChange(event.target.value as 'all' | IssueSeverity)}
          >
            <option value="all">全部</option>
            <option value="error">高</option>
            <option value="warning">中</option>
            <option value="info">低</option>
          </select>
        </label>
        <label className="filter-item filter-item-search">
          <span className="field-label">搜索</span>
          <input
            className={`${inputClass} w-full`}
            type="text"
            value={query}
            placeholder="标题/路径/证据/建议"
            onChange={event => onQueryChange(event.target.value)}
          />
        </label>
      </div>
    </section>
  )
}
