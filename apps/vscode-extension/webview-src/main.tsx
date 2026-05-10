import React, { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import type { InitOrUpdateMessage, InboundMessage, ReviewData } from './types'

declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void }

const vscode = acquireVsCodeApi()

function post(message: unknown) {
  vscode.postMessage(message)
}

function isInitOrUpdateMessage(message: InboundMessage): message is InitOrUpdateMessage {
  return message.type === 'init' || message.type === 'review.updated'
}

function ReviewWebviewRoot() {
  const [review, setReview] = useState<ReviewData | null>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent<InboundMessage>) => {
      const message = event.data
      if (!message || typeof message !== 'object') return
      if (isInitOrUpdateMessage(message)) {
        setReview(message.payload?.review ?? null)
      }
    }

    window.addEventListener('message', onMessage)
    post({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <App
      review={review}
      onRefresh={() => post({ type: 'action.refresh' })}
      onShowReport={() => post({ type: 'action.showReport' })}
      onOpenIssue={issueId => post({ type: 'action.openIssue', issueId })}
      onCopyFixPrompt={issueId => post({ type: 'action.copyFixPrompt', issueId })}
    />
  )
}

const app = document.getElementById('app')
if (!app) {
  console.error('[reviewView] Fatal: #app container not found in DOM. Webview will not render.')
} else {
  createRoot(app).render(
    <StrictMode>
      <ReviewWebviewRoot />
    </StrictMode>,
  )
}
