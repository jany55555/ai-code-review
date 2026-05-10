const vscode = acquireVsCodeApi()

const state = {
  review: null,
}

const severityLabel = {
  error: '高',
  warning: '中',
  info: '低',
}

const app = document.getElementById('app')

if (!app) {
  console.error('[reviewView] Fatal: #app container not found in DOM. Webview will not render.')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function post(message) {
  vscode.postMessage(message)
}

function renderToolbar() {
  return `
    <section class="toolbar" aria-label="功能区">
      <button data-action="refresh">刷新</button>
      <button data-action="showReport">查看报告</button>
    </section>
  `
}

function renderSummary(review) {
  if (!review) {
    return '<section class="summary">暂无审查结果，等待后端推送或手动刷新。</section>'
  }

  return `
    <section class="summary">
      <div><strong>状态</strong>：${escapeHtml(review.status)}</div>
      <div><strong>仓库</strong>：${escapeHtml(review.repository)}</div>
      <div><strong>提交</strong>：${escapeHtml(review.sha)}</div>
      <div><strong>触发</strong>：${escapeHtml(review.trigger ?? 'manual')}</div>
      <div><strong>摘要</strong>：${escapeHtml(review.summary)}</div>
      ${review.errorMessage ? `<div class="error">${escapeHtml(review.errorMessage)}</div>` : ''}
    </section>
  `
}

function renderIssues(review) {
  if (!review) return ''

  if (review.status === '排队中' || review.status === '审查中') {
    return '<section class="empty">等待审查结果推送...</section>'
  }

  if (!review.issues || review.issues.length === 0) {
    return '<section class="empty">未发现问题。</section>'
  }

  const cards = review.issues
    .map(issue => {
      return `
        <article class="issue-card" data-issue-id="${escapeHtml(issue.id)}">
          <header class="issue-card-header">
            <span class="badge badge-${escapeHtml(issue.severity)}">${escapeHtml(severityLabel[issue.severity] ?? issue.severity)}</span>
            <h3>${escapeHtml(issue.title)}</h3>
          </header>
          <div class="meta">${escapeHtml(issue.filePath)}:${escapeHtml(issue.line)}</div>
          <p class="evidence">${escapeHtml(issue.evidence)}</p>
          <p class="suggestion">${escapeHtml(issue.suggestion)}</p>
          <div class="card-actions">
            <button data-action="openIssue" data-issue-id="${escapeHtml(issue.id)}">打开问题</button>
            <button data-action="copyFixPrompt" data-issue-id="${escapeHtml(issue.id)}">复制修复提示词</button>
          </div>
        </article>
      `
    })
    .join('')

  return `<section class="issues">${cards}</section>`
}

function render() {
  if (!app) return
  app.innerHTML = `
    ${renderToolbar()}
    ${renderSummary(state.review)}
    ${renderIssues(state.review)}
  `
}

function handleClick(event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  const action = target.dataset.action
  if (!action) return

  if (action === 'refresh') {
    post({ type: 'action.refresh' })
    return
  }

  if (action === 'showReport') {
    post({ type: 'action.showReport' })
    return
  }

  const issueId = target.dataset.issueId
  if (!issueId) return

  if (action === 'openIssue') {
    post({ type: 'action.openIssue', issueId })
    return
  }

  if (action === 'copyFixPrompt') {
    post({ type: 'action.copyFixPrompt', issueId })
  }
}

window.addEventListener('message', event => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (message.type === 'init' || message.type === 'review.updated') {
    state.review = message.payload?.review ?? null
    render()
  }
})

document.addEventListener('click', handleClick)
render()
post({ type: 'ready' })
