import ReactDOM, { type Root } from 'react-dom/client';
import type { PointerEventHandler } from 'react';
import { App } from '../components/App';
import type { ExtensionMessage, FloatingPanelPosition } from '../types';
import appStyles from '../components/app.css?inline';
import { EXTENSION_CONTEXT_INVALIDATED_EVENT, extensionContextAvailable, sendRuntimeMessage, sendRuntimeMessageQuietly } from '../utils/chromeRuntime';

const HOST_ID = `devscope-floating-${chrome.runtime.id}`;
const POSITION_KEY = 'devscope:floating:position';
const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 680;
const PANEL_MARGIN = 16;

type FloatingStateResponse = { open?: boolean; tabId?: number };
type ScreenshotResult = { dataUrl?: string; error?: string };

let host: HTMLElement | undefined;
let root: Root | undefined;
let panelTabId: number | undefined;
let desiredOpen = false;
let renderGeneration = 0;
let currentPosition: FloatingPanelPosition = { left: 0, top: PANEL_MARGIN };

function panelSize(): { width: number; height: number } {
  const availableWidth = Math.max(0, window.innerWidth - PANEL_MARGIN * 2);
  const availableHeight = Math.max(0, window.innerHeight - PANEL_MARGIN * 2);
  return {
    width: Math.min(PANEL_WIDTH, availableWidth),
    height: Math.min(PANEL_HEIGHT, availableHeight)
  };
}

function clampPosition(position: FloatingPanelPosition): FloatingPanelPosition {
  const { width, height } = panelSize();
  return {
    left: Math.max(0, Math.min(position.left, window.innerWidth - width)),
    top: Math.max(0, Math.min(position.top, window.innerHeight - height))
  };
}

function setImportant(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, 'important');
}

function placePanel(position: FloatingPanelPosition): void {
  currentPosition = clampPosition(position);
  if (!host) return;
  const { width, height } = panelSize();
  setImportant(host, 'width', `${width}px`);
  setImportant(host, 'height', `${height}px`);
  setImportant(host, 'max-width', `calc(100vw - ${PANEL_MARGIN * 2}px)`);
  setImportant(host, 'max-height', `calc(100vh - ${PANEL_MARGIN * 2}px)`);
  setImportant(host, 'left', `${currentPosition.left}px`);
  setImportant(host, 'top', `${currentPosition.top}px`);
}

async function loadPosition(): Promise<FloatingPanelPosition> {
  const stored = await chrome.storage.local.get(POSITION_KEY);
  const value = stored[POSITION_KEY] as Partial<FloatingPanelPosition> | undefined;
  if (typeof value?.left === 'number' && typeof value.top === 'number') return clampPosition({ left: value.left, top: value.top });
  return clampPosition({ left: window.innerWidth - PANEL_WIDTH - PANEL_MARGIN, top: PANEL_MARGIN });
}

function savePosition(): void {
  try {
    if (extensionContextAvailable()) void chrome.storage.local.set({ [POSITION_KEY]: currentPosition }).catch(() => undefined);
  } catch { /* The position is already kept in memory for this page. */ }
}

const handleHeaderPointerDown: PointerEventHandler<HTMLElement> = (event) => {
  if (event.button !== 0 || (event.target as Element).closest('.icon-button')) return;
  const header = event.currentTarget;
  const pointerId = event.pointerId;
  const startPointer = { x: event.clientX, y: event.clientY };
  const startPosition = currentPosition;
  let moved = false;
  header.setPointerCapture(pointerId);
  host?.setAttribute('data-dragging', '');

  const move = (moveEvent: PointerEvent): void => {
    const deltaX = moveEvent.clientX - startPointer.x;
    const deltaY = moveEvent.clientY - startPointer.y;
    moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 3;
    placePanel({ left: startPosition.left + deltaX, top: startPosition.top + deltaY });
  };
  const finish = (): void => {
    header.removeEventListener('pointermove', move);
    header.removeEventListener('pointerup', finish);
    header.removeEventListener('pointercancel', finish);
    if (header.hasPointerCapture(pointerId)) header.releasePointerCapture(pointerId);
    host?.removeAttribute('data-dragging');
    if (moved) {
      header.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      }, { capture: true, once: true });
    }
    savePosition();
  };

  header.addEventListener('pointermove', move);
  header.addEventListener('pointerup', finish);
  header.addEventListener('pointercancel', finish);
};

