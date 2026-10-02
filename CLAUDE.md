# mirars

LLM Agent project. **Read `.claude/docs/architecture.md` before working on agent logic.**

## Stack

TypeScript · pnpm · NestJS (backend) · React + Vite + Tailwind + shadcn (frontend) · Supabase + Prisma · Vitest · ESLint + Prettier.

Use `pnpm`, never `npm` or `yarn`.

## Commands

```bash
pnpm install          # install deps
pnpm dev              # local dev
pnpm test             # run vitest
pnpm test <path>      # run a single test file (prefer this over full suite)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm build            # production build
```

Before committing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — **never bypass with `--no-verify`**.

## Workflow rules

- **TDD is required.** Write a failing test first, watch it fail, then write the minimum code to pass. No exceptions, including bugfixes.
- **Don't break existing tests.** Run the full suite before AND after your change. If a pre-existing test fails on `main`, fix that first or stop and ask.
- **Explore before coding.** For any non-trivial change, read `.claude/plans/` and the relevant `.claude/docs/*.md` first. Use plan mode.
- **No `any` in TypeScript.** Use `unknown` + type guards, or define the type. Validate external data with Zod.
- **Security alerts (Critical/High) preempt all other work.** Fix immediately on a hotfix branch.

## Progressive disclosure

Read these only when the task touches them:

- `.claude/docs/architecture.md` — system design, agent boundaries, data flow
- `.claude/docs/tdd-workflow.md` — full TDD process, coverage targets
- `.claude/docs/naming-conventions.md` — file/variable/DB naming rules
- `.claude/docs/review-process.md` — multi-agent review, 9.5/10 scoring rubric
- `.claude/docs/git-workflow.md` — branch strategy, epic branches, PR conventions
- `.claude/docs/task-breakdown.md` — how to size and scope issues
- `.claude/tech-stack.md` — preferred libraries, version constraints
- `.claude/plans/` — accepted implementation plans (read before starting any planned work)

If a relevant doc doesn't exist yet, ask before inventing conventions.

## Project conventions

- All Claude Code config lives in `<project_root>/.claude/`, never in `~/.claude/`.
- Database schema and migrations: non-destructive only without explicit approval.
- Public API and DB schema changes require a migration path documented in the PR.
