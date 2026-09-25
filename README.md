# Agentline

Agentline is a draft coordination language for named agents. It aims to give
agent identities, focus, and routed instructions a shared syntax across agent
runtimes. This repository's first working implementation is an OpenCode v2 TUI
plugin. Agents may begin locally as notes and later attach to OpenCode;
OpenCode owns attached sessions, durable queues, and execution.

The product goal is one workspace for addressing multiple agents and seeing
their active conversations together. The current OpenCode implementation is
an early step: it has a shared chronological response feed and an activity
sidebar, with one response actively revealed at a time.

## Development

Agentline targets upstream OpenCode `v2`, not the installed stable OpenCode
executable. Keep one ignored upstream checkout beside Agentline's source:

```bash
git clone --branch v2 https://github.com/anomalyco/opencode.git opencode-v2
git -C opencode-v2 checkout "$(tr -d '\n' < OPENCODE_V2_REVISION)"
bun run setup:v2
```

`setup:v2` verifies the pinned commit, installs the upstream workspace, links
its v2 client and plugin packages into Agentline, and installs Agentline's
remaining dependencies. The checkout remains its own Git repository and is
ignored by Agentline.

Run the type check and the upstream development TUI. With no directory argument it
opens Agentline itself; pass another directory to use Agentline there:

```bash
bun run check
bun run opencode:v2
bun run opencode:v2 -- /path/to/another/project
```

The launcher keeps the plugin source and target project independent. It points
the v2 development TUI at Agentline's tracked plugin entrypoint:

```text
.opencode/plugins/tui/agentline.tsx
```

That entrypoint re-exports `src/opencode/plugin.tsx`, while the directory
argument becomes OpenCode's project and session location. Restart the
development TUI after editing Agentline source; the wrapper itself is the file
watched by the current upstream plugin loader.

To advance upstream deliberately, fetch `origin/v2`, review the relevant API
and TUI changes, update `OPENCODE_V2_REVISION`, run `bun run setup:v2`, then run
`bun run check` and a live queue smoke test. Do not maintain parallel 1.x and v2
implementations. When v2 packages are published, the two `link:` dependencies
can become normal versioned dependencies without changing Agentline's host
boundary.

## Website

The language-first project site lives in `website/` as a separate TanStack Start
app. To run it locally:

```bash
cd website
bun install --frozen-lockfile
bun run dev
```

## Repository structure

```text
src/core/       framework-neutral Agentline logic
src/language/   staged target-language parser and diagnostics
src/opencode/   OpenCode adapter and TUI
website/        project site and syntax guide
```

## Current upstream issue

OpenCode v2 can fail to start its managed service during local development
([upstream issue #41324](https://github.com/anomalyco/opencode/issues/41324)).
Until that is resolved, start the service in a separate terminal:

```bash
cd opencode-v2
OPENCODE_CONFIG_DIR="$(pwd)/../.opencode" bun run --cwd packages/cli --conditions=browser src/index.ts serve --service
```
