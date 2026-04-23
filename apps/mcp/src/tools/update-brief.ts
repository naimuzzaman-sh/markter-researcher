import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  briefPatchSchema,
  type BriefPatch,
  type ResearchContext,
} from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';

export const updateBriefInput = z.object({
  briefId: z.string().min(1),
  patch: briefPatchSchema,
});

export const updateBriefConfig = {
  title: 'Update (patch) an existing research brief',
  description: `Applies a partial patch on top of an existing brief's ResearchContext and saves it — with user confirmation. Use this to iterate on a brief (refine target audience, swap a question, tweak objective) instead of re-creating the brief from scratch.

## Patch semantics

- Every top-level key (\`company\`, \`product\`, \`research\`, \`interviewSettings\`) is optional. Include only what you want to change.
- Within each subtree, each field is optional; provided fields overwrite, omitted fields are preserved.
- **Arrays replace wholesale.** If you send \`research.questions\`, the full new list is used — there is no per-item merge. Same for \`concerns\`, \`signals\`, and \`keyFeatures\`.
- \`research.productMarketFit\` merges its own fields (hypothesis, signals) — so you can update just the hypothesis without touching signals.

## Confirmation flow

If the client supports elicitation (Claude Code, Claude Desktop), the user sees a confirmation dialog showing the changed fields before anything is persisted. "Save" applies the patch; "Revise" returns without saving so you can iterate. On clients without elicitation, the patch applies directly — make sure the user has already confirmed.`,
  inputSchema: updateBriefInput.shape,
};

type Input = z.infer<typeof updateBriefInput>;

function shareableUrl(baseUrl: string, briefId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/interview/${briefId}`;
}

function formatValidationIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((iss) => `  - ${iss.path.join('.') || '(root)'}: ${iss.message}`)
    .join('\n');
}

/**
 * Build a compact before/after summary of the fields the patch actually
 * changes. We walk the patch (not the full context) so the dialog stays
 * focused on what's changing — reviewers shouldn't have to scan every
 * unchanged field to confirm the diff.
 */
function formatDiff(existing: ResearchContext, patch: BriefPatch): string {
  const lines: string[] = [];

  if (patch.company) {
    for (const [key, value] of Object.entries(patch.company)) {
      const before =
        existing.company[key as keyof typeof existing.company] ?? '(unset)';
      lines.push(`• company.${key}:`);
      lines.push(`    before: ${String(before)}`);
      lines.push(`    after:  ${String(value)}`);
    }
  }

  if (patch.product) {
    for (const [key, value] of Object.entries(patch.product)) {
      const before =
        existing.product[key as keyof typeof existing.product] ?? '(unset)';
      lines.push(`• product.${key}:`);
      lines.push(`    before: ${JSON.stringify(before)}`);
      lines.push(`    after:  ${JSON.stringify(value)}`);
    }
  }

  if (patch.research) {
    for (const [key, value] of Object.entries(patch.research)) {
      if (key === 'productMarketFit' && value && typeof value === 'object') {
        for (const [pmfKey, pmfValue] of Object.entries(
          value as Record<string, unknown>,
        )) {
          const before =
            existing.research.productMarketFit[
              pmfKey as keyof typeof existing.research.productMarketFit
            ] ?? '(unset)';
          lines.push(`• research.productMarketFit.${pmfKey}:`);
          lines.push(`    before: ${JSON.stringify(before)}`);
          lines.push(`    after:  ${JSON.stringify(pmfValue)}`);
        }
        continue;
      }
      const before =
        existing.research[key as keyof typeof existing.research] ?? '(unset)';
      lines.push(`• research.${key}:`);
      lines.push(`    before: ${JSON.stringify(before)}`);
      lines.push(`    after:  ${JSON.stringify(value)}`);
    }
  }

  if (patch.interviewSettings) {
    for (const [key, value] of Object.entries(patch.interviewSettings)) {
      const before =
        existing.interviewSettings[
          key as keyof typeof existing.interviewSettings
        ] ?? '(unset)';
      lines.push(`• interviewSettings.${key}:`);
      lines.push(`    before: ${String(before)}`);
      lines.push(`    after:  ${String(value)}`);
    }
  }

  return lines.length > 0
    ? lines.join('\n')
    : '(patch is empty — no changes to apply)';
}

export function makeUpdateBriefHandler(
  server: McpServer,
  client: ApiClient,
  baseUrl: string,
) {
  return async (args: Input) => {
    // Defense-in-depth: the server re-validates, but failing fast keeps the
    // error shape consistent with preview_brief / create_brief.
    const parsed = updateBriefInput.safeParse(args);
    if (!parsed.success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Invalid update_brief arguments. Fix these and try again:\n${formatValidationIssues(parsed.error.issues)}`,
          },
        ],
      };
    }

    const { briefId, patch } = parsed.data;

    // If elicitation is available, show a before/after dialog so the user
    // confirms the specific fields that will change. We fetch the existing
    // brief to compute the diff — if it's missing, we can short-circuit
    // before asking the user anything.
    const capabilities = server.server.getClientCapabilities();
    if (capabilities?.elicitation) {
      const existing = await client.getBrief(briefId);
      if (!existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Brief ${briefId} not found (or not owned by you). Check the briefId and try again.`,
            },
          ],
        };
      }

      const diff = formatDiff(existing.researchContext, patch);
      const elicited = await server.server.elicitInput({
        message: `Review the pending changes to brief ${briefId}:\n\n${diff}\n\nSave applies the patch. Revise returns without saving so Claude can iterate.`,
        requestedSchema: {
          type: 'object',
          properties: {
            decision: {
              type: 'string',
              enum: ['save', 'revise'],
              enumNames: ['Save changes', 'Revise patch'],
              title: 'Apply this patch?',
              description:
                'Save persists the patch onto the brief. Revise returns so you can adjust the patch before saving.',
            },
          },
          required: ['decision'],
        },
      });

      if (
        elicited.action !== 'accept' ||
        elicited.content?.decision !== 'save'
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'The user wants to revise the patch before saving. Ask them what to change (wording, additional fields, different values) and call `update_brief` again with the revised patch. Do NOT apply the current patch without another confirmation.',
            },
          ],
        };
      }
    }

    // Either the user confirmed via elicitation, or the client can't elicit
    // and the caller (Claude) is responsible for having secured confirmation.
    const updated = await client.updateBrief(briefId, patch);
    if (!updated) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Brief ${briefId} not found or not owned by you. No changes were applied.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              briefId: updated.id,
              shareableUrl: shareableUrl(baseUrl, updated.id),
              researchContext: updated.researchContext,
            },
            null,
            2,
          ),
        },
      ],
    };
  };
}
