import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  BRIEF_SETUP_GUIDANCE,
  researchContextSchema,
  type ResearchContext,
} from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';

export const previewBriefInput = z.object({
  context: researchContextSchema,
});

export const previewBriefConfig = {
  title: 'Preview + save a research brief (with user confirmation)',
  description: `Validates a ResearchContext, shows the user a confirmation prompt (via MCP elicitation — Claude Code renders an AskUserQuestion-style dialog), and saves the brief only if the user clicks Save. Returns the new briefId + shareable URL on save, or a cancelled message otherwise.

**Always call this first when authoring a new brief.** Only fall through to \`create_brief\` if the user has *explicitly* confirmed offline (e.g. they said "just save it, I've reviewed").

## How to build a ResearchContext

${BRIEF_SETUP_GUIDANCE}`,
  inputSchema: previewBriefInput.shape,
};

type Input = z.infer<typeof previewBriefInput>;

function formatSummary(ctx: ResearchContext): string {
  const lines: string[] = [
    `• Product: ${ctx.product.name} — ${ctx.product.description}`,
    `• Key features: ${ctx.product.keyFeatures.join(', ')}`,
    `• Target audience: ${ctx.product.targetAudience}`,
    `• Company: ${ctx.company.name} (${ctx.company.industry})`,
    `• Research objective: ${ctx.research.objective}`,
    `• Questions: ${ctx.research.questions.length} question${
      ctx.research.questions.length === 1 ? '' : 's'
    }`,
    `• PMF hypothesis: ${ctx.research.productMarketFit.hypothesis}`,
  ];

  if (ctx.research.concerns.length > 0) {
    lines.push(`• Concerns to probe: ${ctx.research.concerns.join(', ')}`);
  }

  lines.push(
    `• Interview length: up to ${ctx.interviewSettings.maxDurationMinutes} min`,
    `• Tone: ${ctx.interviewSettings.tone}, Language: ${ctx.interviewSettings.language}`,
    '',
    'Questions:',
    ...ctx.research.questions.map(
      (q, i) => `  ${i + 1}. [${q.category}] ${q.text}`,
    ),
  );

  return lines.join('\n');
}

function shareableUrl(baseUrl: string, briefId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/interview/${briefId}`;
}

function formatValidationIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((iss) => `  - ${iss.path.join('.') || '(root)'}: ${iss.message}`)
    .join('\n');
}

export function makePreviewBriefHandler(
  server: McpServer,
  client: ApiClient,
  baseUrl: string,
) {
  return async (args: Input) => {
    const parsed = researchContextSchema.safeParse(args.context);
    if (!parsed.success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Invalid research context. Fix these fields and try again:\n${formatValidationIssues(parsed.error.issues)}`,
          },
        ],
      };
    }

    const summary = formatSummary(parsed.data);

    // If the client advertises elicitation support, ask the user directly.
    // Claude Code, Claude Desktop, and any other client that renders
    // elicitation will show a proper confirmation dialog rather than making
    // Claude guess at the user's intent from a text summary.
    const capabilities = server.server.getClientCapabilities();
    if (capabilities?.elicitation) {
      const elicited = await server.server.elicitInput({
        message: `Review this research brief and choose whether to save it:\n\n${summary}`,
        requestedSchema: {
          type: 'object',
          properties: {
            decision: {
              type: 'string',
              enum: ['save', 'revise'],
              enumNames: ['Save brief', 'Revise brief'],
              title: 'Save this brief?',
              description:
                'Save persists the brief and gives you a shareable interview URL. Revise sends you back to iterate with Claude before saving.',
            },
          },
          required: ['decision'],
        },
      });

      if (elicited.action !== 'accept' || elicited.content?.decision !== 'save') {
        // Any non-save outcome (revise, decline, cancel, dismissed dialog)
        // loops back into iteration. The response is written for Claude to
        // read — it's an instruction to gather edits and re-preview rather
        // than a final user-facing message.
        return {
          content: [
            {
              type: 'text' as const,
              text: 'The user wants to revise the brief before saving. Ask them which parts to change (e.g. product/audience framing, the interview questions, tone, length) and what they\'d like instead. Apply their feedback to the ResearchContext, then call `preview_brief` again with the updated context. Do NOT call `create_brief` — wait until the user picks "Save brief" in a preview dialog.',
            },
          ],
        };
      }

      const { briefId } = await client.createBrief(parsed.data);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { briefId, shareableUrl: shareableUrl(baseUrl, briefId) },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Fallback for clients without elicitation: return the summary and rely
    // on Claude to prompt the user conversationally, then explicitly call
    // create_brief after the user confirms.
    return {
      content: [
        {
          type: 'text' as const,
          text: `Review this brief:\n\n${summary}\n\nIf it looks right, confirm with the user first, then call \`create_brief\` with the same \`context\` to save it.`,
        },
      ],
    };
  };
}
