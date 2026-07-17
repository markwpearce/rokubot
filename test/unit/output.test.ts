import { describe, it, expect, vi, afterEach } from 'vitest';
import { printResult, printError } from '../../src/output';

describe('printResult', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints pretty JSON when json is true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printResult({ a: 1 }, true);
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ a: 1 }, null, 2));
  });

  it('uses the human renderer when json is false', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printResult({ a: 1 }, false, (data) => `a is ${data.a}`);
    expect(spy).toHaveBeenCalledWith('a is 1');
  });

  it('falls back to String(data) when no renderer is given', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printResult('hello', false);
    expect(spy).toHaveBeenCalledWith('hello');
  });
});

describe('printError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a JSON error envelope when json is true', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    printError(new Error('boom'), true);
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ error: 'boom' }, null, 2));
  });

  it('prints a plain message when json is false', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    printError(new Error('boom'), false);
    expect(spy).toHaveBeenCalledWith('Error: boom');
  });

  it('stringifies non-Error values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    printError('plain string', false);
    expect(spy).toHaveBeenCalledWith('Error: plain string');
  });
});
