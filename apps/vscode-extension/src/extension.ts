import * as vscode from 'vscode'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

interface ReviewIssue {
  id: string
  filePath: string
  line: number
  severity: 'info' | 'warning' | 'error'
  title: string
  evidence: string
  suggestion: string
  fixPatch?: string
}

type ReviewStatus = '排队中' | '审查中' | '通过' | '有问题' | '失败'

interface ReviewProgress {
  index: number
  total: number
  filePath: string
  message: string
}

interface ReviewRun {
  id: string
  repository: string
  pullRequestNumber: number
  sha: string
  summary: string
  issues: ReviewIssue[]
  createdAt: string
  updatedAt: string
  status: ReviewStatus
  trigger?: 'manual' | 'post-commit' | 'ci'
  errorMessage?: string
  progress?: ReviewProgress
}

interface ViewState {
  review: ReviewRun | null
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'action.refresh' }
  | { type: 'action.showReport' }
  | { type: 'action.openIssue'; issueId: string }
  | { type: 'action.copyFixPrompt'; issueId: string }

const diagnostics =
  vscode.languages.createDiagnosticCollection('ai-code-review')
const issues = new Map<string, ReviewIssue>()
const output = vscode.window.createOutputChannel('AI 代码审查')
let currentReview: ReviewRun | null = null
let sseAbortController: AbortController | undefined
let sseRetryTimer: ReturnType<typeof setTimeout> | undefined
let reviewWebviewProvider: ReviewWebviewProvider | undefined

const toSeverity = (
  severity: ReviewIssue['severity'],
): vscode.DiagnosticSeverity => {
  if (severity === 'error') return vscode.DiagnosticSeverity.Error
  if (severity === 'warning') return vscode.DiagnosticSeverity.Warning
  return vscode.DiagnosticSeverity.Information
}

const getApiUrl = (): string => {
  return (
    vscode.workspace.getConfiguration('aiCodeReview').get<string>('apiUrl') ??
    'http://localhost:8787'
  )
}

const getReviewProvider = (): 'claude' | 'openai' | 'gemini' => {
  const provider = vscode.workspace
    .getConfiguration('aiCodeReview')
    .get<string>('provider')
  if (provider === 'openai' || provider === 'gemini') return provider
  return 'claude'
}

const getReviewModel = (): string => {
  return (
    vscode.workspace.getConfiguration('aiCodeReview').get<string>('model') ??
    'claude-sonnet-4-6'
  )
}

const getModelApiKey = (): string | undefined => {
  const value = vscode.workspace
    .getConfiguration('aiCodeReview')
    .get<string>('modelApiKey')
    ?.trim()
  return value ? value : undefined
}

const getModelBaseUrl = (): string | undefined => {
  const value = vscode.workspace
    .getConfiguration('aiCodeReview')
    .get<string>('modelBaseUrl')
    ?.trim()
  return value ? value : undefined
}

const getFirstWorkspaceFolder = (): vscode.WorkspaceFolder | undefined => {
  return vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0]
    : undefined
}

const getRepoName = (): string => {
  const firstFolder = getFirstWorkspaceFolder()
  const folder = firstFolder?.uri.fsPath
  if (!folder) {
    output.appendLine('[getRepoName] no workspace folder, fallback demo-repo')
    return 'demo-repo'
  }

  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: folder,
      encoding: 'utf8',
    }).trim()
    const normalized = remote.replace(/\.git$/, '')
    const repo = normalized.split('/').pop() ?? firstFolder?.name ?? 'demo-repo'
    output.appendLine(`[getRepoName] resolved repo=${repo}, folder=${folder}`)
    return repo
  } catch (error) {
    output.appendLine(
      `[getRepoName] git remote lookup failed: ${String(error)}`,
    )
    return firstFolder?.name ?? 'demo-repo'
  }
}

const refreshDiagnostics = (issueList: ReviewIssue[]) => {
  diagnostics.clear()

  for (const issue of issueList) {
    const resolvedPath = resolveIssueFilePath(issue.filePath)
    const uri = vscode.Uri.file(resolvedPath)
    const line = Math.max(issue.line - 1, 0)
    const range = new vscode.Range(line, 0, line, 1)
    const diagnostic = new vscode.Diagnostic(
      range,
      issue.evidence,
      toSeverity(issue.severity),
    )
    diagnostic.source = 'AI Code Review'
    diagnostic.code = issue.id
    diagnostics.set(uri, [...(diagnostics.get(uri) ?? []), diagnostic])
  }
}

const buildViewState = (): ViewState => ({
  review: currentReview,
})

const applyReview = (review: ReviewRun) => {
  currentReview = review
  issues.clear()
  for (const issue of review.issues) {
    issues.set(issue.id, issue)
  }
  refreshDiagnostics(review.issues)
  reviewWebviewProvider?.postState(buildViewState())
}

async function loadReview() {
  const apiUrl = getApiUrl()
  const repo = getRepoName()
  const response = await fetch(
    `${apiUrl}/review/latest/${encodeURIComponent(repo)}`,
  )

  if (!response.ok) {
    throw new Error(`Failed to load review: ${response.status}`)
  }

  const review = (await response.json()) as ReviewRun
  applyReview(review)
  return review
}

