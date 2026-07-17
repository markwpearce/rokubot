/**
 * Every command funnels its result through here so --json is consistent everywhere - agents
 * can rely on one output contract no matter which command they called.
 */
export function printResult(data: unknown, json: boolean, humanRender?: (data: any) => string): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(humanRender ? humanRender(data) : String(data));
}

export function printError(error: unknown, json: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  if (json) {
    console.error(JSON.stringify({ error: message }, null, 2));
    return;
  }
  console.error(`Error: ${message}`);
}
