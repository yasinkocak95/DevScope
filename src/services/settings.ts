import type { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  redactSensitiveInformation: true,
  revealSensitiveValues: false,
  captureConsoleErrors: true,
  captureNetworkRequests: true,
  maximumStoredRequests: 200
};

const SETTINGS_KEY = 'devscope:settings';

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
