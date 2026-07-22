import type { RokuKey } from 'roku-deploy';

/** Aliases for RokuKey names, e.g. shorthand or alternate labels found on physical remotes. */
const KEY_ALIASES: Record<string, RokuKey> = {
  ok: 'select',
  ff: 'fwd',
  forward: 'fwd',
  fastforward: 'fwd',
  rw: 'rev',
  rewind: 'rev',
  options: 'info',
  '*': 'info',
  replay: 'instantreplay',
  poweron: 'poweroff',
  power: 'poweroff',
  volup: 'volumeup',
  voldown: 'volumedown',
  volmute: 'volumemute',
  mute: 'volumemute',
  chup: 'channelup',
  chdown: 'channeldown',
  del: 'backspace',
};

/**
 * Resolves user-supplied key names to the canonical `RokuKey` accepted by the ECP API,
 * matching case-insensitively and applying known aliases (e.g. `ok` -> `select`, `ff` -> `fwd`).
 */
export function resolveKey(input: string): RokuKey {
  const normalized = input.toLowerCase();
  return (KEY_ALIASES[normalized] ?? normalized) as RokuKey;
}
