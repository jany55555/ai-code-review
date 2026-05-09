import Anthropic from '@anthropic-ai/sdk';
import type { PullRequestContext, ReviewIssue } from '@ai-code-review/contracts';

const promptFor = (context: PullRequestContext): string => {
  return [
    'You are an expert code reviewer.',
    'Return strict JSON only with fields summary and issues.',
    'Write summary/title/evidence/suggestion in Simplified Chinese.',
    'Each issue requires: id, filePath, line, severity(info|warning|error), title, evidence, suggestion, confidence(0-1), fixPatch(optional).',
    'Focus on correctness, null safety, security risks, and missing tests.',
    `Repository: ${context.repository}`,
    `Pull Request: ${context.pullRequestNumber}`,
    'Diff:',
    context.diff,
  ].join('\n\n');
};

export class ClaudeReviewClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async reviewDiff(context: PullRequestContext): Promise<{ summary: string; issues: ReviewIssue[] }> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: promptFor(context) }],
    });

    const text = response.content.find((block: { type: string }) => block.type === 'text');
    if (!text || text.type !== 'text') {
      return { summary: 'No summary generated.', issues: [] };
    }

    try {
      const parsed = JSON.parse(text.text) as { summary?: string; issues?: ReviewIssue[] };
      return {
        summary: parsed.summary ?? 'No summary generated.',
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      return {
        summary: 'Model output was not valid JSON.',
        issues: [],
      };
    }
  }
}
