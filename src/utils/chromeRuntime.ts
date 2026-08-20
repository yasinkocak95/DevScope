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

export function sendRuntimeMessageQuietly(message: ExtensionMessage): void {
  void sendRuntimeMessage(message).catch(() => undefined);
}
