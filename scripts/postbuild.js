// Makes dist/cli.js directly executable (it has a shebang) so it can be invoked as
// `./node_modules/rokubot/dist/cli.js <command>` without going through `npx` - useful for
// tight agent loops where npx's per-call resolution overhead adds up. See README.
const fs = require('fs');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
fs.chmodSync(cliPath, 0o755);
