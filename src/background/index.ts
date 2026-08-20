import { DEFAULT_SETTINGS, getSettings } from '../services/settings';
import type { CookieRecord, ExtensionMessage, Header, NetworkRecord, PageNetworkEvent, RequestRule, Settings, StorageSnapshot, TabSnapshot, WebStorageData } from '../types';

const emptySnapshot = (): TabSnapshot => ({ requests: [], console: [], paused: false });
const keyFor = (tabId: number): string => `devscope:tab:${tabId}`;
const queues = new Map<number, Promise<unknown>>();
const pending = new Map<string, NetworkRecord>();
const RULES_KEY = 'devscope:rules';
let settings: Settings = DEFAULT_SETTINGS;

getSettings().then((value) => { settings = value; }).catch(() => undefined);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['devscope:settings']?.newValue) {
    settings = { ...DEFAULT_SETTINGS, ...(changes['devscope:settings'].newValue as Partial<Settings>) };
  }
});

async function loadSnapshot(tabId: number): Promise<TabSnapshot> {
  const key = keyFor(tabId);
  const result = await chrome.storage.session.get(key);
  return (result[key] as TabSnapshot | undefined) ?? emptySnapshot();
}

async function saveSnapshot(tabId: number, snapshot: TabSnapshot): Promise<void> {
  await chrome.storage.session.set({ [keyFor(tabId)]: snapshot });
  chrome.runtime.sendMessage({ type: 'DATA_UPDATED', tabId }).catch(() => undefined);
}

function updateSnapshot(tabId: number, mutate: (snapshot: TabSnapshot) => void): Promise<void> {
  const previous = queues.get(tabId) ?? Promise.resolve();
  const next = previous.then(async () => {
    const snapshot = await loadSnapshot(tabId);
    mutate(snapshot);
    await saveSnapshot(tabId, snapshot);
  }).catch(() => undefined);
  queues.set(tabId, next);
  return next.then(() => undefined);
}

async function getRules(): Promise<RequestRule[]> {
  const result = await chrome.storage.local.get(RULES_KEY);
  return (result[RULES_KEY] as RequestRule[] | undefined) ?? [];
}

async function applyRule(rule: RequestRule): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [rule.id],
    addRules: rule.enabled ? [{
      id: rule.id,
      priority: 1,
      action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
      condition: {
        urlFilter: rule.urlPattern,
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType]
      }
    }] : []
  });
}

async function saveRule(rule: RequestRule): Promise<RequestRule[]> {
  const rules = await getRules();
  const next = [...rules.filter((item) => item.id !== rule.id), rule].sort((a, b) => a.createdAt - b.createdAt);
  await applyRule(rule);
  await chrome.storage.local.set({ [RULES_KEY]: next });
  return next;
}

async function deleteRule(ruleId: number): Promise<RequestRule[]> {
  const rules = (await getRules()).filter((item) => item.id !== ruleId);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
  await chrome.storage.local.set({ [RULES_KEY]: rules });
  return rules;
}

async function syncRules(): Promise<void> {
  const [rules, active] = await Promise.all([getRules(), chrome.declarativeNetRequest.getDynamicRules()]);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: active.map((rule) => rule.id),
    addRules: rules.filter((rule) => rule.enabled).map((rule) => ({
      id: rule.id,
      priority: 1,
      action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
      condition: { urlFilter: rule.urlPattern, resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType] }
    }))
  });
}

chrome.runtime.onInstalled.addListener(() => { void syncRules(); });
chrome.runtime.onStartup.addListener(() => { void syncRules(); });

async function loadStorageData(tabId: number): Promise<StorageSnapshot> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^https?:/i.test(tab.url)) throw new Error('UNSUPPORTED_TAB');
  const [webStorage, cookies] = await Promise.all([
    chrome.tabs.sendMessage(tabId, { type: 'GET_WEB_STORAGE' } satisfies ExtensionMessage)
      .catch((error: unknown): WebStorageData => ({ local: [], session: [], error: error instanceof Error ? error.message : String(error) })),
    chrome.cookies.getAll({ url: tab.url })
  ]);
  const cookieRecords: CookieRecord[] = cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate
  }));
  return { ...(webStorage as WebStorageData), cookies: cookieRecords };
}

