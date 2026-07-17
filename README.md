# rokubot

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

```
npm install -g rokubot
```

Or use it without installing:

```
npx rokubot info --host 192.168.1.50 --password <dev-password>
```

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
| `rokubot press <key>` `--action keypress\|keydown\|keyup` `--screenshot` | Send a remote key (`up`/`down`/`left`/`right`/`select`/`back`/`home`/`play`/`rev`/`fwd`/`instantreplay`/`info`/`backspace`/`search`/`enter`/...) |
| `rokubot text <text>` `--screenshot` | Type literal text, e.g. into a search box |
| `rokubot screenshot` `--dir <path>` | Capture a screenshot (requires a sideloaded/dev channel to be in the foreground - Roku's screenshot API doesn't work from Home) |
| `rokubot console` `--send "<cmd>"` `--timeout <ms>` | Stream the debug console, or send one command and get its response back |
| `rokubot sideload <projectDirOrZip>` `--deleteDevChannel` | Stage+zip+sideload a Roku project, or sideload an existing `.zip` |
| `rokubot ecp <method> <path>` | Raw ECP escape hatch for anything not covered above |
| `rokubot skill init` `--app-name <name>` `--out <path>` | Scaffold a `SKILL.md` template to fill in while exploring an app |

Pass `--json` to any command for machine-readable output.

### Examples

```bash
# See what's currently on screen, then navigate and look again
rokubot screenshot
rokubot press down --screenshot   # one round trip: press, then screenshot the result

# Type into a search box
rokubot press select
rokubot text "the mandalorian"

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

1. `rokubot screenshot` (or `rokubot press <key> --screenshot`) to see the current state.
2. Read the screenshot file with whatever image-reading tool the agent has.
3. Decide the next action and call `rokubot press`/`rokubot text`/`rokubot launch` again.
4. Repeat until the goal is reached, calling `rokubot active-app` or `rokubot console --send` for
   extra ground truth when the screen alone isn't enough.

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

## Development

```
npm install
npm run build
npm test
npm run lint
```

## License

MIT
