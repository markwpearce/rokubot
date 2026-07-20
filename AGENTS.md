# AGENTS.md

Guidance for AI agents (and contributors) working in this repo.

## What this is

`rokubot` is a CLI for driving any Roku device via ECP and `roku-deploy` — for Roku developers
and for AI agents to explore, screenshot, and learn an app.

## Setup

```
npm install
npm run build
npm test
```

## Before opening a PR / finishing a change

- `npm run typecheck`, `npm run lint`, and `npm test` should all pass.
- Add or update tests for behavior changes — see `test/unit` and `test/integration` for the
  existing patterns (local `http`/`net` fixture servers instead of a real device or a mocking
  library).
- Keep commands' human output and `--json` output in sync - every command should return the same
  data through both paths (see `src/output.ts`).
- Update `CHANGELOG.md` under `[Unreleased]` for any user-facing change (new command, flag,
  behavior change, bug fix). Skip it only for internal-only changes (tests, CI, refactors with no
  behavior change).

## Project layout

- `src/ecp/client.ts` - generic ECP HTTP client (covers what `roku-deploy` doesn't expose).
- `src/deploy/` - thin wrappers around `roku-deploy`.
- `src/commands/` - one file per CLI command; each exports a yargs `CommandModule` plus any
  reusable functions other commands need (e.g. `captureScreenshot` from `screenshot.ts`).
- `src/cli.ts` - wires commands into yargs; `src/index.ts` - the programmatic/public API surface.

## Releasing

1. Move the `[Unreleased]` section of `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD`
   heading (matching the version being released).
2. Bump `version` in `package.json` to match.
3. Commit as `Bump version to x.y.z`, tag `vx.y.z`, and publish per the usual npm flow.