const requestHeaders = (headers?: chrome.webRequest.HttpHeader[]): Header[] =>
  (headers ?? []).map(({ name, value }) => ({ name, value: value ?? '[binary value]' }));

const requestBody = (details: chrome.webRequest.OnBeforeRequestDetails): string | undefined => {
  if (details.requestBody?.formData) return JSON.stringify(details.requestBody.formData);
  const bytes = details.requestBody?.raw?.[0]?.bytes;
  if (!bytes) return undefined;
  try { return new TextDecoder().decode(bytes).slice(0, 100_000); } catch { return undefined; }
};

chrome.webRequest.onBeforeRequest.addListener(
  (details): undefined => {
    if (!settings.captureNetworkRequests || details.tabId < 0 || details.type !== 'xmlhttprequest') return undefined;
    pending.set(details.requestId, {
      id: details.requestId,
      tabId: details.tabId,
      method: details.method,
      url: details.url,
      status: 0,
      startedAt: details.timeStamp,
      duration: 0,
      resourceType: 'xmlhttprequest',
      requestHeaders: [],
      responseHeaders: [],
      requestBody: requestBody(details)
    });
    return undefined;
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['xmlhttprequest'] },
  ['requestBody']
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details): undefined => {
    const item = pending.get(details.requestId);
    if (item) item.requestHeaders = requestHeaders(details.requestHeaders);
    return undefined;
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['xmlhttprequest'] },
  ['requestHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
  (details): undefined => {
    const item = pending.get(details.requestId);
    if (!item) return undefined;
    item.status = details.statusCode;
    item.statusText = details.statusLine;
    item.responseHeaders = requestHeaders(details.responseHeaders);
    item.contentType = item.responseHeaders.find((header) => header.name.toLowerCase() === 'content-type')?.value;
    const contentLength = item.responseHeaders.find((header) => header.name.toLowerCase() === 'content-length')?.value;
    if (contentLength && Number.isFinite(Number(contentLength))) item.responseSize = Number(contentLength);
    return undefined;
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['xmlhttprequest'] },
  ['responseHeaders']
);

async function finishRequest(requestId: string, endTime: number, error?: string): Promise<void> {
  const item = pending.get(requestId);
  if (!item) return;
  pending.delete(requestId);
  item.duration = Math.max(0, endTime - item.startedAt);
  item.error = error;
  if (item.requestBody) item.requestSize = new TextEncoder().encode(item.requestBody).byteLength;
  await updateSnapshot(item.tabId, (snapshot) => {
    if (snapshot.paused) return;
    const pageRecord = snapshot.requests.find((candidate) =>
      candidate.method === item.method && candidate.url === item.url && Math.abs(candidate.startedAt - item.startedAt) < 5_000
    );
    if (pageRecord) {
      Object.assign(pageRecord, {
        status: item.status || pageRecord.status,
        statusText: item.statusText || pageRecord.statusText,
        duration: item.duration || pageRecord.duration,
        requestHeaders: item.requestHeaders.length ? item.requestHeaders : pageRecord.requestHeaders,
        responseHeaders: item.responseHeaders.length ? item.responseHeaders : pageRecord.responseHeaders,
        requestBody: pageRecord.requestBody ?? item.requestBody,
        requestSize: item.requestSize ?? pageRecord.requestSize,
        responseSize: item.responseSize ?? pageRecord.responseSize,
        contentType: pageRecord.contentType ?? item.contentType,
        error: item.error ?? pageRecord.error
      });
    } else {
      snapshot.requests.unshift(item);
    }
    snapshot.requests = snapshot.requests.slice(0, settings.maximumStoredRequests);
  });
}

chrome.webRequest.onCompleted.addListener(
  (details) => { void finishRequest(details.requestId, details.timeStamp); },
  { urls: ['http://*/*', 'https://*/*'], types: ['xmlhttprequest'] }
);
chrome.webRequest.onErrorOccurred.addListener(
  (details) => { void finishRequest(details.requestId, details.timeStamp, details.error); },
  { urls: ['http://*/*', 'https://*/*'], types: ['xmlhttprequest'] }
);

