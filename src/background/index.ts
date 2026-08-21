import { DEFAULT_SETTINGS, getSettings } from '../services/settings';
import { removeActiveSections } from '../services/navigationState';
import type { CookieRecord, DebugSession, DebugTraceEvent, ExtensionMessage, Header, NetworkRecord, PageNetworkEvent, RequestRule, RequestTrigger, Settings, StorageSnapshot, TabSnapshot, WebStorageData } from '../types';
import { redactText, redactUrl } from '../utils/redaction';
import { closestUnpairedRequest, isStaticAssetRequest, trimCapturedRequests } from '../utils/requestAnalysis';

const emptyDebugSession = (): DebugSession => ({ recording: false, events: [] });
const emptySnapshot = (): TabSnapshot => ({ requests: [], console: [], paused: false, debugSession: emptyDebugSession() });
const keyFor = (tabId: number): string => `devscope:tab:${tabId}`;
const floatingKeyFor = (tabId: number): string => `devscope:floating:${tabId}`;
const queues = new Map<number, Promise<unknown>>();
const pending = new Map<string, NetworkRecord>();
const RULES_KEY = 'devscope:rules';
const MAX_DEBUG_EVENTS = 500;
const ACTION_ASSOCIATION_WINDOW_MS = 5_000;
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
  const stored = result[key] as Partial<TabSnapshot> | undefined;
  if (!stored) return emptySnapshot();
  return {
    ...emptySnapshot(),
    ...stored,
    debugSession: { ...emptyDebugSession(), ...stored.debugSession, events: stored.debugSession?.events ?? [] }
  };
}

async function saveSnapshot(tabId: number, snapshot: TabSnapshot): Promise<void> {
  await chrome.storage.session.set({ [keyFor(tabId)]: snapshot });
  const message = { type: 'DATA_UPDATED', tabId } satisfies ExtensionMessage;

  // Extension pages (popup and DevTools) receive runtime messages, while the
  // floating panel lives in the inspected tab's content-script context.
  // Notify both surfaces so they execute the same refresh path.
  chrome.runtime.sendMessage(message).catch(() => undefined);
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

function updateSnapshot(tabId: number, mutate: (snapshot: TabSnapshot) => void | boolean): Promise<void> {
  const previous = queues.get(tabId) ?? Promise.resolve();
  const next = previous.then(async () => {
    const snapshot = await loadSnapshot(tabId);
    if (mutate(snapshot) === false) return;
    await saveSnapshot(tabId, snapshot);
  }).catch(() => undefined);
  queues.set(tabId, next);
  return next.then(() => undefined);
}

function appendDebugEvent(session: DebugSession, event: DebugTraceEvent): void {
  session.events.push(event);
  if (session.events.length > MAX_DEBUG_EVENTS) session.events = session.events.slice(-MAX_DEBUG_EVENTS);
}

function relatedAction(session: DebugSession, timestamp: number): DebugTraceEvent | undefined {
  return [...session.events].reverse().find((event) =>
    (event.kind === 'click' || event.kind === 'submit')
    && timestamp >= event.timestamp
    && timestamp - event.timestamp <= ACTION_ASSOCIATION_WINDOW_MS
  );
}

function requestTrigger(event?: DebugTraceEvent): RequestTrigger | undefined {
  if (!event || (event.kind !== 'click' && event.kind !== 'submit')) return undefined;
  return { action: event.kind, label: event.label, timestamp: event.timestamp };
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

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  void chrome.storage.session.set({ [floatingKeyFor(tabId)]: true }).then(async () => {
    let mounted = false;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'SHOW_FLOATING_PANEL', tabId } satisfies ExtensionMessage) as { mounted?: boolean } | undefined;
      mounted = response?.mounted === true;
    } catch { /* The fallback below covers tabs without a current content script. */ }
    if (!mounted) await chrome.scripting.executeScript({ target: { tabId }, files: ['assets/floatingLoader.js'] });
  }).catch(() => undefined);
});

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
    if (details.tabId < 0 || details.type !== 'xmlhttprequest') return undefined;
    if (isStaticAssetRequest(details.url)) return undefined;
    pending.set(details.requestId, {
      id: details.requestId,
      tabId: details.tabId,
      method: details.method,
      url: details.url,
      status: 0,
      startedAt: details.timeStamp,
      duration: 0,
      resourceType: 'xmlhttprequest',
      webRequestId: details.requestId,
      requestHeaders: [],
      responseHeaders: [],
      requestBody: settings.captureNetworkRequests ? requestBody(details) : undefined
    });
    void updateSnapshot(details.tabId, (snapshot) => {
      const session = snapshot.debugSession;
      if (!session.recording) return false;
      const action = relatedAction(session, details.timeStamp);
      appendDebugEvent(session, {
        id: `network:${details.requestId}:request`,
        kind: 'request',
        timestamp: details.timeStamp,
        method: details.method,
        url: redactUrl(details.url),
        relatedActionId: action?.id
      });
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
    if (isStaticAssetRequest(item.url, item.contentType)) {
      snapshot.debugSession.events = snapshot.debugSession.events.filter((event) => event.id !== `network:${requestId}:request`);
      return snapshot.debugSession.recording;
    }
    item.triggeredBy ??= requestTrigger(relatedAction(snapshot.debugSession, item.startedAt));
    if (settings.captureNetworkRequests && !snapshot.paused) {
      const pageRecord = closestUnpairedRequest(snapshot.requests, item, 'web');
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
          error: item.error ?? pageRecord.error,
          triggeredBy: pageRecord.triggeredBy ?? item.triggeredBy,
          webRequestId: item.webRequestId
        });
      } else {
        snapshot.requests.unshift(item);
      }
      snapshot.requests = trimCapturedRequests(snapshot.requests, settings.maximumStoredRequests);
    }

    const session = snapshot.debugSession;
    if (!session.recording) return;
    const requestEventId = `network:${requestId}:request`;
    const requestEvent = session.events.find((event) => event.id === requestEventId);
    const failed = Boolean(item.error) || item.status === 0 || item.status >= 400;
    appendDebugEvent(session, {
      id: `network:${requestId}:response`,
      kind: failed ? 'failed-request' : 'response',
      timestamp: endTime,
      method: item.method,
      url: redactUrl(item.url),
      status: item.status,
      statusText: item.statusText ? redactText(item.statusText).slice(0, 300) : undefined,
      error: item.error ? redactText(item.error).slice(0, 500) : undefined,
      relatedActionId: requestEvent?.relatedActionId,
      requestEventId
    });
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