async function captureScreenshot(tabId: number): Promise<ScreenshotResult> {
  const activeHost = host;
  if (activeHost) {
    setImportant(activeHost, 'visibility', 'hidden');
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  try {
    return await sendRuntimeMessage<ScreenshotResult>({ type: 'CAPTURE_SCREENSHOT', tabId } satisfies ExtensionMessage);
  } finally {
    if (activeHost?.isConnected) activeHost.style.removeProperty('visibility');
  }
}

function destroyPanel(): void {
  renderGeneration += 1;
  root?.unmount();
  root = undefined;
  host?.remove();
  host = undefined;
  panelTabId = undefined;
}

function closePanel(): void {
  desiredOpen = false;
  destroyPanel();
  sendRuntimeMessageQuietly({ type: 'SET_FLOATING_OPEN', open: false } satisfies ExtensionMessage);
}

async function showPanel(tabId: number): Promise<void> {
  desiredOpen = true;
  if (host && panelTabId === tabId) return;
  destroyPanel();
  const generation = renderGeneration;
  const position = await loadPosition().catch(() => clampPosition({ left: window.innerWidth - PANEL_WIDTH - PANEL_MARGIN, top: PANEL_MARGIN }));
  if (!desiredOpen || generation !== renderGeneration) return;

  const existing = document.getElementById(HOST_ID);
  existing?.remove();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', 'DevScope');
  setImportant(host, 'all', 'initial');
  setImportant(host, 'position', 'fixed');
  setImportant(host, 'z-index', '2147483647');
  setImportant(host, 'display', 'block');
  setImportant(host, 'box-sizing', 'border-box');
  setImportant(host, 'overflow', 'hidden');
  setImportant(host, 'isolation', 'isolate');
  setImportant(host, 'color-scheme', 'light');
  setImportant(host, 'border', '1px solid #cbd5e1');
  setImportant(host, 'border-radius', '8px');
  setImportant(host, 'box-shadow', '0 4px 16px rgb(15 23 42 / 10%)');
  panelTabId = tabId;
  placePanel(position);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = appStyles;
  const mountPoint = document.createElement('div');
  mountPoint.id = 'devscope-root';
  mountPoint.style.width = '100%';
  mountPoint.style.height = '100%';
  shadow.append(style, mountPoint);
  document.documentElement.append(host);

  root = ReactDOM.createRoot(mountPoint);
  root.render(
    <App
      mode="floating"
      forcedTabId={tabId}
      onClose={closePanel}
      onHeaderPointerDown={handleHeaderPointerDown}
      captureScreenshot={captureScreenshot}
    />
  );
}

const onRuntimeMessage = (message: ExtensionMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void): boolean => {
  if (message.type === 'SHOW_FLOATING_PANEL') {
    void showPanel(message.tabId);
    sendResponse({ mounted: true });
  }
  if (message.type === 'HIDE_FLOATING_PANEL') {
    desiredOpen = false;
    destroyPanel();
  }
  return false;
};

try {
  if (extensionContextAvailable()) chrome.runtime.onMessage.addListener(onRuntimeMessage);
} catch { /* A stale panel is removed by the invalidation handler below. */ }

window.addEventListener('resize', () => placePanel(currentPosition));
window.addEventListener(EXTENSION_CONTEXT_INVALIDATED_EVENT, () => {
  desiredOpen = false;
  destroyPanel();
}, { once: true });

void sendRuntimeMessage<FloatingStateResponse>({ type: 'GET_FLOATING_STATE' } satisfies ExtensionMessage)
  .then((state: FloatingStateResponse) => {
    if (state.open && state.tabId !== undefined) void showPanel(state.tabId);
  })
  .catch(() => undefined);
