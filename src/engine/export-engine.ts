/**
 * Export Engine — Conversation export to Markdown, JSON formats
 *
 * Generates downloadable files from conversation message trees.
 */

import type { MessageNode, ContentPart } from '../types/messages';
import type { Conversation } from '../types/conversations';
import { MODEL_REGISTRY } from '../constants/model-registry';

/** Extract plain text from content parts */
function extractText(content: ContentPart[]): string {
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/** Export conversation as Markdown */
export function exportAsMarkdown(
  conversation: Conversation,
  messages: MessageNode[],
): string {
  const lines: string[] = [];

  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`*Exported on ${new Date().toISOString()}*`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'system' && extractText(msg.content).length === 0) continue;

    const role = msg.role === 'user' ? '**You**' :
      msg.role === 'assistant' ? `**${msg.model ?? 'Assistant'}**` :
      `**${msg.role}**`;

    const timestamp = new Date(msg.timestamp).toLocaleString();

    lines.push(`### ${role}`);
    lines.push(`*${timestamp}*`);
    lines.push('');

    // Thinking content
    if (msg.thinkingContent) {
      lines.push('<details>');
      lines.push('<summary>💭 Thinking</summary>');
      lines.push('');
      lines.push(msg.thinkingContent);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    // Main content
    const text = extractText(msg.content);
    if (text) {
      lines.push(text);
      lines.push('');
    }

    // Tool calls
    if (msg.toolCalls.length > 0) {
      lines.push('**Tool Calls:**');
      for (const tc of msg.toolCalls) {
        lines.push(`- \`${tc.toolName}\` (${tc.status})`);
        lines.push(`  \`\`\`json\n  ${JSON.stringify(tc.arguments, null, 2)}\n  \`\`\``);
      }
      lines.push('');
    }

    // Web search results
    if (msg.webSearchResults.length > 0) {
      lines.push('**Sources:**');
      for (const ws of msg.webSearchResults) {
        lines.push(`- [${ws.title}](${ws.url})`);
      }
      lines.push('');
    }

    // Token metadata for assistant messages
    if (msg.role === 'assistant' && msg.tokenCounts.output > 0) {
      const model = MODEL_REGISTRY.find((m) => m.id === msg.model);
      lines.push(`> Tokens: ${msg.tokenCounts.input} in / ${msg.tokenCounts.output} out`);
      if (msg.costEstimate.totalCost > 0) {
        lines.push(`> Cost: $${msg.costEstimate.totalCost.toFixed(4)}`);
      }
      if (msg.latency) {
        lines.push(`> Latency: ${(msg.latency / 1000).toFixed(1)}s`);
      }
      if (model) {
        lines.push(`> Model: ${model.displayName}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/** Export conversation as JSON */
export function exportAsJson(
  conversation: Conversation,
  messages: MessageNode[],
): string {
  const exportData = {
    meta: {
      exportedAt: new Date().toISOString(),
      format: 'byok-chat-export-v1',
    },
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: new Date(conversation.createdAt).toISOString(),
      updatedAt: new Date(conversation.updatedAt).toISOString(),
      totalCost: conversation.totalCost,
      totalTokens: conversation.totalTokens,
    },
    messages: messages
      .filter((m) => m.role !== 'system' || extractText(m.content).length > 0)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: extractText(m.content),
        model: m.model,
        provider: m.provider,
        timestamp: new Date(m.timestamp).toISOString(),
        tokenCounts: m.tokenCounts,
        costEstimate: m.costEstimate,
        latency: m.latency,
        status: m.status,
        thinkingContent: m.thinkingContent,
        toolCalls: m.toolCalls.length > 0 ? m.toolCalls : undefined,
        webSearchResults: m.webSearchResults.length > 0 ? m.webSearchResults : undefined,
        attachmentIds: m.attachmentIds.length > 0 ? m.attachmentIds : undefined,
        pinned: m.metadata.pinned || undefined,
      })),
  };

  return JSON.stringify(exportData, null, 2);
}

/** Trigger file download in browser */
export function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
