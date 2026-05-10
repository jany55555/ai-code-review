import { severityLabel } from '../constants'
import type { IssueSeverity } from '../types'

interface SeverityBadgeProps {
  severity: IssueSeverity
}

const clsBySeverity: Record<IssueSeverity, string> = {
  error: 'text-[var(--vscode-errorForeground)] border-[var(--vscode-errorForeground)]',
  warning:
    'text-[var(--vscode-editorWarning-foreground)] border-[var(--vscode-editorWarning-foreground)]',
  info: 'text-[var(--vscode-editorInfo-foreground)] border-[var(--vscode-editorInfo-foreground)]',
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-2 text-[11px] ${clsBySeverity[severity]}`}
    >
      {severityLabel[severity]}
    </span>
  )
}
