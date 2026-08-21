export function toScriptcRequestInit(init: RequestInit): RequestInit {
  // ScriptC's native fetch intentionally rejects browser policy options. They
  // have no useful meaning in this server-side application.
  const { credentials, cache, ...compatible } = init;
  void credentials;
  void cache;
  return compatible;
}

export const scriptcFetch: typeof fetch = (input, init) =>
  fetch(input, init ? toScriptcRequestInit(init) : undefined);
