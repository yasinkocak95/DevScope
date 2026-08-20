import { useCallback, useEffect, useState } from 'react';
import type { ExtensionMessage, TabSnapshot } from '../types';
import { extensionContextAvailable, sendRuntimeMessage } from '../utils/chromeRuntime';

const EMPTY: TabSnapshot = { requests: [], console: [], paused: false, debugSession: { recording: false, events: [] } };

export function useDevScope(forcedTabId?: number) {
  const [tabId, setTabId] = useState<number | undefined>(forcedTabId);
  const [tabUrl, setTabUrl] = useState('');
  const [snapshot, setSnapshot] = useState<TabSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (forcedTabId !== undefined) {
      setTabId(forcedTabId);
      sendRuntimeMessage<{ url?: string }>({ type: 'GET_TAB_INFO', tabId: forcedTabId } satisfies ExtensionMessage)
        .then((tab: { url?: string }) => setTabUrl(tab.url ?? '')).catch(() => undefined);
      return;
    }
    try {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        setTabId(tab?.id);
        setTabUrl(tab?.url ?? '');
      }).catch((reason: unknown) => setError(String(reason)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [forcedTabId]);

  const refresh = useCallback(async () => {
    if (tabId === undefined) return;
    try {
      const message: ExtensionMessage = { type: 'GET_SNAPSHOT', tabId };
      const [result, tab] = await Promise.all([
        sendRuntimeMessage<TabSnapshot & { error?: string }>(message),
        sendRuntimeMessage<{ url?: string }>({ type: 'GET_TAB_INFO', tabId } satisfies ExtensionMessage).catch(() => ({ url: undefined }))
      ]);
      if (result?.error) throw new Error(result.error);
      setSnapshot(result ?? EMPTY);
      setTabUrl(tab?.url ?? '');
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
    try {
      if (!extensionContextAvailable()) return;
      chrome.runtime.onMessage.addListener(listener);
    } catch { return; }
    return () => {
      try {
        if (extensionContextAvailable()) chrome.runtime.onMessage.removeListener(listener);
      } catch { /* The extension was reloaded while this page stayed open. */ }
    };
  }, [refresh, tabId]);

  const clear = useCallback(async () => {
    if (tabId === undefined) return;
    try {
      await sendRuntimeMessage({ type: 'CLEAR_TAB', tabId } satisfies ExtensionMessage);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [refresh, tabId]);

  const setPaused = useCallback(async (paused: boolean) => {
    if (tabId === undefined) return;
    try {
      await sendRuntimeMessage({ type: 'SET_PAUSED', tabId, paused } satisfies ExtensionMessage);
      setSnapshot((value) => ({ ...value, paused }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [tabId]);

  const updateRecording = useCallback(async (type: 'START_DEBUG_RECORDING' | 'STOP_DEBUG_RECORDING' | 'CLEAR_DEBUG_SESSION') => {
    if (tabId === undefined) return;
    try {
      await sendRuntimeMessage({ type, tabId } satisfies ExtensionMessage);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [refresh, tabId]);

  return {
    tabId, tabUrl, snapshot, loading, error, refresh, clear, setPaused,
    startRecording: () => updateRecording('START_DEBUG_RECORDING'),
    stopRecording: () => updateRecording('STOP_DEBUG_RECORDING'),
    clearDebugSession: () => updateRecording('CLEAR_DEBUG_SESSION')
  };
}
