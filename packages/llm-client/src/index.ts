import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type {
  PullRequestContext,
  ReviewIssue,
  ReviewProvider,
} from '@ai-code-review/contracts';

// 所有 provider 共用的 system prompt，定义角色、输出格式和审查规则。
// 放在 system role 而非 user message，模型对指令的遵循度更高，且支持 Anthropic prompt caching。
const SYSTEM_PROMPT = [
  'You are an expert code reviewer.',
  'Your output must be raw JSON only — no markdown, no code fences, no explanation.',
  'The JSON must have exactly two fields: "summary" (string) and "issues" (array).',
  'Write summary/title/evidence/suggestion in Simplified Chinese.',
  'Each issue object requires these fields:',
  '  - id: unique string',
  '  - filePath: file path string',
  '  - line: the actual line number in the file AFTER the change (not the diff hunk offset)',
  '  - severity: one of "info" | "warning" | "error"',
  '  - title: short description in Chinese',
  '  - evidence: exact code snippet with explanation of why it is a problem',
  '  - suggestion: concrete fix suggestion in Chinese',
  '  - confidence: number between 0 and 1',
  '  - fixPatch: optional unified diff snippet that can be applied directly',
  'Review rules:',
  // 最关键的规则：只审查新增行，避免把已修复的旧代码当 bug 报出来
  '  1. ONLY review lines starting with "+". Lines starting with "-" are already deleted — never report issues on them.',
  '  2. Focus on correctness, null safety, security risks, and missing tests.',
  '  3. Do not report a bug without direct evidence from the provided "+" lines.',
  '  4. For structure/syntax claims, verify against the full file context in the diff before deciding.',
  '  5. Keep evidence factual: quote the exact "+" line and explain why it is a problem.',
  '  6. Set confidence by evidence strength. Only set high confidence when the issue is directly provable.',
  '  7. Avoid guessing from partial diff patterns.',
].join('\n');

// 构造 user message，只包含仓库信息和 diff 数据，不混入指令
const buildUserMessage = (context: PullRequestContext): string => {
  return [
    `Repository: ${context.repository}`,
    `Pull Request: ${context.pullRequestNumber}`,
    'Diff:',
    context.diff,
  ].join('\n\n');
};

// 兜底解析：处理 OpenAI/Gemini 返回的文本，防止偶发的 markdown 包裹导致解析失败
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
    // 使用 tool_use + tool_choice 强制结构化输出，模型必须调用 report_review 工具
    // 输出直接是 JSON 对象，完全绕过文本解析，比 prompt 要求返回 JSON 更可靠
    const response = await this.createAnthropicClient(context).messages.create({
      model: context.model ?? 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'report_review',
          description: 'Report the code review result as structured JSON.',
          input_schema: {
            type: 'object' as const,
            properties: {
              summary: { type: 'string' },
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    filePath: { type: 'string' },
                    line: { type: 'number' },
                    severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                    title: { type: 'string' },
                    evidence: { type: 'string' },
                    suggestion: { type: 'string' },
                    confidence: { type: 'number' },
                    fixPatch: { type: 'string' },
                  },
                  required: ['id', 'filePath', 'line', 'severity', 'title', 'evidence', 'suggestion', 'confidence'],
                },
              },
            },
            required: ['summary', 'issues'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'report_review' },
      messages: [{ role: 'user', content: buildUserMessage(context) }],
    });

    const toolUse = response.content.find((block: { type: string }) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { summary: 'No summary generated.', issues: [] };
    }

    const input = toolUse.input as { summary?: string; issues?: ReviewIssue[] };
    return {
      summary: input.summary ?? 'No summary generated.',
      issues: Array.isArray(input.issues) ? input.issues : [],
    };
  }

  private async reviewWithOpenAI(
    context: PullRequestContext,
  ): Promise<{ summary: string; issues: ReviewIssue[] }> {
    // response_format: json_object 保证输出是合法 JSON，避免 markdown 包裹
    const response = await this.createOpenAIClient(context).chat.completions.create({
      model: context.model ?? 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(context) },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return { summary: 'No summary generated.', issues: [] };
    }

    return parseReviewOutput(text);
  }

  private async reviewWithGemini(
    context: PullRequestContext,
  ): Promise<{ summary: string; issues: ReviewIssue[] }> {
    // Gemini 不支持独立 system role，将 system prompt 拼在 contents 最前面
    // responseMimeType 强制返回 JSON 格式
    const response = await this.createGeminiClient(context).models.generateContent({
      model: context.model ?? 'gemini-1.5-pro',
      config: { responseMimeType: 'application/json' },
      contents: `${SYSTEM_PROMPT}\n\n${buildUserMessage(context)}`,
    });

    const text = response.text;
    if (!text) {
      return { summary: 'No summary generated.', issues: [] };
    }

    return parseReviewOutput(text);
  }
}
