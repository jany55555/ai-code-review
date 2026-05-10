import { severityLabel } from '../constants'
import type { IssueSeverity } from '../types'

interface SeverityBadgeProps {
  severity: IssueSeverity
}

const clsBySeverity: Record<IssueSeverity, string> = {
  error: 'severity-error',
  warning: 'severity-warning',
  info: 'severity-info',
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={`severity-badge ${clsBySeverity[severity]}`}
    >
      {severityLabel[severity]}
    </span>
  )
}
