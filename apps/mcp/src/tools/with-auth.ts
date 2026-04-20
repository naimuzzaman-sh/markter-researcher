import { PendingAuthError } from '../auth/device-flow.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * Wraps a tool handler so any `PendingAuthError` bubbling up from the HTTP
 * layer is translated into a user-visible text response. Without this, the
 * error would propagate as an MCP protocol error and the URL would never
 * reach the user (Claude Code doesn't surface routine server stderr).
 *
 * Generic over the handler's input type so each tool keeps its own Zod-
 * inferred signature.
 */
export function withAuth<A>(
  handler: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (err) {
      if (err instanceof PendingAuthError) {
        return {
          content: [{ type: 'text', text: err.message }],
        };
      }
      throw err;
    }
  };
}
