import { z } from 'zod';
import {
  BRIEF_SETUP_GUIDANCE,
  researchContextSchema,
} from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';

export const createBriefInput = z.object({
  context: researchContextSchema,
});

export const createBriefConfig = {
  title: 'Create a research brief (no user prompt)',
  description: `Persists a ResearchContext directly — no confirmation dialog. **Prefer \`preview_brief\` for interactive flows** (it shows the user a review + Save/Cancel dialog and only writes on Save). Use \`create_brief\` only when the user has already explicitly told you to save (e.g. "just save it, I've reviewed") or when scripting.

## How to build a ResearchContext

${BRIEF_SETUP_GUIDANCE}`,
  inputSchema: createBriefInput.shape,
};

type Input = z.infer<typeof createBriefInput>;

function shareableUrl(baseUrl: string, briefId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/interview/${briefId}`;
}

export function makeCreateBriefHandler(client: ApiClient, baseUrl: string) {
  return async (args: Input) => {
    // Defense-in-depth: the backend also validates, but failing fast here
    // avoids a round-trip for obvious errors and keeps the error shape
    // consistent with preview_brief.
    const parsed = researchContextSchema.safeParse(args.context);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((iss) => `  - ${iss.path.join('.') || '(root)'}: ${iss.message}`)
        .join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Invalid research context. Fix these fields and try again:\n${issues}`,
          },
        ],
      };
    }

    try {
      const { briefId } = await client.createBrief(parsed.data);
      const payload = {
        briefId,
        shareableUrl: shareableUrl(baseUrl, briefId),
      };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Failed to create brief: ${message}`,
          },
        ],
      };
    }
  };
}
