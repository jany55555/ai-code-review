import type { IssueSeverity } from './types'

export const severityLabel: Record<IssueSeverity, string> = {
  error: '高',
  warning: '中',
  info: '低',
}

export const severityOrder: Record<IssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

export const buttonClass = 'btn btn-primary'

export const subtleButtonClass = 'btn btn-subtle'

export const inputClass = 'input'

export const panelClass = 'panel'

export const sectionTitleClass = 'section-title'

export const emptyClass = 'empty'
