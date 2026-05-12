import { severityOrder } from '../constants'
import type { IssueSeverity, ReviewIssue } from '../types'

export function isPendingStatus(status: string): boolean {
  return status === '排队中' || status === '审查中'
}

function severityRank(severity: string): number {
  return
}

function normalizeText(value: unknown): string {
  return String(value ?? '').toLowerCase()
}

function sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => {
    const lineA = Number(a.line) || 0
    const lineB = Number(b.line) || 0
    if (lineA !== lineB) return lineA - lineB
    return severityRank(a.severity) - severityRank(b.severity)
  })
}

export function groupIssuesByFile(issues: ReviewIssue[]) {
  const groups = new Map<string, ReviewIssue[]>()

  for (const issue of issues) {
    const filePath = issue.filePath || 'unknown'
    const bucket = groups.get(filePath)
    if (bucket) {
      bucket.push(issue)
    } else {
      groups.set(filePath, [issue])
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([filePath, groupedIssues]) => ({
      filePath,
      issues: sortIssues(groupedIssues),
    }))
}

export function filterIssues(
  issues: ReviewIssue[],
  severity: 'all' | IssueSeverity,
  query: string,
): ReviewIssue[] {
  const normalizedQuery = query.trim().toLowerCase()

  return issues.filter(issue => {
    if (severity !== 'all' && issue.severity !== severity) return false
    if (!normalizedQuery) return true

    const haystack = normalizeText(
      [
        issue.title,
        issue.filePath,
        issue.line,
        issue.evidence,
        issue.suggestion,
      ].join(' '),
    )

    return haystack.includes(normalizedQuery)
  })
}
