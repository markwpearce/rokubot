import { describe, it, expect } from 'vitest';
import { resolveKey } from '../../src/keys';

describe('resolveKey', () => {
  it('passes through canonical key names', () => {
    expect(resolveKey('select')).toBe('select');
    expect(resolveKey('up')).toBe('up');
  });

  it('is case-insensitive', () => {
    expect(resolveKey('SELECT')).toBe('select');
    expect(resolveKey('Up')).toBe('up');
  });

  it('resolves aliases', () => {
    expect(resolveKey('ok')).toBe('select');
    expect(resolveKey('ff')).toBe('fwd');
    expect(resolveKey('forward')).toBe('fwd');
    expect(resolveKey('fastforward')).toBe('fwd');
    expect(resolveKey('rw')).toBe('rev');
    expect(resolveKey('rewind')).toBe('rev');
    expect(resolveKey('options')).toBe('info');
    expect(resolveKey('*')).toBe('info');
    expect(resolveKey('replay')).toBe('instantreplay');
  });

  it('resolves aliases case-insensitively', () => {
    expect(resolveKey('OK')).toBe('select');
    expect(resolveKey('FF')).toBe('fwd');
    expect(resolveKey('Options')).toBe('info');
  });
});
