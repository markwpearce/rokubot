#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { infoCommand } from './commands/info';
import { appsCommand } from './commands/apps';
import { activeAppCommand } from './commands/activeApp';
import { launchCommand } from './commands/launch';
import { pressCommand } from './commands/press';
import { textCommand } from './commands/text';
import { screenshotCommand } from './commands/screenshot';
import { consoleCommand } from './commands/console';
import { sideloadCommand } from './commands/sideload';
import { ecpCommand } from './commands/ecp';
import { skillCommand } from './commands/skill';

export function run(argv: string[] = hideBin(process.argv)): void {
  yargs(argv)
    .scriptName('rokubot')
    .usage('$0 <command>', 'Drive any Roku device via ECP - built for Roku developers and for AI agents')
    .option('host', { type: 'string', describe: 'IP address of the Roku (defaults to ROKU_HOST)' })
    .option('password', { type: 'string', describe: 'Roku dev password (defaults to ROKU_PASSWORD)' })
    .option('json', { type: 'boolean', default: false, describe: 'Print machine-readable JSON output' })
    .command(infoCommand)
    .command(appsCommand)
    .command(activeAppCommand)
    .command(launchCommand)
    .command(pressCommand)
    .command(textCommand)
    .command(screenshotCommand)
    .command(consoleCommand)
    .command(sideloadCommand)
    .command(ecpCommand)
    .command(skillCommand)
    .demandCommand(1)
    .strict()
    .help()
    .parse();
}

if (require.main === module) {
  run();
}
