export type Severity = 'info' | 'warning' | 'error';

export interface ReviewIssue {
  id: string;
  filePath: string;
  line: number;
  severity: Severity;
  title: string;
  evidence: string;
  suggestion: string;
  fixPatch?: string;
  confidence: number;
}

export interface ReviewRun {
  id: string;
  repository: string;
  pullRequestNumber: number;
  sha: string;
  summary: string;
  issues: ReviewIssue[];
  createdAt: string;
  trigger?: 'manual' | 'post-commit' | 'ci';
}