function mergePageNetwork(snapshot: TabSnapshot, payload: PageNetworkEvent): void {
  const match = snapshot.requests.find((item) =>
    item.method === payload.method && item.url === payload.url && Math.abs(item.startedAt - payload.startedAt) < 5_000
  );
  if (match) {
    Object.assign(match, {
      status: payload.status || match.status,
      statusText: payload.statusText || match.statusText,
      duration: payload.duration || match.duration,
      resourceType: payload.resourceType,
      requestHeaders: payload.requestHeaders.length ? payload.requestHeaders : match.requestHeaders,
      responseHeaders: payload.responseHeaders.length ? payload.responseHeaders : match.responseHeaders,
      requestBody: payload.requestBody ?? match.requestBody,
      responseBody: payload.responseBody,
      requestSize: payload.requestBody ? new TextEncoder().encode(payload.requestBody).byteLength : match.requestSize,
      responseSize: payload.responseBody ? new TextEncoder().encode(payload.responseBody).byteLength : match.responseSize,
      contentType: payload.contentType ?? match.contentType,
      error: payload.error ?? match.error,
      truncated: payload.truncated
    });
    return;
  }
  snapshot.requests.unshift({
    id: payload.traceId,
    tabId: -1,
    method: payload.method,
    url: payload.url,
    status: payload.status,
    statusText: payload.statusText,
    startedAt: payload.startedAt,
    duration: payload.duration,
    resourceType: payload.resourceType,
    requestHeaders: payload.requestHeaders,
    responseHeaders: payload.responseHeaders,
    requestBody: payload.requestBody,
    responseBody: payload.responseBody,
    requestSize: payload.requestBody ? new TextEncoder().encode(payload.requestBody).byteLength : undefined,
    responseSize: payload.responseBody ? new TextEncoder().encode(payload.responseBody).byteLength : undefined,
    contentType: payload.contentType,
    error: payload.error,
    truncated: payload.truncated
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'PAGE_EVENT') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    void updateSnapshot(tabId, (snapshot) => {
      const payload = message.payload;
      if (snapshot.paused) return;
      if (payload.kind === 'page-info') snapshot.pageInfo = payload.pageInfo;
      if (payload.kind === 'network' && settings.captureNetworkRequests) {
        mergePageNetwork(snapshot, payload);
        snapshot.requests.forEach((request) => { if (request.tabId < 0) request.tabId = tabId; });
        snapshot.requests = snapshot.requests.slice(0, settings.maximumStoredRequests);
      }
      if (payload.kind === 'console' && settings.captureConsoleErrors) {
        snapshot.console.unshift({ ...payload, id: crypto.randomUUID(), tabId });
        snapshot.console = snapshot.console.slice(0, 100);
      }
    });
    return;
  }

  if (message.type === 'GET_SNAPSHOT') {
    loadSnapshot(message.tabId).then(sendResponse).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'CLEAR_TAB') {
    updateSnapshot(message.tabId, (snapshot) => {
      snapshot.requests = [];
      snapshot.console = [];
    }).then(() => sendResponse({ ok: true })).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'SET_PAUSED') {
    updateSnapshot(message.tabId, (snapshot) => { snapshot.paused = message.paused; })
      .then(() => sendResponse({ ok: true })).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.get(message.tabId).then(async (tab) => {
      if (tab.windowId === undefined) throw new Error('The tab is no longer available.');
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      sendResponse({ dataUrl });
    }).catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.type === 'IMPORT_REQUESTS') {
    updateSnapshot(message.tabId, (snapshot) => {
      const imported = message.requests.map((request) => ({ ...request, tabId: message.tabId }));
      snapshot.requests = [...imported, ...snapshot.requests].slice(0, settings.maximumStoredRequests);
    }).then(() => sendResponse({ ok: true, count: Math.min(message.requests.length, settings.maximumStoredRequests) })).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'GET_STORAGE_DATA') {
    loadStorageData(message.tabId).then(sendResponse).catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.type === 'GET_RULES') {
    getRules().then(sendResponse).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'SAVE_RULE') {
    saveRule(message.rule).then(sendResponse).catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.type === 'DELETE_RULE') {
    deleteRule(message.ruleId).then(sendResponse).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'TOGGLE_RULE') {
    getRules().then((rules) => {
      const rule = rules.find((item) => item.id === message.ruleId);
      if (!rule) throw new Error('RULE_NOT_FOUND');
      return saveRule({ ...rule, enabled: message.enabled });
    }).then(sendResponse).catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  queues.delete(tabId);
  void chrome.storage.session.remove(keyFor(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') void saveSnapshot(tabId, emptySnapshot());
});
