const shutdownController = new AbortController();

export class ShutdownError extends Error {
  constructor() {
    super("Shutdown requested");
    this.name = "ShutdownError";
  }
}

export function requestShutdown(): boolean {
  if (shutdownController.signal.aborted) {
    return false;
  }

  shutdownController.abort();
  return true;
}

export function isShutdownRequested(): boolean {
  return shutdownController.signal.aborted;
}

export function throwIfShutdownRequested(): void {
  if (isShutdownRequested()) {
    throw new ShutdownError();
  }
}

export function isShutdownError(error: unknown): boolean {
  return error instanceof ShutdownError;
}
