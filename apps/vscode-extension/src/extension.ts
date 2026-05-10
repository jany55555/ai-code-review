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

type ReviewStatus = '排队中' | '审查中' | '通过' | '有问题' | '失败';

interface ReviewRun {
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

type TreeNode =
  | { type: 'action'; label: string; command: string; arguments?: unknown[] }
  | { type: 'summary'; label: string; description: string; tooltip?: string }
  | { type: 'issue'; issue: ReviewIssue }
  | { type: 'report'; label: string; command: string };

const diagnostics = vscode.languages.createDiagnosticCollection('ai-code-review');
const issues = new Map<string, ReviewIssue>();
const treeChange = new vscode.EventEmitter<void>();
const output = vscode.window.createOutputChannel('AI 代码审查');
let currentReview: ReviewRun | null = null;
let sseAbortController: AbortController | undefined;

const toSeverity = (severity: ReviewIssue['severity']): vscode.DiagnosticSeverity => {
  if (severity === 'error') return vscode.DiagnosticSeverity.Error;
  if (severity === 'warning') return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
};

const getApiUrl = (): string => {
  return vscode.workspace.getConfiguration('aiCodeReview').get<string>('apiUrl') ?? 'http://localhost:8787';
};

const getRepoName = (): string => {
  const firstFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0]
    : undefined;
  const folder = firstFolder?.uri.fsPath;
  if (!folder) {
    output.appendLine('[getRepoName] no workspace folder, fallback demo-repo');
    return 'demo-repo';
  }

  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: folder, encoding: 'utf8' }).trim();
    const normalized = remote.replace(/\.git$/, '');
    const repo = normalized.split('/').pop() ?? firstFolder?.name ?? 'demo-repo';
    output.appendLine(`[getRepoName] resolved repo=${repo}, folder=${folder}`);
    return repo;
  } catch (error) {
    output.appendLine(`[getRepoName] git remote lookup failed: ${String(error)}`);
    return firstFolder?.name ?? 'demo-repo';
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

const applyReview = (review: ReviewRun) => {
  currentReview = review;
  issues.clear();
  for (const issue of review.issues) {
    issues.set(issue.id, issue);
  }
  refreshDiagnostics(review.issues);
  refreshView();
};

async function loadReview() {
  const apiUrl = getApiUrl();
  const repo = getRepoName();
  const response = await fetch(`${apiUrl}/review/latest/${encodeURIComponent(repo)}`);

  if (!response.ok) {
    throw new Error(`Failed to load review: ${response.status}`);
  }

  const review = (await response.json()) as ReviewRun;
  applyReview(review);
  return review;
}

async function connectSse() {
  sseAbortController?.abort();
  sseAbortController = new AbortController();

  const apiUrl = getApiUrl();
  const repo = getRepoName();
  const response = await fetch(`${apiUrl}/review/stream/${encodeURIComponent(repo)}`, { signal: sseAbortController.signal });
  if (!response.ok || !response.body) {
    throw new Error(`SSE 连接失败: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (!sseAbortController.signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const chunk = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf('\n\n');

      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      const payload = JSON.parse(dataLine.slice(6)) as { type: string; review?: ReviewRun };
      if (payload.type === 'review.status' || payload.type === 'review.completed') {
        if (payload.review) applyReview(payload.review);
      }
    }
  }
}

const normalizeIssue = (payload: unknown): ReviewIssue | null => {
  if (!payload || typeof payload !== 'object') return null;
  const maybeIssue = (payload as { issue?: unknown }).issue ?? payload;
  if (!maybeIssue || typeof maybeIssue !== 'object') return null;

  const filePath = (maybeIssue as { filePath?: unknown }).filePath;
  const line = (maybeIssue as { line?: unknown }).line;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (typeof line !== 'number' || !Number.isFinite(line)) return null;

  return maybeIssue as ReviewIssue;
};

async function openIssue(issue: ReviewIssue) {
  output.appendLine(`[openIssue] start file=${issue.filePath} line=${issue.line}`);
  const uri = vscode.Uri.file(issue.filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const line = Math.max(issue.line - 1, 0);
  const pos = new vscode.Position(line, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  output.appendLine('[openIssue] success');
}

async function showReviewReport() {
  if (!currentReview) {
    await vscode.window.showInformationMessage('暂无可查看的审查报告。');
    return;
  }

  const lines = [
    `# 审查报告`,
    `- 仓库: ${currentReview.repository}`,
    `- 提交: ${currentReview.sha}`,
    `- 状态: ${currentReview.status}`,
    `- 触发方式: ${currentReview.trigger ?? 'manual'}`,
    `- 问题数: ${currentReview.issues.length}`,
    '',
    `## 摘要`,
    String(currentReview.summary),
    '',
    `## 问题列表`,
  ];

  if (currentReview.issues.length === 0) {
    lines.push('- 未发现问题。');
  } else {
    currentReview.issues.forEach((issue, idx) => {
      lines.push(`${idx + 1}. [${issue.severity}] ${issue.title}`);
      lines.push(`   - 文件: ${issue.filePath}:${issue.line}`);
      lines.push(`   - 证据: ${issue.evidence}`);
      lines.push(`   - 建议: ${issue.suggestion}`);
    });
  }

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: lines.join('\n'),
  });
  await vscode.window.showTextDocument(doc, { preview: false });
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
  output.appendLine('[activate] extension activated');
  context.subscriptions.push(diagnostics, treeChange, output);

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
    vscode.commands.registerCommand('aiCodeReview.openIssue', async (payload?: unknown) => {
      try {
        const issue = normalizeIssue(payload);
        if (!issue) {
          output.appendLine(`[aiCodeReview.openIssue] invalid payload: ${JSON.stringify(payload)}`);
          output.show(true);
          await vscode.window.showWarningMessage('无法打开问题：缺少有效的文件路径或行号。');
          return;
        }
        await openIssue(issue);
      } catch (error) {
        output.appendLine(`[aiCodeReview.openIssue] failed: ${String(error)}`);
        if (error instanceof Error && error.stack) {
          output.appendLine(error.stack);
        }
        output.show(true);
        throw error;
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiCodeReview.showReport', async () => {
      await showReviewReport();
    }),
  );

  context.subscriptions.push(vscode.window.registerTreeDataProvider('aiCodeReview.issues', new IssueProvider()));

  void loadReview().catch(() => undefined);
  void connectSse().catch(() => undefined);
  context.subscriptions.push(new vscode.Disposable(() => sseAbortController?.abort()));
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

    if (element.type === 'report') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.command = { command: element.command, title: element.label };
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
      { type: 'report', label: '查看审查报告', command: 'aiCodeReview.showReport' },
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
      label: `状态：${review.status}`,
      description: `${review.issues.length} 个问题`,
      tooltip: `${review.summary}${review.errorMessage ? `\n${review.errorMessage}` : ''}`,
    });

    if (review.status === '排队中' || review.status === '审查中') {
      nodes.push({
        type: 'summary',
        label: review.status,
        description: '等待审查结果推送...',
      });
      return nodes;
    }

    if (review.issues.length === 0) {
      nodes.push({
        type: 'summary',
        label: review.status,
        description: '未发现问题。',
      });
      return nodes;
    }

    return [...nodes, ...review.issues.map((issue) => ({ type: 'issue' as const, issue }))];
  }
}

export function deactivate() {
  sseAbortController?.abort();
  diagnostics.dispose();
  treeChange.dispose();
}
