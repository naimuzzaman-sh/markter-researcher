# market-researcher-agent Coding Standards & Best Practices

**Version:** 1.0.0
**Last Updated:** 2026-04-12
**Architecture:** LLM Agent

## Project Configuration

<!-- Fill these values to customize this template -->

| Setting                | Value                        |
| ---------------------- | ---------------------------- |
| **Language**           | `TypeScript`                 |
| **Package Manager**    | `pnpm`                       |
| **Backend Framework**  | `NestJS`                     |
| **Frontend Framework** | `React+vite+tailwind+shadcn` |
| **Database/ORM**       | `Supabase+Prisma`            |
| **Testing Framework**  | `Vitest`                     |
| **Linter/Formatter**   | `ESLint+Prettier`            |

---

## Table of Contents

1. [Technology Selection Guidelines](#1-technology-selection-guidelines)
2. [Naming Conventions](#2-naming-conventions)
3. [Language-Specific Standards](#3-language-specific-standards)
4. [Backend Patterns](#4-backend-patterns)
5. [Frontend Patterns](#5-frontend-patterns)
6. [Database Patterns](#6-database-patterns)
7. [Testing Standards](#7-testing-standards)
8. [SOLID Principles](#8-solid-principles)
9. [Security Best Practices](#9-security-best-practices)
10. [Error Handling](#10-error-handling)
11. [Performance Guidelines](#11-performance-guidelines)
12. [Documentation Standards](#12-documentation-standards)
13. [Git Workflow](#13-git-workflow)
14. [Issue Hierarchy](#14-issue-hierarchy)
15. [AI Agent Workflow](#15-ai-agent-workflow) - _"No Code, No Problem"_
    - [15.0 TDD-First Principle (ABSOLUTE REQUIREMENT)](#150-tdd-first-principle-absolute-requirement)
    - [15.0.1 Zero-Impact Implementation (ABSOLUTE REQUIREMENT)](#1501-zero-impact-implementation-absolute-requirement)
    - [15.4 Review Requirements (Score ≥ 9.5 to Merge)](#154-review-requirements-score-based-approval)
16. [Claude Code Configuration](#16-claude-code-configuration)

---

## 1. Technology Selection Guidelines

### Selection Criteria

| Priority | Criteria               | Description                                                  |
| -------- | ---------------------- | ------------------------------------------------------------ |
| 1        | **Recency**            | Prefer technologies released/updated within last 3 years     |
| 2        | **Active Maintenance** | Active development, regular releases, responsive maintainers |
| 3        | **Community Adoption** | Growing community, good documentation, ecosystem support     |
| 4        | **Type Safety**        | First-class type support (TypeScript, type hints, generics)  |
| 5        | **Performance**        | Modern optimizations (tree-shaking, lazy loading, async)     |

### Technology Evaluation Checklist

Before adopting any new technology:

- [ ] **Release Date**: From the last 3 years?
- [ ] **Last Update**: Updated within last 6 months?
- [ ] **Community Activity**: Growing or stable community?
- [ ] **Type Support**: Native types or excellent definitions?
- [ ] **Bundle/Binary Size**: Optimized for production?
- [ ] **Breaking Changes**: Stable API with clear migration paths?

### Preferred Modern Stack by Language

#### TypeScript/JavaScript (2023-2025)

| Category        | Preferred                         | Avoid                |
| --------------- | --------------------------------- | -------------------- |
| Runtime         | Bun,                              | Node < 18            |
| Backend         | NestJs                            | Express (legacy)     |
| Frontend        | React 18+, vite, tailwind, shadcn | React < 17           |
| Meta Framework  | TanStack                          | CRA, Next < 13       |
| ORM             | Prisma 5+                         | Sequelize, TypeORM   |
| Validation      | Zod,                              | Joi, Yup             |
| Testing         | Vitest, Playwright                | Jest (prefer Vitest) |
| Build           | Vite, Turbopack,                  | Webpack              |
| Package Manager | pnpm, Bun                         | npm, Yarn Classic    |

## 2. Naming Conventions

### 2.1 Files and Directories

| Type                   | Convention              | Example                             |
| ---------------------- | ----------------------- | ----------------------------------- |
| General files          | `kebab-case`            | `user-service.ts`, `api_client.py`  |
| Components (React/Vue) | `PascalCase`            | `UserCard.tsx`, `UserCard.vue`      |
| Classes                | `PascalCase`            | `UserService.ts`, `user_service.py` |
| Entry points           | `index.*` / `main.*`    | `index.ts`, `main.py`, `main.go`    |
| Tests                  | `*.test.*` / `*_test.*` | `user.test.ts`, `user_test.go`      |
| Directories            | `kebab-case`            | `user-management/`, `api-routes/`   |

### 2.2 Variables and Functions

| Language      | Variables   | Constants         | Functions   |
| ------------- | ----------- | ----------------- | ----------- |
| TypeScript/JS | `camelCase` | `SCREAMING_SNAKE` | `camelCase` |

### 2.3 Function Naming Prefixes

| Prefix       | Usage             | Example                        |
| ------------ | ----------------- | ------------------------------ |
| `get`        | Retrieve data     | `getUserById()`                |
| `set`        | Set/assign value  | `setUserName()`                |
| `fetch`      | API/network call  | `fetchUserData()`              |
| `create`     | Create new entity | `createUser()`                 |
| `update`     | Modify existing   | `updateOrder()`                |
| `delete`     | Remove entity     | `deleteRecord()`               |
| `validate`   | Validation logic  | `validateInput()`              |
| `handle`     | Event handlers    | `handleSubmit()`               |
| `is/has/can` | Boolean checks    | `isValid()`, `hasPermission()` |
| `use`        | React hooks       | `useAuth()`, `useQuery()`      |

### 2.4 Database Naming

| Element      | Convention              | Example                 |
| ------------ | ----------------------- | ----------------------- |
| Tables       | `snake_case` (plural)   | `users`, `order_items`  |
| Columns      | `snake_case`            | `created_at`, `user_id` |
| Primary keys | `id` or `{table}_id`    | `id`, `user_id`         |
| Foreign keys | `{referenced_table}_id` | `user_id`, `order_id`   |
| Indexes      | `{table}_{column}_idx`  | `users_email_idx`       |

---

## 3. Language-Specific Standards

### 3.1 TypeScript

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmitOnError": true
  }
}
```

**Rules:**

- Always use `strict: true`
- Prefer `type` over `interface` (unless extending)
- Use Zod for runtime validation

#### Type Safety Requirements (STRICT)

| Type           | Status          | Guideline                               |
| -------------- | --------------- | --------------------------------------- |
| `any`          | **BANNED**      | Never use `any` under any circumstances |
| `unknown`      | Allowed (avoid) | Acceptable but prefer explicit types    |
| Explicit types | **PREFERRED**   | Always use concrete, specific types     |

**`any` Type - ABSOLUTE BAN:**

```typescript
// ❌ BANNED - No exceptions, including test files
function process(data: any) { ... }
const result: any = fetchData();
(value as any).property  // Type casting to any

// ❌ BANNED - Even in test files
const mockData: any = { ... };
expect(result as any).toBe(...);
```

**`unknown` Type - Use Sparingly:**

```typescript
// ⚠️ ACCEPTABLE but avoid when possible
function parseJson(input: string): unknown {
  return JSON.parse(input);
}

// ✅ PREFERRED - Use type guards with unknown
function isUser(value: unknown): value is User {
  return typeof value === "object" && value !== null && "id" in value;
}

// ✅ BEST - Use explicit types with validation
function parseUser(input: string): User {
  const data = JSON.parse(input);
  return userSchema.parse(data); // Zod validation
}
```

**Explicit Types - ALWAYS PREFERRED:**

```typescript
// ✅ CORRECT - Explicit return types
function getUser(id: string): Promise<User> { ... }

// ✅ CORRECT - Explicit parameter types
function updateUser(id: string, data: UpdateUserInput): Promise<User> { ... }

// ✅ CORRECT - Explicit variable types when inference is unclear
const users: User[] = [];
const config: AppConfig = loadConfig();
```

**Handling Third-Party Libraries:**

```typescript
// If library returns any, immediately type it
const response = await fetch(url);
const data: UserResponse = await response.json(); // Type immediately

// Use Zod for runtime validation of external data
const validatedData = userResponseSchema.parse(data);
```

## 5. Frontend Patterns

### 5.1 React Component Structure

```typescript
import { useState, useCallback, useMemo } from "react";

type Props = {
  user: User;
  onUpdate: (user: User) => void;
};

function UserCard({ user, onUpdate }: Props) {
  // 1. Hooks
  const [isEditing, setIsEditing] = useState(false);

  // 2. Memoized values
  const displayName = useMemo(() => `${user.firstName} ${user.lastName}`, [user]);

  // 3. Callbacks
  const handleSave = useCallback(() => {
    onUpdate(user);
    setIsEditing(false);
  }, [user, onUpdate]);

  // 4. Early returns
  if (!user) return null;

  // 5. Render
  return <div>{displayName}</div>;
}
```

### 5.2 Data Fetching (TanStack Query)

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.users.get(),
  });
}

function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUser) => api.users.post(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
```

### 5.4 State Management (Jotai)

```typescript
import { atom, useAtom, useAtomValue } from "jotai";

const userAtom = atom<User | null>(null);
const isLoggedInAtom = atom((get) => get(userAtom) !== null);

export function useUser() {
  return useAtom(userAtom);
}

export function useIsLoggedIn() {
  return useAtomValue(isLoggedInAtom);
}
```

---

## 7. Testing Standards

### 7.1 Test-Driven Development (TDD) - MANDATORY

```
┌─────────────────────────────────────────────┐
│                TDD CYCLE                    │
│    ┌─────────┐                              │
│    │   RED   │  Write failing test          │
│    └────┬────┘                              │
│         ▼                                   │
│    ┌─────────┐                              │
│    │  GREEN  │  Write minimum code to pass  │
│    └────┬────┘                              │
│         ▼                                   │
│    ┌─────────┐                              │
│    │REFACTOR │  Improve code quality        │
│    └────┬────┘                              │
│         └──────────► Repeat                 │
└─────────────────────────────────────────────┘
```

### 7.2 Coverage Requirements

| Metric     | Minimum | Target |
| ---------- | ------- | ------ |
| Statements | 80%     | 90%    |
| Branches   | 75%     | 85%    |
| Functions  | 80%     | 90%    |
| Lines      | 80%     | 90%    |

### 7.3 Test Examples by Language

**TypeScript (Vitest):**

```typescript
import { describe, it, expect } from "vitest";

describe("UserService", () => {
  it("should create user with valid data", async () => {
    const data = { name: "John", email: "john@example.com" };
    const result = await createUser(data);
    expect(result).toMatchObject(data);
  });
});
```

---

## 8. SOLID Principles

### 8.1 Single Responsibility (SRP)

Each module/class should have only ONE reason to change.

### 8.2 Open/Closed (OCP)

Open for extension, closed for modification.

### 8.3 Liskov Substitution (LSP)

Subtypes must be substitutable for their base types.

### 8.4 Interface Segregation (ISP)

Clients should not depend on interfaces they don't use.

### 8.5 Dependency Inversion (DIP)

Depend on abstractions, not concretions.

| Principle | Violation Sign                                 |
| --------- | ---------------------------------------------- |
| **SRP**   | Class/function does too many things            |
| **OCP**   | Adding feature requires changing existing code |
| **LSP**   | Subclass throws unexpected errors              |
| **ISP**   | Implementing unused methods                    |
| **DIP**   | Using `new` directly in business logic         |

---

## 9. Security Best Practices

### 9.1 Input Validation

**Always validate all user input:**

```typescript
// TypeScript - Zod
const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});
```

### 9.2 Environment Variables

```typescript
// Validate env vars at startup
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
});
const env = envSchema.parse(process.env);
```

**.gitignore:**

```
.env
.env.*
!.env.example
```

### 9.3 SQL Injection Prevention

**Always use parameterized queries:**

```typescript
// ✅ SAFE
const user = await db.select().from(users).where(eq(users.email, userInput));

// ❌ UNSAFE
const user = await db.execute(
  `SELECT * FROM users WHERE email = '${userInput}'`,
);
```

---

## 11. Performance Guidelines

### 11.1 Database Optimization

- Add indexes for frequently queried columns
- Avoid N+1 queries (use joins or batch loading)
- Use pagination for large datasets
- Cache frequently accessed data

### 11.2 Frontend Optimization

```typescript
// Memoize expensive computations
const processedData = useMemo(() => expensiveOperation(data), [data]);

// Memoize callbacks
const handleClick = useCallback(() => doSomething(id), [id]);

// Code splitting
const HeavyComponent = lazy(() => import("./HeavyComponent"));
```

---

## 12. Documentation Standards

### 12.1 Code Comments

```typescript
// ❌ BAD: Obvious
counter++; // Increment counter

// ✅ GOOD: Explains why
// Use ceiling to ensure at least 1 page even for 0 items
const pageCount = Math.ceil(total / pageSize) || 1;
```

### 12.2 Function Documentation

```typescript
/**
 * Calculates total price including tax.
 * @param basePrice - Base price before tax
 * @param taxRate - Tax rate as decimal (e.g., 0.1 for 10%)
 * @returns Total price with tax
 * @throws {Error} If values are negative
 */
function calculateTotal(basePrice: number, taxRate: number): number {
  // ...
}
```

---

## 15. AI Agent Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              "NO CODE, NO PROBLEM"                          │
│                                                             │
│   The best code is no code. The best fix is prevention.     │
│   Write only what's necessary. Delete what's not.           │
│   Simplicity is the ultimate sophistication.                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 15.0 TDD-First Principle (ABSOLUTE REQUIREMENT)

**TEST-DRIVEN DEVELOPMENT IS NON-NEGOTIABLE. NO EXCEPTIONS. EVER.**

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  CRITICAL: TDD IS MANDATORY FOR ALL WORK               │
│                                                             │
│  This applies to:                                           │
│  • Every feature implementation                             │
│  • Every bug fix                                            │
│  • Every refactoring                                        │
│  • Every code change, no matter how small                   │
│  • Every agent, every task, every action                    │
│                                                             │
│  NO CODE SHALL BE WRITTEN WITHOUT A FAILING TEST FIRST      │
└─────────────────────────────────────────────────────────────┘
```

#### TDD Cycle - MUST Follow Strictly

```
┌─────────────────────────────────────────────────────────────┐
│                    STRICT TDD CYCLE                         │
│                                                             │
│    ┌─────────┐                                              │
│    │   RED   │  1. Write a failing test FIRST               │
│    │         │     - Test MUST fail before implementation   │
│    │         │     - Verify test fails for right reason     │
│    └────┬────┘                                              │
│         │                                                   │
│         ▼                                                   │
│    ┌─────────┐                                              │
│    │  GREEN  │  2. Write MINIMUM code to pass               │
│    │         │     - Only enough code to make test pass     │
│    │         │     - No extra features or "improvements"    │
│    └────┬────┘                                              │
│         │                                                   │
│         ▼                                                   │
│    ┌─────────┐                                              │
│    │REFACTOR │  3. Improve code quality                     │
│    │         │     - Clean up while tests stay green        │
│    │         │     - No new functionality in this phase     │
│    └────┬────┘                                              │
│         │                                                   │
│         └──────────► REPEAT for next requirement            │
└─────────────────────────────────────────────────────────────┘
```

#### TDD Violations - STRICTLY PROHIBITED

| Violation                               | Consequence                        |
| --------------------------------------- | ---------------------------------- |
| Writing implementation code before test | **REVERT immediately, start over** |
| Skipping TDD "just this once"           | **NOT ALLOWED - no exceptions**    |
| Writing tests after implementation      | **DELETE code, write test first**  |
| "The change is too small for tests"     | **FALSE - ALL changes need tests** |
| "I'll add tests later"                  | **PROHIBITED - tests come FIRST**  |
| "Tests slow me down"                    | **Tests SAVE time - follow TDD**   |

#### TDD Checklist - EVERY Task

Before writing ANY implementation code, verify:

- [ ] **Test file exists** for the feature/fix
- [ ] **Test is written** that describes expected behavior
- [ ] **Test FAILS** (red phase confirmed)
- [ ] **Failure reason** is correct (not syntax error, etc.)

Only AFTER all above are checked:

- [ ] Write minimum implementation to pass
- [ ] All tests pass (green phase)
- [ ] Refactor if needed (tests still green)

#### TDD Workflow Integration

```
┌─────────────────────────────────────────────────────────────┐
│  FOR EVERY TASK/ACTION/CHANGE:                              │
│                                                             │
│  1. Understand the requirement                              │
│  2. WRITE TEST FIRST (describing expected behavior)         │
│  3. RUN TEST → Must FAIL (RED)                              │
│  4. Write minimum code to pass                              │
│  5. RUN TEST → Must PASS (GREEN)                            │
│  6. Refactor if needed                                      │
│  7. RUN TEST → Must still PASS                              │
│  8. REPEAT for next requirement                             │
│                                                             │
│  ⚠️  NEVER skip steps 2-3. NEVER write code without test.   │
└─────────────────────────────────────────────────────────────┘
```

**WARNING: Any agent that skips TDD will have their work REJECTED and must start over following proper TDD discipline.**

---

### 15.0.1 Zero-Impact Implementation (ABSOLUTE REQUIREMENT)

**IMPLEMENTATIONS MUST NEVER BREAK EXISTING FUNCTIONALITY. NO EXCEPTIONS.**

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  CRITICAL: PROTECT CURRENT STATE AT ALL COSTS          │
│                                                             │
│  Every implementation MUST:                                 │
│  • Pass ALL existing tests before AND after changes         │
│  • Not modify existing behavior unless explicitly required  │
│  • Be backward compatible by default                        │
│  • Preserve all existing functionality                      │
│                                                             │
│  IF YOUR CHANGE BREAKS EXISTING TESTS → YOUR CHANGE IS WRONG│
└─────────────────────────────────────────────────────────────┘
```

#### Pre-Implementation State Verification

**BEFORE writing any code, you MUST:**

```
┌─────────────────────────────────────────────────────────────┐
│  MANDATORY PRE-IMPLEMENTATION CHECKS                        │
│                                                             │
│  1. Run FULL test suite → All tests MUST pass               │
│  2. Run type checking → No type errors                      │
│  3. Run linting → No lint errors                            │
│  4. Run build → Build succeeds                              │
│  5. Document current state (snapshot)                       │
│                                                             │
│  ⚠️  DO NOT PROCEED if any check fails                      │
│  ⚠️  Fix existing issues FIRST before new implementation    │
└─────────────────────────────────────────────────────────────┘
```

#### Impact Analysis - MANDATORY Before Every Change

| Check               | Action                     | Failure Response                |
| ------------------- | -------------------------- | ------------------------------- |
| **Existing Tests**  | Run full test suite        | Fix broken tests FIRST          |
| **Type Safety**     | Run typecheck              | Resolve type errors FIRST       |
| **Dependencies**    | Identify affected modules  | Map all impact points           |
| **API Contracts**   | Check for breaking changes | Maintain backward compatibility |
| **Database Schema** | Review migrations          | Ensure non-destructive changes  |

#### Zero-Impact Principles

| Principle                   | Description                                   |
| --------------------------- | --------------------------------------------- |
| **Additive by Default**     | Add new functionality, don't modify existing  |
| **Feature Flags**           | Use flags for risky changes, enable gradually |
| **Backward Compatibility**  | Old code must continue working                |
| **Deprecate, Don't Delete** | Mark as deprecated before removal             |
| **Isolated Changes**        | Changes should be self-contained              |

#### Post-Implementation Verification

**AFTER every implementation, you MUST:**

```
┌─────────────────────────────────────────────────────────────┐
│  MANDATORY POST-IMPLEMENTATION CHECKS                       │
│                                                             │
│  1. Run FULL test suite → All tests MUST still pass         │
│  2. Run type checking → No new type errors                  │
│  3. Run linting → No new lint errors                        │
│  4. Run build → Build still succeeds                        │
│  5. Compare with pre-implementation snapshot                │
│  6. Verify no unintended side effects                       │
│                                                             │
│  ⚠️  If ANY existing test fails → REVERT your changes       │
│  ⚠️  Your new feature is NOT worth breaking existing code   │
└─────────────────────────────────────────────────────────────┘
```

#### Handling Breaking Changes

If a breaking change is ABSOLUTELY necessary:

```
┌─────────────────────────────────────────────────────────────┐
│  BREAKING CHANGE PROTOCOL (Requires Explicit Approval)      │
│                                                             │
│  1. Document WHY the breaking change is necessary           │
│  2. Get explicit approval from project owner                │
│  3. Create migration path for affected code                 │
│  4. Update ALL affected tests                               │
│  5. Update ALL documentation                                │
│  6. Communicate change to all stakeholders                  │
│  7. Version bump (major version for breaking changes)       │
│                                                             │
│  ⚠️  NEVER make breaking changes without approval           │
└─────────────────────────────────────────────────────────────┘
```

#### Impact Violations - STRICTLY PROHIBITED

| Violation                                    | Consequence                          |
| -------------------------------------------- | ------------------------------------ |
| Breaking existing tests                      | **REVERT immediately**               |
| Modifying existing behavior without approval | **REVERT and get approval**          |
| Skipping pre-implementation checks           | **STOP, run checks first**           |
| Ignoring failed existing tests               | **NOT ALLOWED - fix them**           |
| "The old code was wrong anyway"              | **NOT your decision - get approval** |
| "I improved it while I was there"            | **PROHIBITED - scope creep**         |

**WARNING: Any implementation that breaks existing functionality will be REJECTED. The codebase stability is paramount.**

---

### 15.1 Pre-Implementation: Codebase Exploration (MANDATORY)

**Before ANY implementation work begins, agents MUST explore and understand the codebase.**

#### Exploration Checklist

| Step | Action                        | Purpose                                                     |
| ---- | ----------------------------- | ----------------------------------------------------------- |
| 1    | Read `.claude/docs/`          | Understand project-specific patterns and archived decisions |
| 2    | Read `.claude/plans/`         | Review existing plans and architectural decisions           |
| 3    | Read `.claude/tech-stack.md`  | Understand technology choices and constraints               |
| 4    | Read `CLAUDE.md`              | Understand coding standards and conventions                 |
| 5    | Explore relevant source files | Understand existing patterns and code structure             |
| 6    | Identify dependencies         | Map out what the feature will interact with                 |

#### Exploration Process

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 0: CODEBASE EXPLORATION (Before Implementation)      │
│                                                             │
│  1. Read project documentation                              │
│     - .claude/docs/*                                        │
│     - .claude/plans/*                                       │
│     - .claude/tech-stack.md                                 │
│     - CLAUDE.md                                             │
│                                                             │
│  2. Explore existing codebase                               │
│     - Identify similar features/patterns                    │
│     - Understand project structure                          │
│     - Map dependencies and integrations                     │
│                                                             │
│  3. Document understanding                                  │
│     - Note relevant patterns to follow                      │
│     - Identify potential impacts                            │
│     - List questions/clarifications needed                  │
│                                                             │
│  Only proceed to implementation after exploration complete  │
└─────────────────────────────────────────────────────────────┘
```

#### What to Look For

| Area                 | Questions to Answer                                    |
| -------------------- | ------------------------------------------------------ |
| **Architecture**     | How is the project structured? What patterns are used? |
| **Similar Features** | Are there similar features to reference?               |
| **Dependencies**     | What modules/packages will this touch?                 |
| **Testing Patterns** | How are similar features tested?                       |
| **Conventions**      | What naming/coding conventions are enforced?           |
| **Constraints**      | Are there tech stack constraints to follow?            |

**WARNING: Starting implementation without exploration leads to:**

- Code that doesn't follow project patterns
- Duplicated functionality
- Integration issues
- Wasted review cycles

### 15.2 Task Planning: Breaking Down Milestones (MANDATORY)

**When creating issues/tasks for a milestone, tasks MUST be as small as possible.**

#### Task Sizing Rules

| Rule                      | Description                                 |
| ------------------------- | ------------------------------------------- |
| **Single Responsibility** | Each task does ONE thing only               |
| **Atomic Changes**        | Task can be completed in a single PR        |
| **Clear Scope**           | No ambiguity about what's included/excluded |
| **Testable**              | Task has clear acceptance criteria          |
| **Time-Bounded**          | Ideally completable in 1-4 hours            |

#### Task Breakdown Guidelines

```
┌─────────────────────────────────────────────────────────────┐
│  BAD: Large, vague tasks                                    │
│  ❌ "Implement user authentication"                         │
│  ❌ "Add API endpoints"                                     │
│  ❌ "Create dashboard page"                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  GOOD: Small, specific tasks                                │
│  ✅ "Add login form component"                              │
│  ✅ "Create /api/auth/login endpoint"                       │
│  ✅ "Add password validation schema"                        │
│  ✅ "Write unit tests for auth service"                     │
│  ✅ "Add session token storage"                             │
└─────────────────────────────────────────────────────────────┘
```

#### Benefits of Small Tasks

| Benefit             | Description                                       |
| ------------------- | ------------------------------------------------- |
| **Easier Review**   | Small PRs are reviewed faster and more thoroughly |
| **Lower Risk**      | Less code = fewer bugs, easier rollback           |
| **Better Tracking** | Clear progress visibility on milestone            |
| **Parallel Work**   | Multiple agents can work simultaneously           |
| **Faster Feedback** | Issues caught early in small increments           |

#### Task Checklist Before Creating Issue

- [ ] Can this be broken down further?
- [ ] Is the scope crystal clear?
- [ ] Can it be completed in one PR?
- [ ] Are acceptance criteria specific and testable?
- [ ] Does it have a single, clear outcome?

**Rule of Thumb:** If a task description needs "and" or multiple bullet points, it should be split into separate issues.

#### Task Priority Order (MANDATORY)

**Security alerts (Dependabot, Snyk, etc.) with Critical/High severity MUST be addressed FIRST.**

| Priority          | Type                                    | Action                           |
| ----------------- | --------------------------------------- | -------------------------------- |
| **P0 - CRITICAL** | Critical/High security alerts           | Drop everything, fix immediately |
| **P1 - HIGH**     | Medium security alerts, Production bugs | Fix within 24 hours              |
| **P2 - NORMAL**   | Feature work, Enhancements              | Normal sprint/milestone work     |
| **P3 - LOW**      | Tech debt, Minor improvements           | When time permits                |

```
┌─────────────────────────────────────────────────────────────┐
│  SECURITY ALERT WORKFLOW                                    │
│                                                             │
│  1. Security alert detected (Dependabot/Snyk/etc.)          │
│     ↓                                                       │
│  2. Assess severity (Critical/High/Medium/Low)              │
│     ↓                                                       │
│  3. Critical/High? → STOP current work                      │
│     ↓                                                       │
│  4. Create hotfix branch immediately                        │
│     ↓                                                       │
│  5. Fix vulnerability                                       │
│     ↓                                                       │
│  6. Expedited review (can reduce to 1-2 reviews)            │
│     ↓                                                       │
│  7. Merge and deploy ASAP                                   │
└─────────────────────────────────────────────────────────────┘
```

**Security Alert Sources:**

- Dependabot (GitHub)
- Snyk
- GitLab Security Scanner
- npm audit / pnpm audit
- OWASP Dependency Check
- Custom security scanning tools

**WARNING:** Ignoring Critical/High security alerts is NEVER acceptable. These vulnerabilities can lead to:

- Data breaches
- System compromise
- Compliance violations
- Reputation damage

#### Quality Gates: NEVER Skip (MANDATORY)

**Quality gates MUST pass before ANY commit, regardless of task type.**

```
┌─────────────────────────────────────────────────────────────┐
│  QUALITY GATES - NEVER SKIP OR BYPASS                       │
│                                                             │
│  ✗ "It's just a docs change" → Still run quality gates      │
│  ✗ "It's not related to my code" → Still run quality gates  │
│  ✗ "I'll fix it later" → Fix NOW before commit              │
│  ✗ "Using --no-verify" → PROHIBITED                         │
│                                                             │
│  Every commit MUST pass:                                    │
│  1. Type checking (typecheck)                               │
│  2. Linting (lint)                                          │
│  3. Tests (test)                                            │
│  4. Build (build)                                           │
└─────────────────────────────────────────────────────────────┘
```

| Excuse                           | Response                                             |
| -------------------------------- | ---------------------------------------------------- |
| "My change doesn't affect types" | Run typecheck anyway - you may have broken something |
| "Tests are unrelated to my work" | Run tests anyway - integration issues happen         |
| "Pre-commit hooks are slow"      | Wait for them - they exist for a reason              |
| "I need to push urgently"        | Quality is never urgent enough to skip               |

**If quality gates fail:**

1. **STOP** - Do not bypass with `--no-verify` or `--skip-ci`
2. **FIX** - Address the failure, even if it's in "unrelated" code
3. **VERIFY** - Run quality gates again until they pass
4. **COMMIT** - Only then proceed with the commit

**The codebase health is everyone's responsibility. A "small" documentation change that bypasses a failing typecheck still ships broken code.**

### 15.3 Implementation Process

| Step | Agent             | Action                                                         |
| ---- | ----------------- | -------------------------------------------------------------- |
| 0    | All Agents        | **Explore and understand codebase** (MANDATORY)                |
| 1    | All Agents        | **Run pre-implementation checks** (tests, types, lint, build)  |
| 2    | -                 | Create feature branch                                          |
| 3    | QA Agent          | **Write FAILING tests FIRST** (TDD RED phase - MANDATORY)      |
| 4    | QA Agent          | **Verify tests FAIL** for the right reasons                    |
| 5    | Fullstack Agent   | **Write MINIMUM code** to pass tests (TDD GREEN phase)         |
| 6    | Fullstack Agent   | **Refactor** while keeping tests green (TDD REFACTOR phase)    |
| 7    | All Agents        | **Run ALL existing tests** - must ALL pass                     |
| 8    | -                 | Run quality gates (typecheck, lint, test, build)               |
| 9    | -                 | **Verify no impact** to existing functionality                 |
| 10   | -                 | Commit and create PR                                           |
| 11   | All Review Agents | **Team Review** - Each agent scores (1-10) + provides feedback |
| 12   | -                 | **Calculate average score** across all reviewers               |
| 13   | Fullstack Agent   | If avg < 9.5: **Fix ALL issues** from ALL reviewers            |
| 14   | -                 | **Repeat steps 11-13** until average score ≥ 9.5               |
| 15   | -                 | **APPROVED** - Ready to merge when score ≥ 9.5                 |

**CRITICAL:** Steps 3-4 (TDD), Steps 7-9 (Impact Verification), and Steps 11-15 (Score ≥ 9.5) are NON-NEGOTIABLE.

### 15.4 Review Requirements (Score-Based Approval)

**PRs are approved when average team review score reaches 9.5+/10.**

```
┌─────────────────────────────────────────────────────────────┐
│  REVIEW CYCLE - ITERATE UNTIL SCORE 9.5+                    │
│                                                             │
│  ┌─────────────────┐                                        │
│  │  TEAM REVIEW    │  All agents review the PR              │
│  │  (Score 1-10)   │  Each provides score + feedback        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ CALCULATE AVG   │  Average all agent scores              │
│  │    SCORE        │                                        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐      NO     ┌─────────────────┐        │
│  │  Score ≥ 9.5?   │────────────►│  FIX ALL ISSUES │        │
│  └────────┬────────┘             │  from feedback  │        │
│           │ YES                  └────────┬────────┘        │
│           │                               │                 │
│           ▼                               │                 │
│  ┌─────────────────┐                      │                 │
│  │    APPROVED     │◄─────────────────────┘                 │
│  │  Ready to merge │      (repeat review cycle)             │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

#### Review Scoring Criteria

| Score | Meaning                            | Action Required            |
| ----- | ---------------------------------- | -------------------------- |
| 10    | Perfect - No issues                | Ready to merge             |
| 9     | Excellent - Minor suggestions only | Optional improvements      |
| 8     | Good - Small issues exist          | Must fix before merge      |
| 7     | Acceptable - Notable issues        | Fix required               |
| 6     | Below Standard - Multiple issues   | Significant rework needed  |
| ≤5    | Unacceptable - Major problems      | Complete revision required |

#### Review Process

| Step | Action               | Outcome                                    |
| ---- | -------------------- | ------------------------------------------ |
| 1    | Submit PR            | Team review begins                         |
| 2    | Each agent reviews   | Provides score (1-10) + detailed feedback  |
| 3    | Calculate average    | Sum of scores / number of reviewers        |
| 4    | If avg < 9.5         | Fix ALL issues identified by ALL reviewers |
| 5    | Re-submit for review | Repeat steps 2-4                           |
| 6    | If avg ≥ 9.5         | **APPROVED** - Ready to merge              |

#### Review Focus by Agent

| Agent              | Review Focus                                         | Scoring Weight |
| ------------------ | ---------------------------------------------------- | -------------- |
| Principal Agent    | Code quality, architecture, security, best practices | Equal          |
| QA Agent           | Test coverage, test quality, edge cases, regression  | Equal          |
| UI/UX Agent        | User experience, accessibility, design consistency   | Equal          |
| Solution Architect | Scalability, system design, integration patterns     | Equal          |

#### Important Rules

- **ALL issues must be fixed** - No "will fix later" or "minor, can skip"
- **ALL reviewers must re-review** after fixes
- **Score MUST reach 9.5+** - No exceptions, no shortcuts
- **Each cycle is fresh** - Previous scores don't carry over
- **Detailed feedback required** - Scores without justification are invalid

### 15.5 Team Agent Roles

| Agent              | Exploration Focus                        | Implementation Focus             |
| ------------------ | ---------------------------------------- | -------------------------------- |
| Principal Agent    | Architecture patterns, security concerns | Code quality, security review    |
| QA Agent           | Testing patterns, existing test coverage | Test suite creation, regression  |
| Fullstack Agent    | Code structure, existing implementations | Feature implementation           |
| UI/UX Agent        | Design patterns, component library       | User experience, accessibility   |
| Solution Architect | System design, integrations              | Scalability, architecture review |

**All agents participate in Phase 0 exploration based on their domain expertise.**

### 15.6 Workflow Diagram

```
┌─────────────────────────────────────────────┐
│  0. EXPLORE CODEBASE (MANDATORY)            │
│     - Read .claude/docs/, plans/, tech-stack│
│     - Explore existing patterns             │
│     - Map dependencies                      │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  1. PRE-IMPLEMENTATION STATE CHECK          │
│     - Run ALL existing tests (must pass)    │
│     - Run typecheck, lint, build            │
│     - Document current state snapshot       │
│     ⚠️  DO NOT PROCEED IF ANY CHECK FAILS   │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  2. CREATE FEATURE BRANCH                   │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  3. TDD RED PHASE (MANDATORY)               │
│     - QA Agent: Write FAILING tests FIRST   │
│     - Verify tests fail for RIGHT reason    │
│     ⚠️  NO IMPLEMENTATION CODE YET          │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  4. TDD GREEN PHASE (MANDATORY)             │
│     - Fullstack: Write MINIMUM code to pass │
│     - Only enough to make tests pass        │
│     - No extra features or improvements     │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  5. TDD REFACTOR PHASE                      │
│     - Clean up code quality                 │
│     - Tests must stay GREEN                 │
│     - No new functionality                  │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  6. POST-IMPLEMENTATION VERIFICATION        │
│     - Run ALL existing tests (must pass)    │
│     - Run typecheck, lint, build            │
│     - Compare with pre-implementation state │
│     ⚠️  REVERT IF ANY EXISTING TEST FAILS   │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  7. COMMIT AND CREATE PR                    │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  8. TEAM REVIEW (All Agents)                │
│     - Each agent scores 1-10                │
│     - Each provides detailed feedback       │
│     - Calculate average score               │
└─────────────────────────────────────────────┘
                    │
                    ▼
           ┌───────────────┐
           │ Avg Score     │
           │   ≥ 9.5?      │
           └───────┬───────┘
                   │
         NO ◄──────┴──────► YES
          │                  │
          ▼                  ▼
┌─────────────────────┐  ┌─────────────────────┐
│  FIX ALL ISSUES     │  │     APPROVED        │
│  from ALL reviewers │  │  Ready to merge     │
│  (follow TDD cycle) │  │                     │
└──────────┬──────────┘  └─────────────────────┘
           │
           └──────► REPEAT (back to step 8)
```

**"NO CODE, NO PROBLEM"** - Iterate until excellence. No shortcuts.

### 15.7 Epic Branch Strategy

```
┌─────────────────────────────────────────────┐
│  1. CREATE EPIC BRANCH                      │
│     feature/epic-{n}-{name}                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  2. CREATE FEATURE BRANCHES FROM EPIC       │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  3. MERGE FEATURES TO EPIC (not develop)    │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  4. TEST ON EPIC BRANCH                     │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  5. MERGE EPIC TO DEVELOP                   │
└─────────────────────────────────────────────┘
```

---

## 16. Claude Code Configuration

### 16.1 File Location Rules

**All Claude Code files MUST be in project root:**

```
{{PROJECT_ROOT}}/.claude/
├── plans/                  # Implementation plans
├── docs/                   # Project documentation
├── agents/                 # Agent configurations
├── tasks/                  # Task tracking
├── settings.json           # Project settings
└── commands/               # Custom slash commands
```

| Location                    | Status         |
| --------------------------- | -------------- |
| `{{PROJECT_ROOT}}/.claude/` | **REQUIRED**   |
| `~/.claude/` (user home)    | **PROHIBITED** |

---

## Summary Checklist

### Before Committing

- [ ] All quality gates pass (typecheck, lint, test, build)
- [ ] No hardcoded secrets
- [ ] Error handling in place
- [ ] Tests cover new functionality

### Code Review Checklist

- [ ] Follows naming conventions
- [ ] Input validation present
- [ ] Error handling implemented
- [ ] No type safety violations
- [ ] Database queries optimized
- [ ] Security best practices followed
- [ ] Documentation updated if needed

---

**End of Document**
