export type DevScopeSection = 'overview' | 'network' | 'bug' | 'recorder' | 'storage' | 'settings';
export type DevScopeMode = 'popup' | 'panel' | 'floating';

export const DEFAULT_SECTION: DevScopeSection = 'overview';
export const DEV_SCOPE_MODES: readonly DevScopeMode[] = ['popup', 'panel', 'floating'];

const SECTIONS: readonly DevScopeSection[] = ['overview', 'network', 'bug', 'recorder', 'storage', 'settings'];
const ACTIVE_SECTION_PREFIX = 'devscope:active-section';

export function activeSectionKey(mode: DevScopeMode, tabId: number): string {
  return `${ACTIVE_SECTION_PREFIX}:${mode}:${tabId}`;
}

export function isDevScopeSection(value: unknown): value is DevScopeSection {
  return typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);
}

export async function getActiveSection(mode: DevScopeMode, tabId: number): Promise<DevScopeSection> {
  const key = activeSectionKey(mode, tabId);
  const result = await chrome.storage.local.get(key);
  return isDevScopeSection(result[key]) ? result[key] : DEFAULT_SECTION;
}

export async function saveActiveSection(mode: DevScopeMode, tabId: number, section: DevScopeSection): Promise<void> {
  await chrome.storage.local.set({ [activeSectionKey(mode, tabId)]: section });
}

export async function removeActiveSections(tabId: number): Promise<void> {
  await chrome.storage.local.remove(DEV_SCOPE_MODES.map((mode) => activeSectionKey(mode, tabId)));
}
