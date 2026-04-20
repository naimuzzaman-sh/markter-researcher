# market-researcher-mcp

An MCP (Model Context Protocol) server that exposes your Market Researcher briefs + interviews to Claude Code, Claude Desktop, and any other MCP-compatible client. Lets you manage research briefs and review interview transcripts conversationally without leaving the chat.

## What's in the box

| Tool | Writes? | Purpose |
| --- | --- | --- |
| `list_briefs` | no | List briefs you own (newest first) |
| `get_brief` | no | Full research context for one brief |
| `list_interviews` | no | Interview summaries (optionally filtered by brief) |
| `get_interview` | no | Transcript + analysis for one interview |
| `preview_brief` | no | Validate a drafted ResearchContext and render a summary — **always call this first** |
| `create_brief` | **yes** | Persist a ResearchContext after the user has confirmed the preview |

## Prerequisites

- Node.js 20+
- pnpm 10+ (the monorepo uses workspaces)
- A running Market Researcher backend.
  - **Dev (recommended):** `pnpm --filter api start:dev` + `pnpm --filter web dev` — API on `:3000`, Vite on `:5173`. Browser visits `:5173` (which proxies API calls to `:3000`). Set `APP_BASE_URL=http://localhost:5173` in `.env`.
  - **Single-server (demo/prod):** `pnpm --filter web build && pnpm --filter api start:dev` — NestJS serves both the API and the built web on `:3000`. Set `APP_BASE_URL=http://localhost:3000` in `.env`.
  - Or a deployed URL you own.

## Install

This package lives inside the `market-researcher` monorepo and is not published to npm. The install flow is "clone + install + point your client at `src/index.ts`":

```bash
git clone https://github.com/<you>/market-researcher.git
cd market-researcher
pnpm install
```

No build step — the MCP runs directly via `tsx`.

## Configuration

The MCP reads one environment variable:

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MARKET_RESEARCHER_URL` | no | `http://localhost:3000` | Base URL of the Market Researcher API — the same origin that serves `/briefs`, `/interviews`, `/auth/*`, *and* the web app |

There is nothing else to configure. Supabase credentials, auth tokens, and the verification URL all come from the API at runtime — the MCP never needs direct Supabase access.

Session state is cached at `~/.claude/market-researcher-mcp/session.json` (file mode `0600`). Delete that file to force a fresh device-authorization flow.

## Adding to Claude Code

### Project-scoped (checked in)

Create or edit `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "market-researcher": {
      "command": "pnpm",
      "args": ["--filter", "mcp", "start"],
      "env": {
        "MARKET_RESEARCHER_URL": "http://localhost:3000"
      }
    }
  }
}
```

### User-scoped (via the CLI)

```bash
claude mcp add market-researcher \
  --env MARKET_RESEARCHER_URL=http://localhost:3000 \
  -- pnpm --filter mcp start
```

Run the command from the repo root so `pnpm --filter mcp` resolves the workspace.

## Adding to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "market-researcher": {
      "command": "pnpm",
      "args": [
        "--dir",
        "/absolute/path/to/market-researcher",
        "--filter",
        "mcp",
        "start"
      ],
      "env": {
        "MARKET_RESEARCHER_URL": "http://localhost:3000"
      }
    }
  }
}
```

Restart Claude Desktop after editing. The `--dir` flag is required because Claude Desktop doesn't set `cwd` to your repo.

## First run — device authorization

The MCP connects to its host instantly and defers authorization to the **first tool call**, so your chat doesn't stall on startup. When Claude first calls a tool and no cached session exists:

1. The MCP prints a URL to its stderr log, e.g.
   ```
   [market-researcher-mcp] To connect this tool, open the following URL and click Authorize:
   [market-researcher-mcp]
   [market-researcher-mcp]     http://localhost:5173/authorize/WXYZ-1234
   ```
2. Open that URL in the browser you're already signed into the web app with.
3. Click **Authorize** on the editorial card. (Deny takes you back to the landing page.)
4. The MCP's next poll picks up your session and caches it locally.
5. The in-flight tool call resolves, and all subsequent ones go through automatically — no further browser interaction until your refresh token is revoked.

While Claude Code is running, stderr goes to `~/Library/Logs/Claude/mcp-server-market-researcher.log` (macOS) or the equivalent on other platforms. If you don't see the URL, tail that log.

## Typical workflow

```
You:   What research briefs do I have?
Claude: (calls list_briefs) → "You have 2 briefs: ..."

You:   Show me the interviews for the onboarding brief.
Claude: (calls list_interviews with briefId) → "3 interviews, 2 positive sentiment ..."

You:   What did Alex say about pricing?
Claude: (calls get_interview) → surfaces the relevant snippet from the transcript

You:   Help me draft a new brief about checkout friction.
Claude: walks you through product / audience / questions, then:
        (calls preview_brief) → shows formatted summary
You:   Looks good, save it.
Claude: (calls create_brief) → "Saved. Share this URL with interviewees: ..."
```

## Troubleshooting

**"Refresh token is invalid or expired"** — delete `~/.claude/market-researcher-mcp/session.json` and restart the MCP. It will run the device flow again.

**Device-flow URL expired** — the authorization page is valid for 10 minutes. Just restart the MCP to get a fresh one.

**Tools not appearing in Claude Code** — confirm the MCP server started successfully in the Claude Code MCP status panel, and that `MARKET_RESEARCHER_URL` points to a running backend.

**Changes to MCP code not picked up** — because the MCP runs via `tsx`, edits to `src/**/*.ts` take effect the next time Claude restarts the server. Claude Code's "Reload MCP servers" command is usually faster than a full restart.
