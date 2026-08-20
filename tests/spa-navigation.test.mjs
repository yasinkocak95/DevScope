import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const typeScript = await import('typescript');
const requestAnalysisSource = await readFile(new URL('../src/utils/requestAnalysis.ts', import.meta.url), 'utf8');
const requestAnalysisJavaScript = typeScript.transpileModule(requestAnalysisSource, {
  compilerOptions: { module: typeScript.ModuleKind.ESNext, target: typeScript.ScriptTarget.ES2022 }
}).outputText;
const {
  closestUnpairedRequest, duplicateRequestMap, isStaticAssetRequest,
  matchesSmartNetworkQuery, parseSmartNetworkQuery, trimCapturedRequests
} = await import(`data:text/javascript;base64,${Buffer.from(requestAnalysisJavaScript).toString('base64')}`);

class BrowserEventTarget extends EventTarget {}
class BrowserElement {}
class BrowserInputElement extends BrowserElement {}
class BrowserFormElement extends BrowserElement {}
class BrowserXhr extends BrowserEventTarget {}

function createBrowserContext() {
  const messages = [];
  const location = { href: 'https://www.sky-e.app/', origin: 'https://www.sky-e.app' };
  const window = new BrowserEventTarget();
  const document = new BrowserEventTarget();
  const navigation = new BrowserEventTarget();
  const history = {
    pushState(_data, _unused, url) {
      if (url != null) location.href = new URL(String(url), location.href).href;
    },
    replaceState(_data, _unused, url) {
      if (url != null) location.href = new URL(String(url), location.href).href;
    }
  };

  Object.assign(window, {
    window,
    location,
    history,
    document,
    navigation,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    fetch: async () => { throw new Error('fetch is not used by this test'); },
    XMLHttpRequest: BrowserXhr,
    postMessage(message) { messages.push(message); },
    setTimeout,
    setInterval() { return 1; }
  });

  BrowserXhr.prototype.open = function () {};
  BrowserXhr.prototype.send = function () {};
  BrowserXhr.prototype.setRequestHeader = function () {};

  const context = vm.createContext({
    window,
    location,
    history,
    document,
    navigator: { userAgent: 'DevScope test', platform: 'test' },
    console: { error() {}, warn() {} },
    Intl,
    URL,
    Headers,
    Response,
    Request,
    TextDecoder,
    TextEncoder,
    Event,
    EventTarget,
    MessageEvent,
    Element: BrowserElement,
    HTMLInputElement: BrowserInputElement,
    HTMLFormElement: BrowserFormElement,
    SubmitEvent: Event,
    XMLHttpRequest: BrowserXhr,
    crypto,
    queueMicrotask,
    setTimeout,
    clearTimeout
  });

  return { context, document, history, location, messages, navigation, window };
}

const navigationMessages = (messages) => messages.filter(
  (message) => message?.source === 'devscope-page-hook' && message.payload?.kind === 'page-info'
);

const settleNavigation = () => new Promise((resolve) => setTimeout(resolve, 5));

function createRelayContext(sendBehavior = 'callback-error') {
  const window = new BrowserEventTarget();
  let sendCount = 0;
  const runtime = {
    id: 'devscope-test',
    lastError: undefined,
    onMessage: { addListener() {} },
    sendMessage(_message, callback) {
      sendCount += 1;
      if (sendBehavior === 'promise-rejection') {
        return Promise.reject(new Error('Extension context invalidated.'));
      }
      runtime.lastError = { message: 'Extension context invalidated.' };
      callback();
      runtime.lastError = undefined;
    }
  };
  Object.assign(window, {
    window,
    location: { origin: 'https://www.sky-e.app' },
    localStorage: {},
    sessionStorage: {},
    setTimeout,
    clearTimeout,
    postMessage() {}
  });
  const context = vm.createContext({ window, chrome: { runtime }, Event, EventTarget, MessageEvent, crypto, setTimeout, clearTimeout });
  return { context, getSendCount: () => sendCount, window };
}

