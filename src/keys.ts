import type { RokuKey } from 'roku-deploy';

/** Canonical key names accepted by the ECP API. */
const ROKU_KEYS: readonly RokuKey[] = [
  'back',
  'backspace',
  'channeldown',
  'channelup',
  'down',
  'enter',
  'findremote',
  'fwd',
  'home',
  'info',
  'inputav1',
  'inputhdmi1',
  'inputhdmi2',
  'inputhdmi3',
  'inputhdmi4',
  'inputtuner',
  'instantreplay',
  'left',
  'play',
  'poweroff',
  'rev',
  'right',
  'search',
  'select',
  'up',
  'volumedown',
  'volumemute',
  'volumeup',
];

const ROKU_KEY_SET = new Set<string>(ROKU_KEYS);

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
 * Throws if the name isn't a recognized key or alias.
 */
export function resolveKey(input: string): RokuKey {
  const normalized = input.toLowerCase();
  const resolved = KEY_ALIASES[normalized] ?? normalized;
  if (!ROKU_KEY_SET.has(resolved)) {
    throw new Error(
      `Unrecognized key '${input}'. Valid keys: ${ROKU_KEYS.join(', ')}. ` +
        `Aliases: ${Object.keys(KEY_ALIASES).join(', ')}.`,
    );
  }
  return resolved as RokuKey;
}
