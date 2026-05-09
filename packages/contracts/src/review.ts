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

export type ReviewStatus = '排队中' | '审查中' | '通过' | '有问题' | '失败';

export interface ReviewRun {
  id: string;
  repository: string;
  pullRequestNumber: number;
  sha: string;
  summary: string;
  issues: ReviewIssue[];
  createdAt: string;
  updatedAt: string;
  status: ReviewStatus;
  trigger?: 'manual' | 'post-commit' | 'ci';
  errorMessage?: string;
}