test('SPA route changes publish one page-info update and do not duplicate hooks', async () => {
  const bundle = await readFile(new URL('../dist/assets/pageHook.js', import.meta.url), 'utf8');
  const browser = createBrowserContext();

  vm.runInContext(bundle, browser.context, { filename: 'chrome-extension://devscope/assets/pageHook.js' });
  browser.window.dispatchEvent(new Event('DOMContentLoaded'));
  assert.equal(navigationMessages(browser.messages).length, 1);

  browser.history.pushState({}, '', '/blog');
  await settleNavigation();
  assert.equal(navigationMessages(browser.messages).at(-1).payload.pageInfo.url, 'https://www.sky-e.app/blog');
  assert.equal(navigationMessages(browser.messages).length, 2);

  browser.history.replaceState({}, '', '/blog');
  await settleNavigation();
  assert.equal(navigationMessages(browser.messages).length, 2, 'same URL must not refresh twice');

  browser.history.replaceState({}, '', '/blog?page=2');
  await settleNavigation();
  assert.equal(navigationMessages(browser.messages).at(-1).payload.pageInfo.url, 'https://www.sky-e.app/blog?page=2');

  browser.location.href = 'https://www.sky-e.app/blog?page=1';
  browser.window.dispatchEvent(new Event('popstate'));
  assert.equal(navigationMessages(browser.messages).at(-1).payload.pageInfo.url, 'https://www.sky-e.app/blog?page=1');

  browser.location.href = 'https://www.sky-e.app/blog?page=1#comments';
  browser.window.dispatchEvent(new Event('hashchange'));
  assert.equal(navigationMessages(browser.messages).at(-1).payload.pageInfo.url, 'https://www.sky-e.app/blog?page=1#comments');

  browser.location.href = 'https://www.sky-e.app/navigation-api';
  browser.navigation.dispatchEvent(new Event('currententrychange'));
  await settleNavigation();
  assert.equal(navigationMessages(browser.messages).at(-1).payload.pageInfo.url, 'https://www.sky-e.app/navigation-api');

  const beforeDuplicateInstall = navigationMessages(browser.messages).length;
  vm.runInContext(bundle, browser.context, { filename: 'chrome-extension://devscope/assets/pageHook.js' });
  browser.history.pushState({}, '', '/after-duplicate-install');
  await settleNavigation();
  assert.equal(navigationMessages(browser.messages).length, beforeDuplicateInstall + 1);
});

test('fetch captures real initiator frames when a stack is available', async () => {
  const bundle = await readFile(new URL('../dist/assets/pageHook.js', import.meta.url), 'utf8');
  const browser = createBrowserContext();
  vm.runInContext(bundle, browser.context, { filename: 'chrome-extension://devscope/assets/pageHook.js' });

  await assert.rejects(browser.window.fetch('https://www.sky-e.app/api/profile'));
  const networkEvent = browser.messages.findLast((message) => message.payload?.kind === 'network');
  assert.equal(networkEvent.payload.initiator.type, 'fetch');
  assert.ok(networkEvent.payload.initiator.frames.length > 0);
  assert.doesNotMatch(networkEvent.payload.initiator.frames[0].source, /pageHook\.js/);
});

test('duplicate request analysis reports a bounded burst per request', () => {
  const requests = Array.from({ length: 6 }, (_, index) => ({
    id: `profile-${index}`,
    method: 'GET',
    url: 'https://www.sky-e.app/api/profile',
    startedAt: index * 168
  }));
  requests.push({ id: 'later-profile', method: 'GET', url: 'https://www.sky-e.app/api/profile', startedAt: 2_000 });
  requests.push({ id: 'other-query', method: 'GET', url: 'https://www.sky-e.app/api/profile?view=full', startedAt: 200 });

  const duplicates = duplicateRequestMap(requests);
  assert.deepEqual(duplicates.get('profile-0'), {
    method: 'GET', endpoint: '/api/profile', count: 6, windowMs: 840
  });
  assert.equal(duplicates.size, 6);
  assert.equal(duplicates.has('later-profile'), false);
  assert.equal(duplicates.has('other-query'), false);
});

test('smart network filters support field operators, body search, and presets', () => {
  const base = {
    id: 'profile', method: 'POST', url: 'https://api.example.com/profile', status: 500,
    startedAt: 100, duration: 840, resourceType: 'fetch',
    requestHeaders: [{ name: 'authorization', value: 'Bearer masked' }],
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    requestBody: '{"displayName":"Ada"}', responseBody: '{"error":"save failed"}'
  };
  const duplicates = new Map([['profile', { method: 'POST', endpoint: '/profile', count: 2, windowMs: 100 }]]);

  for (const query of [
    'status:500', 'status:>=400', 'method:POST', 'time:>500',
    'domain:api.example.com', 'url:/profile', 'type:fetch', 'displayName', 'save failed', 'authorization'
  ]) {
    assert.equal(matchesSmartNetworkQuery(base, parseSmartNetworkQuery(query), 'All', duplicates), true, query);
  }
  assert.equal(matchesSmartNetworkQuery(base, parseSmartNetworkQuery('status:<400'), 'All', duplicates), false);
  assert.equal(matchesSmartNetworkQuery(base, parseSmartNetworkQuery(''), 'Errors', duplicates), true);
  assert.equal(matchesSmartNetworkQuery(base, parseSmartNetworkQuery(''), 'Slow', duplicates), true);
  assert.equal(matchesSmartNetworkQuery(base, parseSmartNetworkQuery(''), 'Auth', duplicates), true);
  assert.equal(matchesSmartNetworkQuery(base, parseSmartNetworkQuery(''), 'Duplicates', duplicates), true);
});

