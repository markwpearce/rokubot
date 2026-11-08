/** An element's attributes followed by its content, so `field()` can find a value in either. */
export function block(xml: string, tag: string): string | undefined {
  const element = xml.match(new RegExp(`<${tag}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${tag}>)`));
  return element ? `${element[1] ?? ''} ${element[2] ?? ''}` : undefined;
}

/** A leaf value, as a child element (`<user>1.5</user>`) or failing that an attribute (`user="1.5"`). */
export function field(xml: string, name: string): string | undefined {
  const element = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`))?.[1];
  return (element ?? xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1])?.trim();
}

export function numberField(xml: string, name: string): number | undefined {
  const text = field(xml, name);
  if (text === undefined || text === '') {
    return undefined;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** Throws on a non-OK `<status>`, with the device's `<error>` text, so every query fails the same way. */
export function checkEcpStatus(xml: string, query: string, hint: string): void {
  const status = field(xml, 'status');
  if (status && status.toUpperCase() !== 'OK') {
    const error = field(xml, 'error');
    throw new Error(`${query} returned status ${status}${error ? ` (${error})` : ''} - ${hint}`);
  }
}
