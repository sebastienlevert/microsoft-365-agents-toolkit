# AGENTS.md — Microsoft 365 Agents Toolkit

## ⚠️ Git Safety Rules

**Never commit or push changes unless the developer explicitly asks you to in the current message.** Prior consent does not carry over — even if the developer asked you to commit or push earlier in the conversation, you must wait for fresh, explicit instructions each time. Do not assume intent. Always wait for clear consent before running `git commit`, `git push`, or any command that modifies the repository's Git history or remote state.

## Overview

This is a **pnpm monorepo** managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Lerna](https://lerna.js.org/). It contains the tooling for building, testing, and deploying Microsoft 365 agents and Teams applications.

## Prerequisites

| Tool | Version |
|------|---------|
| **Node.js** | ≥ 22 |
| **pnpm** | ≥ 8 (repo pins `pnpm@8.6.12` via `packageManager`) |

## Quick Start

```bash
# Install all dependencies across the monorepo
pnpm install

# Build every package (respects dependency order automatically)
pnpm run build

# Or use the combined setup shortcut
pnpm run setup          # installs + builds everything
```

## Monorepo Structure

```
microsoft-365-agents-toolkit/
├── packages/
│   ├── manifest/                  # @microsoft/app-manifest
│   ├── api/                       # @microsoft/teamsfx-api
│   ├── fx-core/                   # @microsoft/teamsfx-core
│   ├── cli/                       # @microsoft/m365agentstoolkit-cli
│   ├── vscode-extension/          # ms-teams-vscode-extension
│   ├── vscode-ui/                 # @microsoft/vscode-ui
│   ├── sdk/                       # @microsoft/teamsfx
│   ├── sdk-react/                 # @microsoft/teamsfx-react
│   ├── server/                    # @microsoft/teamsfx-server
│   ├── spec-parser/               # @microsoft/m365-spec-parser
│   ├── mcp-server/                # @microsoft/m365agentstoolkit-mcp
│   ├── metrics-ts/                # @microsoft/metrics-ts
│   ├── adaptivecards-tools-sdk/   # @microsoft/adaptivecards-tools
│   ├── eslint-plugin-teamsfx/     # @microsoft/eslint-plugin-teamsfx
│   └── tests/                     # @microsoft/teamsfx-test (E2E tests)
├── templates/                     # Scaffolding templates
├── pnpm-workspace.yaml            # Workspace definition
├── lerna.json                     # Lerna configuration
└── package.json                   # Root scripts & engine constraints
```

## Dependency Graph

Packages must be built in dependency order. pnpm handles this automatically via `pnpm -r run build`, but the graph is documented here for reference.

```
Level 0 (no internal deps — build first):
  @microsoft/app-manifest          (packages/manifest)
  @microsoft/metrics-ts            (packages/metrics-ts)
  @microsoft/adaptivecards-tools   (packages/adaptivecards-tools-sdk)
  @microsoft/eslint-plugin-teamsfx (packages/eslint-plugin-teamsfx)
  @microsoft/teamsfx               (packages/sdk)

Level 1 (depends on Level 0):
  @microsoft/teamsfx-api           → manifest
  @microsoft/m365-spec-parser      → manifest
  @microsoft/m365agentstoolkit-mcp → manifest
  @microsoft/teamsfx-react         → sdk

Level 2 (depends on Level 1):
  @microsoft/teamsfx-core          → api, spec-parser
  @microsoft/vscode-ui             → api

Level 3 (depends on Level 2):
  @microsoft/m365agentstoolkit-cli → api, fx-core, metrics-ts
  @microsoft/teamsfx-server        → api, fx-core
  ms-teams-vscode-extension        → api, fx-core, vscode-ui

Level 4 (depends on Level 3):
  @microsoft/teamsfx-test          → api, fx-core, cli
```

## Root-Level Scripts

All root scripts use **pnpm**. Run them from the repository root:

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies for all packages |
| `pnpm run build` | Build all packages in topological order |
| `pnpm run setup` | Install + build everything |
| `pnpm run setup:cli` | Install + build only the CLI and its dependencies |
| `pnpm run setup:vsc` | Install + build only the VS Code extension and its dependencies |
| `pnpm run watch` | Watch all packages in parallel |
| `pnpm run clean` | Remove `node_modules` from all packages |

## Targeted Builds

Use pnpm's `--filter` to build a specific package and its dependencies:

```bash
# Build only the CLI and everything it depends on
pnpm --filter @microsoft/m365agentstoolkit-cli... run build

# Build only the VS Code extension and its dependencies
pnpm --filter ms-teams-vscode-extension... run build

# Build only a single package (no dependencies)
pnpm --filter @microsoft/app-manifest run build
```

> **Note:** The `...` suffix in pnpm filters means "this package and all its workspace dependencies."

---

## Package Details

### `@microsoft/app-manifest` — `packages/manifest`

TypeScript type definitions, converters, and OOP wrappers for Microsoft 365 App manifests (Teams, Declarative Agent, API Plugin). Types are auto-generated from JSON schemas.

```bash
cd packages/manifest

pnpm run build          # Compile TypeScript
pnpm run convert        # Regenerate types from JSON schemas
pnpm run test:unit      # Run unit tests (mocha + nyc)
pnpm run lint           # Run ESLint
```

**Key details:**
- JSON schemas live in `src/json-schemas/` and are the source of truth
- Run `pnpm run convert` after adding/updating schemas to regenerate `src/generated-types/`
- Exports `TeamsManifest`, `DeclarativeAgentManifest`, `APIPluginManifest` union types
- Provides OOP wrappers (`TeamsManifestWrapper`, `DeclarativeAgentManifestWrapper`, `PluginManifestWrapper`)

---

### `@microsoft/teamsfx-api` — `packages/api`

Core type definitions and interfaces shared across the toolkit. This is the API contract layer.

```bash
cd packages/api

pnpm run build          # Compile TypeScript
pnpm run test:unit      # Run unit tests
pnpm run lint           # Run ESLint
pnpm run doc            # Generate API documentation
```

**Depends on:** `@microsoft/app-manifest`

---

### `@microsoft/teamsfx-core` — `packages/fx-core`

The core logic layer: project generation, lifecycle management, drivers, and manifest utilities.

```bash
cd packages/fx-core

pnpm run build          # Compile TypeScript
pnpm run test:unit      # Run all unit tests
pnpm run lint           # Run ESLint
```

The test suite is modular — you can run targeted test subsets:

```bash
pnpm run test:generator        # Generator tests only
pnpm run test:manifestUtil     # Manifest utility tests only
pnpm run test:coordinator      # Coordinator tests only
pnpm run test:question         # Question model tests only
```

For debugging individual test files directly:

```bash
npx nyc mocha --no-timeouts --require ts-node/register "tests/path/to/test.test.ts"
```

**Depends on:** `@microsoft/teamsfx-api`, `@microsoft/m365-spec-parser`

---

### `@microsoft/m365agentstoolkit-cli` — `packages/cli`

The command-line interface for the toolkit.

```bash
cd packages/cli

pnpm run build          # Compile TypeScript + copy assets
pnpm run test:unit      # Run all unit tests
pnpm run lint           # Run ESLint
pnpm run watch          # Watch mode for development
```

Individual test suites:

```bash
pnpm run test:cmds      # Command tests
pnpm run test:commands  # Additional command tests
pnpm run test:prompts   # Prompt tests
pnpm run test:telemetry # Telemetry tests
```

**Depends on:** `@microsoft/teamsfx-api`, `@microsoft/teamsfx-core`, `@microsoft/metrics-ts`

---

### `ms-teams-vscode-extension` — `packages/vscode-extension`

The VS Code extension providing the UI for the toolkit.

```bash
cd packages/vscode-extension

pnpm run build          # Full production build (esbuild + vite)
pnpm run watch          # Watch mode (esbuild + tsc + vite in parallel)
pnpm run test:unit      # Run unit tests
pnpm run lint           # Run ESLint
pnpm run package        # Package as .vsix
```

**Depends on:** `@microsoft/teamsfx-api`, `@microsoft/teamsfx-core`, `@microsoft/vscode-ui`

---

### `@microsoft/vscode-ui` — `packages/vscode-ui`

Shared VS Code UI components and utilities used by the extension.

```bash
cd packages/vscode-ui

pnpm run build          # Compile TypeScript
pnpm run test:unit      # Run unit tests
pnpm run lint           # Run ESLint
```

**Depends on:** `@microsoft/teamsfx-api`

---

### `@microsoft/teamsfx` — `packages/sdk`

Client SDK for Teams application development (browser & Node.js).

```bash
cd packages/sdk

pnpm run build              # Compile TypeScript
pnpm run test:unit          # Run all unit tests (node + browser)
pnpm run test:unit:node     # Node.js unit tests only
pnpm run test:unit:browser  # Browser unit tests only
pnpm run lint               # Run ESLint
```

**No internal dependencies** — this is a standalone package.

---

### `@microsoft/teamsfx-react` — `packages/sdk-react`

React bindings and hooks for the Teams SDK.

```bash
cd packages/sdk-react

pnpm run build          # Compile TypeScript
pnpm run test:unit      # Run unit tests
pnpm run lint           # Run ESLint
```

**Depends on:** `@microsoft/teamsfx`

---

### `@microsoft/teamsfx-server` — `packages/server`

Server-side companion for the Teams SDK.

```bash
cd packages/server

pnpm run build          # Compile TypeScript + copy assets
pnpm run test:unit      # Run unit tests
pnpm run lint           # Run ESLint
```

**Depends on:** `@microsoft/teamsfx-api`, `@microsoft/teamsfx-core`

---

### `@microsoft/m365-spec-parser` — `packages/spec-parser`

OpenAPI/API specification parser for generating plugin manifests and adaptive cards.

```bash
cd packages/spec-parser

pnpm run build                # Compile TypeScript
pnpm run test:unit            # Run all unit tests
pnpm run test:unit:node       # Node.js tests only
pnpm run test:unit:browser    # Browser tests only
pnpm run lint                 # Run ESLint
```

**Depends on:** `@microsoft/app-manifest`

---

### `@microsoft/m365agentstoolkit-mcp` — `packages/mcp-server`

MCP (Model Context Protocol) server for agent tooling integration.

```bash
cd packages/mcp-server

pnpm run build          # Production build
pnpm run build:dev      # Development build
pnpm run test:unit      # Run unit tests
pnpm run lint           # Run ESLint
pnpm run watch          # Watch mode
```

**Depends on:** `@microsoft/app-manifest`

---

### `@microsoft/metrics-ts` — `packages/metrics-ts`

TypeScript metrics and telemetry utilities.

```bash
cd packages/metrics-ts

pnpm run build          # Compile TypeScript
pnpm run lint           # Run ESLint
```

**No internal dependencies.**

---

### `@microsoft/adaptivecards-tools` — `packages/adaptivecards-tools-sdk`

SDK for working with Adaptive Cards in Teams applications.

```bash
cd packages/adaptivecards-tools-sdk

pnpm run build          # Compile TypeScript
pnpm run lint           # Run ESLint
```

**No internal dependencies.**

---

### `@microsoft/eslint-plugin-teamsfx` — `packages/eslint-plugin-teamsfx`

Custom ESLint rules for Teams/toolkit development.

```bash
cd packages/eslint-plugin-teamsfx

pnpm run lint           # Run ESLint
pnpm run test           # Run tests
```

**No internal dependencies.**

---

### `templates/`

Scaffolding templates for project generation.

```bash
cd templates

pnpm run build          # Build templates
pnpm run clean          # Clean build artifacts
```

**No internal dependencies.** Used by `fx-core` at runtime for project scaffolding.

> **Important:** Templates are **zipped and copied** into `packages/fx-core/templates/` during `pnpm run build`. The CLI and VS Code extension read from these compiled templates, not the raw source files. After modifying any template, you **must** rebuild templates before rebuilding the CLI or extension:
>
> ```bash
> cd templates && pnpm run build
> cd ../packages/cli && pnpm run build   # or rebuild the extension
> ```

---

### `@microsoft/teamsfx-test` — `packages/tests`

End-to-end test suite for the toolkit.

```bash
cd packages/tests

pnpm run build              # Build test harness
pnpm run test:e2e           # Run all E2E tests
pnpm run test:e2e:smoke     # Run smoke tests only
pnpm run test:e2e:parallel  # Run E2E tests in parallel
```

**Depends on:** `@microsoft/teamsfx-api`, `@microsoft/teamsfx-core`, `@microsoft/m365agentstoolkit-cli`

---

## Testing

The repository uses **Mocha** as the test framework with **nyc** for code coverage.

```bash
# Run unit tests for all packages
pnpm -r run test:unit

# Run tests for a specific package
pnpm --filter @microsoft/teamsfx-core run test:unit

# Run a specific test file directly
cd packages/fx-core
npx nyc mocha --no-timeouts --require ts-node/register "tests/path/to/file.test.ts"
```

## Linting

The repository uses **ESLint** with package-level configurations.

```bash
# Lint all packages
pnpm -r run lint

# Lint a specific package
pnpm --filter @microsoft/teamsfx-core run lint

# Auto-fix lint issues (where available)
cd packages/fx-core
pnpm run lint:fix
```

## Commit Conventions

This repository enforces **Conventional Commits** via commitlint and husky:

- **Format:** `type(scope): description`
- **Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `revert`, `perf`, `ci`, `build`
- The `pre-commit` hook runs `lerna run precommit` (lint-staged) on changed packages
- The `commit-msg` hook validates the commit message format

## Coding Standards

- **Indentation:** 2 spaces for TypeScript/JavaScript
- **Quotes:** Double quotes for strings
- **Line endings:** LF (Unix-style); CRLF only for `**/package.nls.*.json` localization files

## Generating Local Artifacts

### CLI Tarball

Generate a local `.tgz` tarball of the CLI for testing or distribution:

```bash
# Build the CLI and all its dependencies, then pack
pnpm --filter @microsoft/m365agentstoolkit-cli... run build
cd packages/cli && pnpm pack
```

This produces `packages/cli/microsoft-m365agentstoolkit-cli-<version>.tgz`.

You can install it locally to test:

```bash
npm install -g ./packages/cli/microsoft-m365agentstoolkit-cli-*.tgz
```

### VS Code Extension (.vsix)

Generate a `.vsix` package for sideloading the extension into VS Code:

```bash
# Build the extension and all its dependencies, then package
pnpm --filter ms-teams-vscode-extension... run build
cd packages/vscode-extension && npx vsce package
```

This produces `packages/vscode-extension/ms-teams-vscode-extension-<version>.vsix`.

Install it in VS Code:

```bash
code --install-extension ./packages/vscode-extension/ms-teams-vscode-extension-*.vsix
```

> **Note:** Both `*.tgz` and `*.vsix` files are already in `.gitignore` and should never be committed.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Defines workspace packages |
| `lerna.json` | Lerna config (independent versioning, pnpm client) |
| `.npmrc` | Enables pre/post scripts, disables shared lockfile |
| `commitlint.config.js` | Conventional commit enforcement |
| `.husky/` | Git hooks (pre-commit, commit-msg) |
| `codecov.yml` | Code coverage reporting config |
| `eslint-local-rules.js` | Custom ESLint rules for the monorepo |
