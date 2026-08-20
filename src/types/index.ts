export type Header = { name: string; value: string };

export type NetworkRecord = {
  id: string;
  tabId: number;
  method: string;
  url: string;
  status: number;
  statusText?: string;
  startedAt: number;
  duration: number;
  resourceType: `${chrome.webRequest.ResourceType}` | 'fetch' | 'xhr';
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody?: string;
  responseBody?: string;
  requestSize?: number;
  responseSize?: number;
  contentType?: string;
  error?: string;
  truncated?: boolean;
};

export type ConsoleLevel = 'error' | 'warn';

export type ConsoleRecord = {
  id: string;
  tabId: number;
  level: ConsoleLevel;
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
};

export type PageInfo = {
  url: string;
  title: string;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  timezone: string;
  timestamp: number;
  platform: string;
};

export type Settings = {
  language: 'en' | 'tr';
  redactSensitiveInformation: boolean;
  revealSensitiveValues: boolean;
  captureConsoleErrors: boolean;
  captureNetworkRequests: boolean;
  maximumStoredRequests: number;
};

export type TabSnapshot = {
  requests: NetworkRecord[];
  console: ConsoleRecord[];
  pageInfo?: PageInfo;
  paused: boolean;
};

export type PageNetworkEvent = {
  kind: 'network';
  traceId: string;
  method: string;
  url: string;
  status: number;
  statusText?: string;
  startedAt: number;
  duration: number;
  resourceType: 'fetch' | 'xhr';
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody?: string;
  responseBody?: string;
  contentType?: string;
  error?: string;
  truncated?: boolean;
};

export type PageConsoleEvent = {
  kind: 'console';
  level: ConsoleLevel;
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
};

export type PageMetaEvent = { kind: 'page-info'; pageInfo: PageInfo };
export type PageEvent = PageNetworkEvent | PageConsoleEvent | PageMetaEvent;

export type ReplayRequest = {
  method: string;
  url: string;
  headers: Header[];
  body?: string;
};

export type ReplayResponse = {
  url: string;
  status: number;
  statusText: string;
  headers: Header[];
  body?: string;
  duration: number;
  contentType?: string;
  error?: string;
  truncated?: boolean;
};

export type RequestRule = {
  id: number;
  name: string;
  urlPattern: string;
  action: 'block';
  enabled: boolean;
  createdAt: number;
};

export type WebStorageData = {
  local: Header[];
  session: Header[];
  error?: string;
};

export type CookieRecord = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  expirationDate?: number;
};

export type StorageSnapshot = WebStorageData & { cookies: CookieRecord[] };

export type JwtRecord = {
  source: 'localStorage' | 'sessionStorage' | 'cookie';
  name: string;
  token: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  expiresAt?: number;
  expired?: boolean;
};

export type ExtensionMessage =
  | { type: 'PAGE_EVENT'; payload: PageEvent }
  | { type: 'GET_SNAPSHOT'; tabId: number }
  | { type: 'CLEAR_TAB'; tabId: number }
  | { type: 'SET_PAUSED'; tabId: number; paused: boolean }
  | { type: 'CAPTURE_SCREENSHOT'; tabId: number }
  | { type: 'REPLAY_REQUEST'; request: ReplayRequest }
  | { type: 'GET_WEB_STORAGE' }
  | { type: 'GET_STORAGE_DATA'; tabId: number }
  | { type: 'IMPORT_REQUESTS'; tabId: number; requests: NetworkRecord[] }
  | { type: 'GET_RULES' }
  | { type: 'SAVE_RULE'; rule: RequestRule }
  | { type: 'DELETE_RULE'; ruleId: number }
  | { type: 'TOGGLE_RULE'; ruleId: number; enabled: boolean };

export type BugForm = {
  title: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
};