function mergePageNetwork(snapshot: TabSnapshot, payload: PageNetworkEvent, triggeredBy?: RequestTrigger): void {
  const match = closestUnpairedRequest(snapshot.requests, payload, 'page');
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
      truncated: payload.truncated,
      initiator: payload.initiator,
      triggeredBy: match.triggeredBy ?? triggeredBy,
      pageTraceId: payload.traceId
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
    pageTraceId: payload.traceId,
    requestHeaders: payload.requestHeaders,
    responseHeaders: payload.responseHeaders,
    requestBody: payload.requestBody,
    responseBody: payload.responseBody,
    requestSize: payload.requestBody ? new TextEncoder().encode(payload.requestBody).byteLength : undefined,
    responseSize: payload.responseBody ? new TextEncoder().encode(payload.responseBody).byteLength : undefined,
    contentType: payload.contentType,
    error: payload.error,
    truncated: payload.truncated,
    initiator: payload.initiator,
    triggeredBy
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'PAGE_EVENT') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    void updateSnapshot(tabId, (snapshot) => {
      const payload = message.payload;
      const session = snapshot.debugSession;
      if (payload.kind === 'page-info') {
        snapshot.pageInfo = payload.pageInfo;
        if (session.recording) {
          const safeUrl = redactUrl(payload.pageInfo.url);
          if (session.lastUrl !== safeUrl) {
            appendDebugEvent(session, {
              id: crypto.randomUUID(),
              kind: 'navigation',
              timestamp: payload.pageInfo.timestamp,
              url: safeUrl
            });
            session.lastUrl = safeUrl;
          }
        }
      }
      if (payload.kind === 'debug-action' && session.recording) {
        const actionId = crypto.randomUUID();
        appendDebugEvent(session, {
          id: actionId,
          kind: payload.action,
          timestamp: payload.timestamp,
          label: payload.label ? redactText(payload.label).slice(0, 160) : undefined
        });
        session.events.forEach((event) => {
          if (!event.relatedActionId
            && (event.kind === 'request' || event.kind === 'response' || event.kind === 'failed-request' || event.kind === 'console')
            && event.timestamp >= payload.timestamp
            && event.timestamp - payload.timestamp <= ACTION_ASSOCIATION_WINDOW_MS) {
            event.relatedActionId = actionId;
          }
        });
      }
      if (payload.kind === 'network' && settings.captureNetworkRequests && !snapshot.paused && !isStaticAssetRequest(payload.url, payload.contentType)) {
        const triggeredBy = requestTrigger(relatedAction(session, payload.startedAt));
        mergePageNetwork(snapshot, payload, triggeredBy);
        snapshot.requests.forEach((request) => { if (request.tabId < 0) request.tabId = tabId; });
        snapshot.requests = trimCapturedRequests(snapshot.requests, settings.maximumStoredRequests);
      }
      if (payload.kind === 'console' && settings.captureConsoleErrors && !snapshot.paused) {
        snapshot.console.unshift({ ...payload, id: crypto.randomUUID(), tabId });
        snapshot.console = snapshot.console.slice(0, 100);
      }
      if (payload.kind === 'console' && session.recording) {
        const action = relatedAction(session, payload.timestamp);
        appendDebugEvent(session, {
          id: crypto.randomUUID(),
          kind: 'console',
          timestamp: payload.timestamp,
          level: payload.level,
          label: redactText(payload.message).slice(0, 1_000),
          relatedActionId: action?.id
        });
      }
    });
    return;
  }

  if (message.type === 'GET_FLOATING_STATE') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ open: false });
      return;
    }
    chrome.storage.session.get(floatingKeyFor(tabId)).then((result) => {
      sendResponse({ open: result[floatingKeyFor(tabId)] === true, tabId });
    }).catch((error: unknown) => sendResponse({ open: false, error: String(error) }));
    return true;
  }
  if (message.type === 'SET_FLOATING_OPEN') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false });
      return;
    }
    chrome.storage.session.set({ [floatingKeyFor(tabId)]: message.open })
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.type === 'GET_TAB_INFO') {
    chrome.tabs.get(message.tabId).then((tab) => sendResponse({ id: tab.id, url: tab.url ?? '' }))
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
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
  if (message.type === 'START_DEBUG_RECORDING') {
    updateSnapshot(message.tabId, (snapshot) => {
      const session = snapshot.debugSession;
      const now = Date.now();
      session.recording = true;
      session.startedAt ??= now;
      session.stoppedAt = undefined;
      if (snapshot.pageInfo) {
        const safeUrl = redactUrl(snapshot.pageInfo.url);
        if (session.lastUrl !== safeUrl) {
          appendDebugEvent(session, { id: crypto.randomUUID(), kind: 'navigation', timestamp: now, url: safeUrl });
          session.lastUrl = safeUrl;
        }
      }
    }).then(() => sendResponse({ ok: true })).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'STOP_DEBUG_RECORDING') {
    updateSnapshot(message.tabId, (snapshot) => {
      snapshot.debugSession.recording = false;
      snapshot.debugSession.stoppedAt = Date.now();
    }).then(() => sendResponse({ ok: true })).catch((error: unknown) => sendResponse({ error: String(error) }));
    return true;
  }
  if (message.type === 'CLEAR_DEBUG_SESSION') {
    updateSnapshot(message.tabId, (snapshot) => { snapshot.debugSession = emptyDebugSession(); })
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
  if (message.type === 'REPLAY_REQUEST') {
    chrome.tabs.sendMessage(message.tabId, message).then(sendResponse)
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message.type === 'IMPORT_REQUESTS') {
    updateSnapshot(message.tabId, (snapshot) => {
      const imported = message.requests.map((request) => ({ ...request, tabId: message.tabId }));
      snapshot.requests = trimCapturedRequests([...imported, ...snapshot.requests], settings.maximumStoredRequests);
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
  void Promise.all([
    chrome.storage.session.remove([keyFor(tabId), floatingKeyFor(tabId)]),
    removeActiveSections(tabId)
  ]);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    void updateSnapshot(tabId, (snapshot) => {
      if (changeInfo.status !== 'loading' && changeInfo.url && snapshot.pageInfo) {
        snapshot.pageInfo = { ...snapshot.pageInfo, url: changeInfo.url, timestamp: Date.now() };
        const session = snapshot.debugSession;
        if (session.recording) {
          const safeUrl = redactUrl(changeInfo.url);
          if (session.lastUrl !== safeUrl) {
            appendDebugEvent(session, { id: crypto.randomUUID(), kind: 'navigation', timestamp: Date.now(), url: safeUrl });
            session.lastUrl = safeUrl;
          }
        }
        return;
      }
      if (changeInfo.status !== 'loading') return;
      snapshot.requests = [];
      snapshot.console = [];
      snapshot.pageInfo = undefined;
      snapshot.paused = false;
    });
  }
});
