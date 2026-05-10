import React, { useMemo, useState } from 'react'
import { Filters } from './components/Filters'
import { Issues } from './components/Issues'
import { Summary } from './components/Summary'
import { Toolbar } from './components/Toolbar'
import type { IssueSeverity, ReviewData, ReviewIssue } from './types'
import { filterIssues, groupIssuesByFile } from './utils/review'

interface AppProps {
  review: ReviewData | null
  onRefresh: () => void
  onShowReport: () => void
  onOpenIssue: (issueId: string) => void
  onCopyFixPrompt: (issueId: string) => void
}

export function App({
  review,
  onRefresh,
  onShowReport,
  onOpenIssue,
  onCopyFixPrompt,
}: AppProps) {
  const [severity, setSeverity] = useState<'all' | IssueSeverity>('all')
  const [query, setQuery] = useState('')

  const allIssues: ReviewIssue[] = Array.isArray(review?.issues) ? review.issues : []

  const filteredIssues = useMemo(
    () => filterIssues(allIssues, severity, query),
    [allIssues, severity, query],
  )

  const groupedIssues = useMemo(
    () => groupIssuesByFile(filteredIssues),
    [filteredIssues],
  )

  return (
    <main className="app-root">
      <Toolbar onRefresh={onRefresh} onShowReport={onShowReport} />
      <Summary review={review} />
      <Filters
        severity={severity}
        onSeverityChange={setSeverity}
        query={query}
        onQueryChange={setQuery}
      />
      <Issues
        review={review}
        groupedIssues={groupedIssues}
        filteredCount={filteredIssues.length}
        onOpenIssue={onOpenIssue}
        onCopyFixPrompt={onCopyFixPrompt}
      />
    </main>
  )
}
