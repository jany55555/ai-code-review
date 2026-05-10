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

export const buttonClass =
  'cursor-pointer rounded-md border border-[var(--vscode-button-border,transparent)] bg-[var(--vscode-button-background)] px-3 py-1 text-xs text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'

export const inputClass =
  'rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-2 py-1 text-xs'

export const panelClass =
  'rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] p-3'

export const emptyClass =
  'rounded-lg border border-dashed border-[var(--vscode-panel-border)] p-3 text-[var(--vscode-descriptionForeground)]'
