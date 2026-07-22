# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `press` key names are now case-insensitive and accept common aliases (`ok`=`select`,
  `ff`/`forward`/`fastforward`=`fwd`, `rw`/`rewind`=`rev`, `options`/`*`=`info`,
  `replay`=`instantreplay`, and more).
- `press` now throws a clear error listing valid keys/aliases when given an unrecognized key name.
- `rokubot debugger-state` command to check whether the app is currently paused at a BrightScript
  Micro Debugger prompt (crashed or hit a breakpoint), distinguishing that from a merely idle/
  unchanged screen without a manual console detour.

## [0.2.0] - 2026-07-17

### Added

- Multi-key `press` support with a `--delay` option between presses.
- Interactive keyboard mode for `press`.

### Changed

- README now links to the published npm package.

## [0.1.1] - 2026-07-17

### Added

- `--scale` option for `screenshot`, `press`, and `text` to trade a slightly slower call for a
  smaller file.
- A direct-invocation fast path.

### Changed

- Use `prepare` instead of `prepublishOnly` so git-URL installs also build.

## [0.1.0] - 2026-07-17

### Added

- Initial `rokubot` CLI: ECP/roku-deploy driven Roku control for developers and AI agents.

[Unreleased]: https://github.com/markwpearce/rokubot/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/markwpearce/rokubot/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/markwpearce/rokubot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/markwpearce/rokubot/releases/tag/v0.1.0
