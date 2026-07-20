# Contributing

Issues and PRs are welcome.

## Setup

```
npm install
npm run build
npm test
```

## Before opening a PR

- `npm run typecheck`, `npm run lint`, and `npm test` should all pass.
- Add or update tests for behavior changes - see `test/unit` and `test/integration` for the
  existing patterns (local `http`/`net` fixture servers instead of a real device or a mocking
  library).
- Keep commands' human output and `--json` output in sync - every command should return the same
  data through both paths (see `src/output.ts`).
- Update `CHANGELOG.md` under `[Unreleased]` for any user-facing change.

## Project layout

- `src/ecp/client.ts` - generic ECP HTTP client (covers what `roku-deploy` doesn't expose).
- `src/deploy/` - thin wrappers around `roku-deploy`.
- `src/commands/` - one file per CLI command; each exports a yargs `CommandModule` plus any
  reusable functions other commands need (e.g. `captureScreenshot` from `screenshot.ts`).
- `src/cli.ts` - wires commands into yargs; `src/index.ts` - the programmatic/public API surface.
