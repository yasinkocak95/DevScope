import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

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

test('SPA route changes publish one page-info update and do not duplicate hooks', async () => {
  const bundle = await readFile(new URL('../dist/assets/pageHook.js', import.meta.url), 'utf8');
  const browser = createBrowserContext();

  vm.runInContext(bundle, browser.context);
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
  vm.runInContext(bundle, browser.context);
  browser.history.pushState({}, '', '/after-duplicate-install');
  await settleNavigation();
  assert.equal(navigationMessages(browser.messages).length, beforeDuplicateInstall + 1);
});

test('built background notifies extension pages and the inspected tab', async () => {
  const bundle = await readFile(new URL('../dist/assets/background.js', import.meta.url), 'utf8');
  assert.match(bundle, /runtime\.sendMessage\(/);
  assert.match(bundle, /tabs\.sendMessage\(/);
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
