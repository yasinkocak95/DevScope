try {
  if (chrome.runtime?.id) {
    const floatingUiUrl = chrome.runtime.getURL('assets/floatingUi.js');
    void import(/* @vite-ignore */ floatingUiUrl).catch(() => undefined);
  }
} catch { /* Ignore stale programmatic injections after an extension reload. */ }
