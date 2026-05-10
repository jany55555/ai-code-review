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
    `Repository: ${context.repository}`,
    `Pull Request: ${context.pullRequestNumber}`,
    'Diff:',
    context.diff,
  ].join('\n\n');
};

const parseReviewOutput = (text: string): { summary: string; issues: ReviewIssue[] } => {
  try {
    const parsed = JSON.parse(text) as { summary?: string; issues?: ReviewIssue[] };
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
  private _anthropic?: Anthropic;
  private _openai?: OpenAI;
  private _gemini?: GoogleGenAI;

  private get anthropic(): Anthropic {
    if (!this._anthropic) this._anthropic = new Anthropic();
    return this._anthropic;
  }

  private get openai(): OpenAI {
    if (!this._openai) this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this._openai;
  }

  private get gemini(): GoogleGenAI {
    if (!this._gemini) this._gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return this._gemini;
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
    const response = await this.anthropic.messages.create({
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
    const response = await this.openai.responses.create({
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
    const response = await this.gemini.models.generateContent({
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
