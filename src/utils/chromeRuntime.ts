import type { ExtensionMessage } from '../types';

export const EXTENSION_CONTEXT_INVALIDATED_EVENT = 'devscope:extension-context-invalidated';

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function extensionContextAvailable(): boolean {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export function isExtensionContextInvalidated(error: unknown): boolean {
  return !extensionContextAvailable() || /extension context invalidated/i.test(errorMessage(error));
}

function announceInvalidatedContext(): void {
  try { window.dispatchEvent(new Event(EXTENSION_CONTEXT_INVALIDATED_EVENT)); } catch { /* No page window in this context. */ }
}

export async function sendRuntimeMessage<T>(message: ExtensionMessage): Promise<T> {
  try {
    if (!extensionContextAvailable()) throw new Error('Extension context invalidated.');
    return await chrome.runtime.sendMessage(message) as T;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) announceInvalidatedContext();
    throw error;
  }
}

export function sendRuntimeMessageQuietly(message: ExtensionMessage, onInvalidated?: () => void): void {
  let invalidationHandled = false;
  const invalidated = (): void => {
    if (invalidationHandled) return;
    invalidationHandled = true;
    announceInvalidatedContext();
    try { onInvalidated?.(); } catch { /* Invalidated-context cleanup must stay best-effort. */ }
  };

  try {
    if (!extensionContextAvailable()) {
      invalidated();
      return;
    }
    const pending = chrome.runtime.sendMessage(message, () => {
      // Chrome only exposes runtime.lastError during this callback. Reading it
      // here prevents a rejected send from surfacing as an uncaught page error.
      let lastError: { message?: string } | undefined;
      try { lastError = chrome.runtime.lastError; } catch { invalidated(); return; }
      if (lastError && isExtensionContextInvalidated(lastError.message ?? lastError)) invalidated();
    }) as unknown as Promise<unknown> | undefined;
    // Some Chromium versions also return a Promise for callback-style calls.
    // It can reject on extension reload without ever running the callback.
    void pending?.catch((error: unknown) => {
      if (isExtensionContextInvalidated(error)) invalidated();
    });
  } catch (error) {
    if (isExtensionContextInvalidated(error)) invalidated();
  }
}
