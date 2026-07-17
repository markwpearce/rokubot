import type { CommandModule } from 'yargs';
import * as fs from 'fs';
import { printResult, printError } from '../output';
import type { GlobalArgs } from '../cli-types';

function skillTemplate(appName: string): string {
  return `# ${appName} — Roku app skill

Learned by driving this app with \`rokubot\` (screenshot, then act, then screenshot again).
Fill in each section below as you explore. Keep entries short and concrete.

## Overview
- What does this app do? Who is it for?
- App/channel id (from \`rokubot active-app\` while it's running): _fill in_

## Setup
- Device host: set via \`--host\`, \`ROKU_HOST\`, or \`.env\`
- Dev password: set via \`--password\`, \`ROKU_PASSWORD\`, or \`.env\`
- How to launch it: \`rokubot launch <appId>\`

## Screens discovered
| Screen | How to get there | Screenshot | Notes |
| --- | --- | --- | --- |
| Home / landing | \`rokubot launch <appId>\` | | |

## Common actions
| Goal | Command(s) |
| --- | --- |
| Search for a title | \`rokubot press select\` on the search icon, then \`rokubot text "<query>"\` |

## Known issues / quirks
- _fill in anything surprising: slow transitions, screens that need a specific button sequence, etc._
`;
}

interface SkillInitArgs extends GlobalArgs {
  appName: string;
  out: string;
}

export const skillCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: 'skill <subcommand>',
  describe: 'Scaffold a SKILL.md for an agent to fill in while it explores an app',
  builder: (yargs) =>
    yargs.command<SkillInitArgs>(
      'init',
      'Write a starter SKILL.md template',
      (y) =>
        y
          .option('app-name', { type: 'string', default: 'This app', describe: 'Name of the app being documented' })
          .option('out', { type: 'string', default: 'SKILL.md', describe: 'Output path for the template' }),
      (argv) => {
        try {
          if (fs.existsSync(argv.out)) {
            throw new Error(`${argv.out} already exists - remove it or pass a different --out path`);
          }
          fs.writeFileSync(argv.out, skillTemplate(argv.appName));
          printResult({ path: argv.out }, argv.json, (r) => `Wrote ${r.path}`);
        } catch (error) {
          printError(error, argv.json);
          process.exitCode = 1;
        }
      },
    ),
  handler: () => {},
};
