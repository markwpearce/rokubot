# rokubot

[![npm version](https://img.shields.io/npm/v/rokubot.svg)](https://www.npmjs.com/package/rokubot)
[![CI](https://github.com/markwpearce/rokubot/actions/workflows/ci.yml/badge.svg)](https://github.com/markwpearce/rokubot/actions/workflows/ci.yml)

A CLI for driving **any** Roku device — sideload, remote control, screenshots, and debug console —
built for Roku developers and for AI agents that need to explore an app and document what it does.

Point it at a device with `--host`/`--password` (or a `.env` file) and it works against any channel,
sideloaded or not.

```
rokubot info
rokubot press select
rokubot text "star wars"
rokubot screenshot
```

## Why

Roku's [External Control Protocol (ECP)](https://developer.roku.com/docs/developer-program/debugging/external-control-api.md)
and the telnet debug console are the two ways to drive a device programmatically, but there's no
official, general-purpose CLI on top of them. [`roku-deploy`](https://github.com/rokucommunity/roku-deploy)
(from [RokuCommunity](https://github.com/rokucommunity)) covers sideloading, key presses, text
entry, and screenshots — `rokubot` wraps that and adds the rest: querying installed apps,
launching/deep-linking, a scriptable debug console, and a raw ECP escape hatch, all behind one
consistent command-line interface with a `--json` mode for scripting.

There are other Roku MCP servers in the wild (e.g. `mcp-remote-control`, `roku-mcp`). `rokubot` is
CLI-first — usable standalone from a terminal or CI, in scripts, or as a building block for your
own MCP server — and is specifically designed around a **screenshot → act → screenshot** loop so
an agent can learn an app and write a `SKILL.md` about it (see [Using rokubot with AI
agents](#using-rokubot-with-ai-agents) below).

## Install

[rokubot is on npm](https://www.npmjs.com/package/rokubot):

```
npm install -g rokubot
```

Or use it without installing:

```
npx rokubot info --host 192.168.1.50 --password <dev-password>
```

### Fast invocation for tight loops

`npx` re-resolves the package on every call, which adds noticeable overhead if you're calling
`rokubot` many times in a row - e.g. an agent's screenshot→act loop. For that, skip `npx` and call
the installed CLI file directly instead:

```
# Installed locally as a project dependency:
./node_modules/.bin/rokubot press up --screenshot

# Or straight at the built file:
./node_modules/rokubot/dist/cli.js press up --screenshot

# Installed globally, `rokubot` is already the direct binary - no npx needed:
rokubot press up --screenshot
```

All three invoke the same file with no extra resolution step; prefer whichever path is easiest to
reference in your agent's working directory.

## Setup

Every command needs a device host and its developer password (the same ones you use to open
`http://<device-ip>` in a browser and log in to the developer web installer). Provide them in
whichever way's convenient:

- Flags: `--host 192.168.1.50 --password abcd`
- Environment variables: `ROKU_HOST`, `ROKU_PASSWORD`
- A `.env` file in the current directory (see `env.example`)
- A `rokubot.config.json` file in the current directory: `{ "host": "...", "password": "..." }`

Precedence is flags > env vars > `.env` > `rokubot.config.json`.

## Commands

| Command | What it does |
| --- | --- |
| `rokubot info` | Device info: model, Roku OS version, friendly name |
| `rokubot apps` | List installed apps/channels |
| `rokubot active-app` | Which app is currently in the foreground |
| `rokubot launch [appId]` `--param k=v` | Launch or deep-link into an app (`appId` defaults to `dev`, the id a sideloaded channel always runs as) |
| `rokubot press <key..>` `--action keypress\|keydown\|keyup` `--screenshot` `--scale <factor>` `--delay <seconds>` | Send one or more remote keys in order (`up`/`down`/`left`/`right`/`select`/`back`/`home`/`play`/`rev`/`fwd`/`instantreplay`/`info`/`backspace`/`search`/`enter`/...), pausing `--delay` (default `0.25`) seconds between each |
| `rokubot text <text>` `--screenshot` `--scale <factor>` | Type literal text, e.g. into a search box |
| `rokubot screenshot` `--dir <path>` `--scale <factor>` | Capture a screenshot (requires a sideloaded/dev channel to be in the foreground - Roku's screenshot API doesn't work from Home). `--scale 0.5` produces a smaller output file - see [Known limitations](#known-limitations) for the speed tradeoff |
| `rokubot console` `--send "<cmd>"` `--timeout <ms>` | Stream the debug console, or send one command and get its response back |
| `rokubot interactive` | Drive the device live from your keyboard while the debug console streams in the background - see [key mapping](#rokubot-interactive-key-mapping) below |
| `rokubot sideload <projectDirOrZip>` `--deleteDevChannel` | Stage+zip+sideload a Roku project, or sideload an existing `.zip` |
| `rokubot ecp <method> <path>` | Raw ECP escape hatch for anything not covered above |
| `rokubot skill init` `--app-name <name>` `--out <path>` | Scaffold a `SKILL.md` template to fill in while exploring an app |

Pass `--json` to any command for machine-readable output.

### `rokubot interactive` key mapping

| Keyboard | Sends |
| --- | --- |
| Up / Down / Left / Right | `up` / `down` / `left` / `right` |
| Enter | `select` |
| Backspace | `back` |
| Space | `play` |
| `h` | `home` |
| `i` | `info` |
| `r` | `rev` |
| `f` | `fwd` |
| `*` | `instantreplay` |
| Esc | Pause navigation and send a one-off debug-console command (like `console --send`), then resume |
| `q` / Ctrl+C | Quit |

This same table is also printed at the start of every `rokubot interactive` session and via `rokubot interactive --help`.

### Examples

```bash
# See what's currently on screen, then navigate and look again
rokubot screenshot
rokubot press down --screenshot   # one round trip: press, then screenshot the result
rokubot press down --screenshot --scale 0.5   # ...and shrink the output file (slightly slower call, smaller file)

# Type into a search box
rokubot press select
rokubot text "the mandalorian"

# Send a sequence of key presses in one call, e.g. to back out three levels of navigation
rokubot press back back back --delay 0.5

# Drive the device live from the keyboard, with the debug console streaming alongside
rokubot interactive

# Deep-link into a piece of content
rokubot launch dev --param contentId=abc123 --param mediaType=movie

# Inspect a variable while paused at a breakpoint in the debug console
rokubot console --send "print myNode.getChildCount()"

# Sideload a build and immediately launch it
rokubot sideload ./out/my-channel --deleteDevChannel
rokubot launch dev
```

## Using rokubot with AI agents

`rokubot` is built around a simple loop an agent can drive without any special tooling:

1. `rokubot screenshot` (or `rokubot press <key..> --screenshot`) to see the current state.
2. Read the screenshot file with whatever image-reading tool the agent has.
3. Decide the next action and call `rokubot press`/`rokubot text`/`rokubot launch` again.
4. Repeat until the goal is reached, calling `rokubot active-app` or `rokubot console --send` for
   extra ground truth when the screen alone isn't enough.

For this loop, invoke the installed CLI file directly rather than through `npx` (see [Fast
invocation for tight loops](#fast-invocation-for-tight-loops)). If you want smaller screenshot
files for the agent to transmit/process, `--scale 0.5` gives you that - but it makes the `rokubot
screenshot` call itself slightly slower, not faster (see [Known
limitations](#known-limitations)), so only reach for it if file size, not call latency, is your
bottleneck.

Every command supports `--json`, so an agent can parse results reliably instead of scraping
human-formatted text.

To turn what an agent learns into something reusable, run `rokubot skill init` to scaffold a
`SKILL.md` template (Overview / Setup / Screens Discovered / Common Actions / Known Issues), then
have the agent fill it in as it explores - as a session, that file becomes durable documentation
for the next agent (or human) that needs to drive the same app.

```bash
rokubot skill init --app-name "My Channel"
# ... agent explores the app, screenshotting and pressing keys ...
# ... agent edits SKILL.md with what it found ...
```

## Programmatic use

The same functions the CLI commands call are exported for use from Node/TypeScript:

```ts
import { resolveConfig, EcpClient, captureScreenshot } from 'rokubot';

const config = resolveConfig({ host: '192.168.1.50', password: 'abcd' });
const ecp = new EcpClient({ host: config.host });
console.log(await ecp.getActiveApp());
```

## Known limitations

- Depends on `roku-deploy` **v4**, currently a pre-release (`4.0.0-alpha.2`). Its API may still
  change before a stable v4 ships; this will be revisited when it does.
- `rokubot console` uses a plain TCP socket against the telnet debug console (port 8085), the same
  approach as manually `telnet`-ing in. It can send commands and read text back, but it doesn't
  give structured breakpoint/variable data the way the binary BrightScript Debug Protocol (and
  [`roku-debug`](https://github.com/rokucommunity/roku-debug), which wraps it for IDEs) does. If
  you need reliable structured variable/stack inspection, `roku-debug` is worth layering in later.
- `rokubot screenshot` only works while a sideloaded/dev channel is in the foreground - that's a
  limitation of Roku's screenshot ECP endpoint, not of this tool.
- Taking a screenshot during video playback will likely capture a black frame - Roku's screenshot
  API doesn't read back the video plane (HDCP/DRM content in particular is never captured), so
  don't rely on it to see what's actually playing, only surrounding UI.
- `--scale` does not make `rokubot screenshot` faster - the device always sends the full-resolution
  image over the network regardless of this flag, and shrinking happens afterward, client-side, by
  decoding, resizing, and re-encoding the JPEG. That costs more time than it saves, so a scaled
  call is slightly *slower* than a full-size one, not faster. What you get in exchange is a smaller
  output file, though by how much depends heavily on the screen's content (a full quarter-pixel
  reduction rarely translates into a proportional file-size drop, since JPEG compression already
  squeezes out a lot of that). Use `--scale` when you want a cheaper file for an agent to
  transmit/process, not when you want a faster CLI call.

## Development

```
npm install
npm run build
npm test
npm run lint
```

## License

MIT