test('capture stability helpers skip static assets and trim oldest requests', () => {
  assert.equal(isStaticAssetRequest('https://cdn.example.com/app.js'), true);
  assert.equal(isStaticAssetRequest('https://cdn.example.com/resource', 'image/webp'), true);
  assert.equal(isStaticAssetRequest('https://api.example.com/profile', 'application/json'), false);
  const newestFirst = Array.from({ length: 6 }, (_, index) => ({ id: String(index) }));
  assert.deepEqual(trimCapturedRequests(newestFirst, 3).map(({ id }) => id), ['0', '1', '2']);
});

test('parallel duplicate requests correlate one-to-one across capture sources', () => {
  const webRequests = Array.from({ length: 6 }, (_, index) => ({
    id: `web-${index}`,
    method: 'GET',
    url: 'https://www.sky-e.app/api/profile',
    startedAt: index * 168,
    webRequestId: `web-${index}`
  }));
  const matchedIds = new Set();

  for (const index of [5, 4, 3, 2, 1, 0]) {
    const pageRequest = { method: 'GET', url: 'https://www.sky-e.app/api/profile', startedAt: index * 168 + 2 };
    const match = closestUnpairedRequest(webRequests, pageRequest, 'page');
    assert.ok(match);
    match.pageTraceId = `page-${index}`;
    matchedIds.add(match.id);
  }

  assert.equal(matchedIds.size, 6);
  assert.ok(webRequests.every((request) => request.pageTraceId));
});

test('relay consumes invalidated-context errors and stops forwarding stale page events', async () => {
  const bundle = await readFile(new URL('../dist/assets/relay.js', import.meta.url), 'utf8');
  const relay = createRelayContext();
  vm.runInContext(bundle, relay.context, { filename: 'chrome-extension://devscope/assets/relay.js' });
  const pageEvent = () => {
    const event = new Event('message');
    Object.defineProperties(event, {
      source: { value: relay.window },
      data: { value: { source: 'devscope-page-hook', payload: { kind: 'page-info' } } }
    });
    return event;
  };

  relay.window.dispatchEvent(pageEvent());
  relay.window.dispatchEvent(pageEvent());
  await Promise.resolve();

  assert.equal(relay.getSendCount(), 1);
});

test('relay consumes invalidated-context Promise rejections without an uncaught error', async () => {
  const bundle = await readFile(new URL('../dist/assets/relay.js', import.meta.url), 'utf8');
  const relay = createRelayContext('promise-rejection');
  vm.runInContext(bundle, relay.context, { filename: 'chrome-extension://devscope/assets/relay.js' });
  const pageEvent = () => {
    const event = new Event('message');
    Object.defineProperties(event, {
      source: { value: relay.window },
      data: { value: { source: 'devscope-page-hook', payload: { kind: 'page-info' } } }
    });
    return event;
  };

  relay.window.dispatchEvent(pageEvent());
  await Promise.resolve();
  relay.window.dispatchEvent(pageEvent());

  assert.equal(relay.getSendCount(), 1);
});

test('built background notifies extension pages and the inspected tab', async () => {
  const bundle = await readFile(new URL('../dist/assets/background.js', import.meta.url), 'utf8');
  assert.match(bundle, /runtime\.sendMessage\(/);
  assert.match(bundle, /tabs\.sendMessage\(/);
});

test('manifest content scripts are classic-safe standalone bundles', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
  const scripts = [...new Set(manifest.content_scripts.flatMap(({ js = [] }) => js))];
  for (const script of scripts) {
    const bundle = await readFile(new URL(`../dist/${script}`, import.meta.url), 'utf8');
    assert.doesNotMatch(bundle, /\bimport(?:\s|[{'"*])/m, `${script} contains a static import`);
    assert.doesNotMatch(bundle, /\bexport(?:\s|[{*])/m, `${script} contains an export`);
    assert.doesNotThrow(() => new vm.Script(bundle), `${script} must parse as a classic script`);
  }
});

test('floating panel keeps readable and viewport-safe layout constraints', async () => {
  const [floatingSource, styles] = await Promise.all([
    readFile(new URL('../src/content/floatingUi.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/app.css', import.meta.url), 'utf8')
  ]);

  assert.match(floatingSource, /const PANEL_WIDTH = 520;/);
  assert.match(floatingSource, /const PANEL_HEIGHT = 680;/);
  assert.match(floatingSource, /max-width/);
  assert.match(floatingSource, /max-height/);
  assert.match(styles, /\.page-identity strong[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s);
  assert.match(styles, /main \{[^}]*overflow: auto;/s);
  assert.doesNotMatch(styles, /font(?:-size|):\s*[789]px/);
});