async function connectSse() {
  sseAbortController?.abort()
  sseAbortController = new AbortController()

  const apiUrl = getApiUrl()
  const repo = getRepoName()
  output.appendLine(`[sse] connecting ${apiUrl}/review/stream/${repo}`)

  const response = await fetch(
    `${apiUrl}/review/stream/${encodeURIComponent(repo)}`,
    { signal: sseAbortController.signal },
  )
  if (!response.ok || !response.body) {
    throw new Error(`SSE 连接失败: ${response.status}`)
  }

  output.appendLine('[sse] connected')

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (!sseAbortController.signal.aborted) {
    const { value, done } = await reader.read()
    if (done) {
      output.appendLine('[sse] stream closed by server')
      break
    }
    buffer += decoder.decode(value, { stream: true })

    let boundaryIndex = buffer.indexOf('\n\n')
    while (boundaryIndex !== -1) {
      const chunk = buffer.slice(0, boundaryIndex).trim()
      buffer = buffer.slice(boundaryIndex + 2)
      boundaryIndex = buffer.indexOf('\n\n')

      const dataLine = chunk.split('\n').find(line => line.startsWith('data: '))
      if (!dataLine) continue
      const payload = JSON.parse(dataLine.slice(6)) as {
        type: string
        review?: ReviewRun
      }
      if (
        payload.type === 'review.status' ||
        payload.type === 'review.progress' ||
        payload.type === 'review.completed'
      ) {
        if (payload.review) applyReview(payload.review)
      }
    }
  }
}

function startSseLoop() {
  sseRetryTimer && clearTimeout(sseRetryTimer)

  const run = async () => {
    try {
      await connectSse()
    } catch (error) {
      if (!sseAbortController?.signal.aborted) {
        output.appendLine(`[sse] connection error: ${String(error)}`)
      }
    }

    if (sseAbortController?.signal.aborted) return

    sseRetryTimer = setTimeout(() => {
      void run()
    }, 3000)
  }

  void run()
}

const normalizeIssue = (payload: unknown): ReviewIssue | null => {
  if (!payload || typeof payload !== 'object') return null
  const maybeIssue = (payload as { issue?: unknown }).issue ?? payload
  if (!maybeIssue || typeof maybeIssue !== 'object') return null

  const filePath = (maybeIssue as { filePath?: unknown }).filePath
  const line = (maybeIssue as { line?: unknown }).line
  if (typeof filePath !== 'string' || filePath.length === 0) return null
  if (typeof line !== 'number' || !Number.isFinite(line)) return null

  return maybeIssue as ReviewIssue
}

const resolveIssueFilePath = (filePath: string): string => {
  if (path.isAbsolute(filePath)) return filePath
  const firstFolder = getFirstWorkspaceFolder()
  if (firstFolder) return path.join(firstFolder.uri.fsPath, filePath)
  const fallback = path.join(process.cwd(), filePath)
  output.appendLine(
    `[resolveIssueFilePath] fallback cwd=${process.cwd()} resolved=${fallback}`,
  )
  return fallback
}

async function openIssue(issue: ReviewIssue) {
  const resolvedPath = resolveIssueFilePath(issue.filePath)
  output.appendLine(
    `[openIssue] start file=${issue.filePath} resolved=${resolvedPath} line=${issue.line}`,
  )
  const uri = vscode.Uri.file(resolvedPath)
  const document = await vscode.workspace.openTextDocument(uri)
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
  })
  const line = Math.max(issue.line - 1, 0)
  const pos = new vscode.Position(line, 0)
  editor.selection = new vscode.Selection(pos, pos)
  editor.revealRange(
    new vscode.Range(pos, pos),
    vscode.TextEditorRevealType.InCenter,
  )
  output.appendLine('[openIssue] success')
}

const buildFixPrompt = (issue: ReviewIssue): string => {
  return [
    '你是资深软件工程师。请直接修复这个 bug，并产出可直接应用的补丁。',
    '',
    '【问题信息】',
    `- 文件：${issue.filePath}`,
    `- 行号：${issue.line}`,
    `- 问题标题：${issue.title}`,
    `- 严重级别：${issue.severity}`,
    `- 证据：${issue.evidence}`,
    `- 修复建议：${issue.suggestion}`,
    '',
    '【输出要求】',
    '1. 先基于证据定位根因，再进行修复；禁止与问题无关的猜测性改动',
    '2. 直接修复好 bug，优先最小改动，仅修改必要代码',
    '3. 保持现有代码风格与命名，不做无关重构',
    '4. 输出顺序：先给 1-3 行修复思路，再给最小验证步骤，最后给 unified diff',
    '5. unified diff 必须放在且仅放在一个 ```diff 代码块中；代码块外禁止输出任何补丁内容',
    '6. diff 必须包含正确的文件路径与上下文，确保可应用；若信息不足，输出 MISSING_INFO: <缺失信息>，且不要输出 diff',
    '7. 修复后不引入新的编译或 lint 告警',
  ].join('\n')
}

