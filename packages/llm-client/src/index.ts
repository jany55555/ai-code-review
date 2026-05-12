import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type {
  PullRequestContext,
  ReviewIssue,
  ReviewProvider,
} from '@ai-code-review/contracts';

const promptFor = (context: PullRequestContext): string => {
  return [
    'You are an expert code reviewer.',
    'Return strict JSON only with fields summary and issues.',
    'Write summary/title/evidence/suggestion in Simplified Chinese.',
    'Each issue requires: id, filePath, line, severity(info|warning|error), title, evidence, suggestion, confidence(0-1), fixPatch(optional).',
    'Focus on correctness, null safety, security risks, and missing tests.',
    'Do not report a bug without direct evidence from the provided code.',
    'For structure and syntax claims (missing closing tag, import not found, duplicate key, type error), verify against complete file context before deciding.',
    'If evidence is insufficient, do not create an issue.',
    'Keep evidence factual: include exact code snippet and why it proves the issue.',
    'Set confidence by evidence strength: high confidence only when directly provable from code; lower confidence for uncertain findings.',
    'Avoid guessing from partial diff patterns.',
    `Repository: ${context.repository}`,
    `Pull Request: ${context.pullRequestNumber}`,
    'Diff:',
    context.diff,
  ].join('\n\n');
};

const extractJson = (text: string): string => {
  // 提取 markdown 代码块中的 JSON（```json ... ``` 或 ``` ... ```）
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // 提取裸 JSON 对象
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return text.trim();
};

const parseReviewOutput = (text: string): { summary: string; issues: ReviewIssue[] } => {
  try {
    const parsed = JSON.parse(extractJson(text)) as { summary?: string; issues?: ReviewIssue[] };
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
};

const normalizeProvider = (provider?: ReviewProvider): ReviewProvider => {
  return provider ?? 'claude';
};

export class MultiProviderReviewClient {
  private createAnthropicClient(context: PullRequestContext): Anthropic {
    return new Anthropic({
      apiKey: context.apiKey ?? process.env.ANTHROPIC_API_KEY,
      baseURL: context.baseUrl || process.env.ANTHROPIC_BASE_URL,
    });
  }

  private createOpenAIClient(context: PullRequestContext): OpenAI {
    return new OpenAI({
      apiKey: context.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: context.baseUrl || process.env.OPENAI_BASE_URL,
    });
  }

  private createGeminiClient(context: PullRequestContext): GoogleGenAI {
    if (context.baseUrl) {
      throw new Error('Gemini provider does not support custom baseUrl in current SDK.');
    }

    return new GoogleGenAI({
      apiKey: context.apiKey ?? process.env.GEMINI_API_KEY,
    });
  }

  async reviewDiff(
    context: PullRequestContext,
  ): Promise<{ summary: string; issues: ReviewIssue[] }> {
    const provider = normalizeProvider(context.provider);

    if (provider === 'claude') {
      return this.reviewWithClaude(context);
    }
    if (provider === 'openai') {
      return this.reviewWithOpenAI(context);
    }
    if (provider === 'gemini') {
      return this.reviewWithGemini(context);
    }

    throw new Error(`Unsupported provider: ${String(provider)}`);
  }

  private async reviewWithClaude(
    context: PullRequestContext,
  ): Promise<{ summary: string; issues: ReviewIssue[] }> {
    const response = await this.createAnthropicClient(context).messages.create({
      model: context.model ?? 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: promptFor(context) }],
    });

    const text = response.content.find((block: { type: string }) => block.type === 'text');
    if (!text || text.type !== 'text') {
      return { summary: 'No summary generated.', issues: [] };
    }

    return parseReviewOutput(text.text);
  }

  private async reviewWithOpenAI(
    context: PullRequestContext,
  ): Promise<{ summary: string; issues: ReviewIssue[] }> {
    const response = await this.createOpenAIClient(context).responses.create({
      model: context.model ?? 'gpt-4o',
      input: promptFor(context),
    });

    const text = response.output_text;
    if (!text) {
      return { summary: 'No summary generated.', issues: [] };
    }

    return parseReviewOutput(text);
  }

  private async reviewWithGemini(
    context: PullRequestContext,
  ): Promise<{ summary: string; issues: ReviewIssue[] }> {
    const response = await this.createGeminiClient(context).models.generateContent({
      model: context.model ?? 'gemini-1.5-pro',
      contents: promptFor(context),
    });

    const text = response.text;
    if (!text) {
      return { summary: 'No summary generated.', issues: [] };
    }

    return parseReviewOutput(text);
  }
}
