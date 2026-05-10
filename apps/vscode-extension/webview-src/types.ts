export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ReviewIssue {
  id: string
  severity: IssueSeverity
  title: string
  filePath: string
  line: number | string
  evidence: string
  suggestion: string
}

export interface ReviewProgress {
  index: number
  total: number
  filePath: string
  message: string
}

export interface ReviewData {
  status: string
  repository: string
  sha: string
  trigger?: string
  summary: string
  errorMessage?: string
  issues?: ReviewIssue[]
  progress?: ReviewProgress
}

export type InitOrUpdateMessage = {
  type: 'init' | 'review.updated'
  payload?: { review?: ReviewData | null }
}

export type InboundMessage = InitOrUpdateMessage | { type: string; payload?: unknown }
