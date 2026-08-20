import { useCallback, useEffect, useState } from 'react';
import type { ExtensionMessage, TabSnapshot } from '../types';

const EMPTY: TabSnapshot = { requests: [], console: [], paused: false };

export function useDevScope(forcedTabId?: number) {
  const [tabId, setTabId] = useState<number | undefined>(forcedTabId);
  const [tabUrl, setTabUrl] = useState('');
  const [snapshot, setSnapshot] = useState<TabSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (forcedTabId !== undefined) {
      setTabId(forcedTabId);
      chrome.tabs.get(forcedTabId).then((tab) => setTabUrl(tab.url ?? '')).catch(() => undefined);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setTabId(tab?.id);
      setTabUrl(tab?.url ?? '');
    }).catch((reason: unknown) => setError(String(reason)));
  }, [forcedTabId]);

  const refresh = useCallback(async () => {
    if (tabId === undefined) return;
    try {
      const message: ExtensionMessage = { type: 'GET_SNAPSHOT', tabId };
      const result = await chrome.runtime.sendMessage(message) as TabSnapshot & { error?: string };
      if (result?.error) throw new Error(result.error);
      setSnapshot(result ?? EMPTY);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [tabId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const listener = (message: { type?: string; tabId?: number }): void => {
      if (message.type === 'DATA_UPDATED' && message.tabId === tabId) void refresh();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh, tabId]);

  const clear = useCallback(async () => {
    if (tabId === undefined) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_TAB', tabId } satisfies ExtensionMessage);
    await refresh();
  }, [refresh, tabId]);

  const setPaused = useCallback(async (paused: boolean) => {
    if (tabId === undefined) return;
    await chrome.runtime.sendMessage({ type: 'SET_PAUSED', tabId, paused } satisfies ExtensionMessage);
    setSnapshot((value) => ({ ...value, paused }));
  }, [tabId]);

  return { tabId, tabUrl, snapshot, loading, error, refresh, clear, setPaused };
}