async function copyFixPrompt(issue: ReviewIssue) {
  const prompt = buildFixPrompt(issue)
  await vscode.env.clipboard.writeText(prompt)
  await vscode.window.showInformationMessage('修复提示词已复制到剪贴板。')
}

async function showReviewReport() {
  if (!currentReview) {
    await vscode.window.showInformationMessage('暂无可查看的审查报告。')
    return
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
  ]

  if (currentReview.issues.length === 0) {
    lines.push('- 未发现问题。')
  } else {
    currentReview.issues.forEach((issue, idx) => {
      lines.push(`${idx + 1}. [${issue.severity}] ${issue.title}`)
      lines.push(`   - 文件: ${issue.filePath}:${issue.line}`)
      lines.push(`   - 证据: ${issue.evidence}`)
      lines.push(`   - 建议: ${issue.suggestion}`)
    })
  }

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: lines.join('\n'),
  })
  await vscode.window.showTextDocument(doc, { preview: false })
}

class ReviewWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    }
    view.webview.html = this.getHtml(view.webview)

    view.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      try {
        await this.handleMessage(message)
      } catch (error) {
        this.postMessage({
          type: 'action.result',
          ok: false,
          error: String(error),
        })
      }
    })

    this.postState(buildViewState())
  }

  postState(state: ViewState) {
    this.postMessage({ type: 'review.updated', payload: state })
  }

  private postMessage(message: unknown) {
    void this.view?.webview.postMessage(message)
  }

  private async handleMessage(message: WebviewMessage) {
    if (message.type === 'ready') {
      this.postMessage({ type: 'init', payload: buildViewState() })
      return
    }

    if (message.type === 'action.refresh') {
      await vscode.commands.executeCommand('aiCodeReview.refresh')
      return
    }

    if (message.type === 'action.showReport') {
      await vscode.commands.executeCommand('aiCodeReview.showReport')
      return
    }

    if (message.type === 'action.openIssue') {
      const issue = issues.get(message.issueId)
      if (!issue) throw new Error('未找到问题项。')
      await openIssue(issue)
      return
    }

    if (message.type === 'action.copyFixPrompt') {
      const issue = issues.get(message.issueId)
      if (!issue) throw new Error('未找到问题项。')
      await copyFixPrompt(issue)
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'reviewView.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'reviewView.css'),
    )
    const nonce = String(Date.now())
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>AI Code Review</title>
</head>
<body style="margin:0;padding:0;overflow-x:hidden;max-width:100%;">
  <div id="app" style="max-width:100%;overflow-x:hidden;"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

export function activate(context: vscode.ExtensionContext) {
  output.appendLine('[activate] extension activated')
  reviewWebviewProvider = new ReviewWebviewProvider(context.extensionUri)
  context.subscriptions.push(diagnostics, output)

  context.subscriptions.push(
    vscode.commands.registerCommand('aiCodeReview.refresh', async () => {
      const channel = vscode.window.createOutputChannel('AI 代码审查')
      channel.appendLine('正在刷新审查结果...')
      channel.show(true)

      try {
        const review = await loadReview()
        channel.appendLine(review.summary)
        for (const issue of review.issues) {
          channel.appendLine(`${issue.filePath}:${issue.line} ${issue.title}`)
        }
      } catch (error) {
        currentReview = null
        issues.clear()
        refreshDiagnostics([])
        reviewWebviewProvider?.postState(buildViewState())
        channel.appendLine(String(error))
        channel.appendLine(
          `暂未找到审查记录，请先触发一次 /review/run（当前配置: ${getReviewProvider()}/${getReviewModel()}）。`,
        )
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'aiCodeReview.openIssue',
      async (payload?: unknown) => {
        try {
          const issue = normalizeIssue(payload)
          if (!issue) {
            output.appendLine(
              `[aiCodeReview.openIssue] invalid payload: ${JSON.stringify(payload)}`,
            )
            output.show(true)
            await vscode.window.showWarningMessage(
              '无法打开问题：缺少有效的文件路径或行号。',
            )
            return
          }
          await openIssue(issue)
        } catch (error) {
          output.appendLine(`[aiCodeReview.openIssue] failed: ${String(error)}`)
          if (error instanceof Error && error.stack) {
            output.appendLine(error.stack)
          }
          output.show(true)
          throw error
        }
      },
    ),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'aiCodeReview.copyFixPrompt',
      async (payload?: unknown) => {
        const issue = normalizeIssue(payload)
        if (!issue) {
          await vscode.window.showWarningMessage('无法复制：当前问题数据无效。')
          return
        }
        await copyFixPrompt(issue)
      },
    ),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('aiCodeReview.showReport', async () => {
      await showReviewReport()
    }),
  )

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'aiCodeReview.issues',
      reviewWebviewProvider,
    ),
  )

  void loadReview().catch(() => undefined)
  startSseLoop()
  context.subscriptions.push(
    new vscode.Disposable(() => {
      sseAbortController?.abort()
      if (sseRetryTimer) clearTimeout(sseRetryTimer)
    }),
  )
}

export function deactivate() {
  sseAbortController?.abort()
  diagnostics.dispose()
}
