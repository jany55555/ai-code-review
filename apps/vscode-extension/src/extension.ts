import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';

interface ReviewIssue {
  id: string;
  filePath: string;
  line: number;
  severity: 'info' | 'warning' | 'error';
  title: string;
  evidence: string;
  suggestion: string;
  fixPatch?: string;
}

interface ReviewRun {
  id: string;
  repository: string;
  pullRequestNumber: number;
  sha: string;
  summary: string;
  issues: ReviewIssue[];
  createdAt: string;
  trigger?: 'manual' | 'post-commit' | 'ci';
}

type TreeNode =
  | { type: 'action'; label: string; command: string; arguments?: unknown[] }
  | { type: 'summary'; label: string; description: string; tooltip?: string }
  | { type: 'issue'; issue: ReviewIssue };

const diagnostics = vscode.languages.createDiagnosticCollection('ai-code-review');
const issues = new Map<string, ReviewIssue>();
const treeChange = new vscode.EventEmitter<void>();
let currentReview: ReviewRun | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;

const toSeverity = (severity: ReviewIssue['severity']): vscode.DiagnosticSeverity => {
  if (severity === 'error') return vscode.DiagnosticSeverity.Error;
  if (severity === 'warning') return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
};

const getApiUrl = (): string => {
  return vscode.workspace.getConfiguration('aiCodeReview').get<string>('apiUrl') ?? 'http://localhost:8787';
};

const getRepoName = (): string => {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) return 'demo-repo';

  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: folder, encoding: 'utf8' }).trim();
    const normalized = remote.replace(/\.git$/, '');
    return normalized.split('/').pop() ?? vscode.workspace.workspaceFolders?.[0]?.name ?? 'demo-repo';
  } catch {
    return vscode.workspace.workspaceFolders?.[0]?.name ?? 'demo-repo';
  }
};

const refreshDiagnostics = (issueList: ReviewIssue[]) => {
  diagnostics.clear();

  for (const issue of issueList) {
    const uri = vscode.Uri.file(issue.filePath);
    const line = Math.max(issue.line - 1, 0);
    const range = new vscode.Range(line, 0, line, 1);
    const diagnostic = new vscode.Diagnostic(range, issue.evidence, toSeverity(issue.severity));
    diagnostic.source = 'AI Code Review';
    diagnostic.code = issue.id;
    diagnostics.set(uri, [...(diagnostics.get(uri) ?? []), diagnostic]);
  }
};

const refreshView = () => {
  treeChange.fire();
};

async function loadReview() {
  const apiUrl = getApiUrl();
  const repo = getRepoName();
  const response = await fetch(`${apiUrl}/review/latest/${encodeURIComponent(repo)}`);

  if (!response.ok) {
    throw new Error(`Failed to load review: ${response.status}`);
  }

  const review = (await response.json()) as ReviewRun;
  currentReview = review;
  issues.clear();
  for (const issue of review.issues) {
    issues.set(issue.id, issue);
  }
  refreshDiagnostics(review.issues);
  refreshView();
  return review;
}

async function openIssue(issue: ReviewIssue) {
  const uri = vscode.Uri.file(issue.filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const line = Math.max(issue.line - 1, 0);
  const pos = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

async function applyIssueFix(issue: ReviewIssue) {
  if (!issue.fixPatch) {
    await vscode.window.showInformationMessage('当前问题没有可应用的修复补丁。');
    return;
  }

  const uri = vscode.Uri.file(issue.filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const line = Math.max(issue.line - 1, 0);
  const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, issue.suggestion);
  await vscode.workspace.applyEdit(edit);
  await document.save();
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(diagnostics, treeChange);

  context.subscriptions.push(
    vscode.commands.registerCommand('aiCodeReview.refresh', async () => {
      const output = vscode.window.createOutputChannel('AI 代码审查');
      output.appendLine('正在刷新审查结果...');
      output.show(true);

      try {
        const review = await loadReview();
        output.appendLine(review.summary);
        for (const issue of review.issues) {
          output.appendLine(`${issue.filePath}:${issue.line} ${issue.title}`);
        }
      } catch (error) {
        currentReview = null;
        issues.clear();
        refreshDiagnostics([]);
        refreshView();
        output.appendLine(String(error));
        output.appendLine('暂未找到审查记录，请先触发一次 /review/run。');
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiCodeReview.applyFix', async (issue?: ReviewIssue) => {
      if (!issue) return;
      await applyIssueFix(issue);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiCodeReview.openIssue', async (issue?: ReviewIssue) => {
      if (!issue) return;
      await openIssue(issue);
    }),
  );

  context.subscriptions.push(vscode.window.registerTreeDataProvider('aiCodeReview.issues', new IssueProvider()));

  void loadReview().catch(() => undefined);
  pollTimer = setInterval(() => {
    void loadReview().catch(() => undefined);
  }, 2000);
  context.subscriptions.push(new vscode.Disposable(() => clearInterval(pollTimer)));
}

class IssueProvider implements vscode.TreeDataProvider<TreeNode> {
  readonly onDidChangeTreeData = treeChange.event;

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === 'action') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.command = { command: element.command, title: element.label, arguments: element.arguments };
      return item;
    }

    if (element.type === 'summary') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = element.description;
      item.tooltip = element.tooltip;
      return item;
    }

    const issue = element.issue;
    const item = new vscode.TreeItem(issue.title, vscode.TreeItemCollapsibleState.None);
    item.description = `${issue.filePath}:${issue.line}`;
    item.tooltip = issue.evidence;
    item.contextValue = 'ai-code-review-issue';
    item.command = {
      command: 'aiCodeReview.openIssue',
      title: 'Open Issue',
      arguments: [issue],
    };
    return item;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (element) return [];

    const review = currentReview;
    const nodes: TreeNode[] = [
      { type: 'action', label: '刷新审查结果', command: 'aiCodeReview.refresh' },
    ];

    if (!review) {
      nodes.push({
        type: 'summary',
        label: '暂无审查结果',
        description: '后端产生审查记录后会自动显示，也可手动刷新。',
      });
      return nodes;
    }

    nodes.push({
      type: 'summary',
      label: `PR #${review.pullRequestNumber}`,
      description: `${review.issues.length} 个问题`,
      tooltip: review.summary,
    });

    if (review.issues.length === 0) {
      nodes.push({
        type: 'summary',
        label: '检查通过',
        description: '未发现问题。',
      });
      return nodes;
    }

    return [...nodes, ...review.issues.map((issue) => ({ type: 'issue' as const, issue }))];
  }
}

export function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
  diagnostics.dispose();
  treeChange.dispose();
}
