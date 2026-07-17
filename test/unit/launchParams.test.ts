import { describe, it, expect } from 'vitest';
import { parseParams } from '../../src/commands/launch';

describe('parseParams', () => {
  it('parses key=value pairs', () => {
    expect(parseParams(['contentId=abc123', 'mediaType=movie'])).toEqual({
      contentId: 'abc123',
      mediaType: 'movie',
    });
  });

  it('returns an empty object for no pairs', () => {
    expect(parseParams([])).toEqual({});
  });

  it('allows "=" inside the value', () => {
    expect(parseParams(['query=a=b'])).toEqual({ query: 'a=b' });
  });

  it('throws on a pair with no "="', () => {
    expect(() => parseParams(['notapair'])).toThrow(/Invalid --param/);
  });
});
