# DevScope

DevScope is a local-first Chrome developer extension for inspecting `fetch` and XMLHttpRequest traffic and turning live diagnostics into useful bug reports. It captures request metadata, readable text/JSON bodies, console errors, page environment details, and visible-area screenshots without sending data to a server. The interface and generated reports can be switched between English and Turkish from Settings.

## Features

- Network request filtering, request/response details, and code generation
- Editable request replay with original/replay response comparison
- Request-to-request diff for headers, bodies, status, and duration
- Manifest V3 dynamic Block rules for fetch/XHR endpoints
- HAR 1.2 import and privacy-conscious export
- Local Storage, Session Storage, cookies, and JWT inspection
- JWT header/payload decoding and expiration status
- Bug reports with environment data, console errors, failed requests, and screenshots
- English and Turkish interface and report generation

## Tech stack

- Chrome Extension Manifest V3
- React and TypeScript
- Vite
- Lucide React icons
- Chrome `webRequest`, `storage`, `tabs`, and DevTools APIs

## Installation and build

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run build
```

The production extension is generated in `dist/`.

## Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `dist` directory.
5. Open or refresh an HTTP/HTTPS page, then select the DevScope toolbar icon.

DevScope also registers a **DevScope** panel in Chrome DevTools. DevTools must be reopened after installing or reloading the extension.

## Development

`npm run dev` serves the HTML entry points for UI work, but Chrome API behavior must be verified from a production build loaded as an unpacked extension. Run `npm run build` after changes and use the extension card's reload button in `chrome://extensions`.

Useful commands:

```bash
npm run typecheck
npm run build
npm run preview
```

## Permissions

- `activeTab`: grants access to the page the user explicitly opens DevScope on and supports visible-area screenshots.
- `cookies`: reads cookies belonging to the inspected HTTP/HTTPS page for the Storage inspector. Cookie values remain masked by default.
- `declarativeNetRequestWithHostAccess`: installs user-created dynamic Block rules for matching fetch/XHR URLs.
- `tabs`: reads the active tab URL/title and captures the active tab's visible area.
- `storage`: keeps user settings in `storage.local` and bounded per-tab diagnostics in `storage.session`.
- `webRequest`: observes request method, URL, status, timing, and headers for API traffic.
- `http://*/*` and `https://*/*` host access: injects the fetch/XHR and console capture hooks and observes matching network traffic. No data is transmitted externally.

The extension has no analytics, telemetry, remote API, account, or backend. Captured tab data is removed when its tab closes and is reset when a new navigation begins.

## Project structure

```text
src/
  background/   Manifest V3 service worker and bounded session storage
  components/   Shared popup and DevTools UI
  content/      Main-world capture hook and isolated-world relay
  devtools/     DevTools panel registration and entry point
  hooks/        React/Chrome state synchronization
  popup/        Popup entry point
  services/     Settings persistence
  types/        Shared strict TypeScript models
  utils/        Redaction, formatting, clipboard, and report generation
public/
  manifest.json
```

## How capture works

The service worker observes XHR/fetch request metadata with `chrome.webRequest`. A minimal main-world hook records readable request/response bodies and console errors, then sends them through an isolated content script. Records are correlated by URL, method, and timestamp. Bodies are limited to 100,000 characters, request history is bounded, binary media is ignored, and console history is capped.

Sensitive headers, query values, JSON fields, bearer tokens, and JWT-like values are masked in the UI and all exports by default. Revealing raw values requires disabling redaction and explicitly enabling **Reveal sensitive values** in Settings.

## Known limitations

- Chrome internal pages, the Chrome Web Store, extension pages, and other restricted origins cannot be inspected.
- Capture begins after the extension has been installed and the target page refreshed. Requests completed before injection are unavailable.
- Browser security rules can make opaque, streaming, cached, cross-origin, or binary response bodies unavailable. Metadata remains visible when Chrome exposes it.
- DevScope does not attempt to decode compressed or multipart binary bodies.
- Chrome does not expose a reliable general-purpose full-page screenshot API to extensions. DevScope captures the visible tab area and clearly marks full-page capture as unavailable.
- Manifest V3 dynamic rules can block matching requests, but they cannot reliably delay arbitrary responses or synthesize custom response bodies. Delay and Mock Response are shown as unavailable rather than simulated.
- Replay uses the inspected page's fetch context and therefore follows the page's CORS and Content Security Policy behavior. Browser-managed headers such as Cookie, Host, Origin, and User-Agent may be ignored or rejected.
- A page can replace `fetch`, XHR, or console methods after DevScope initializes. Such custom instrumentation can prevent body or console capture, while `webRequest` metadata may still be available.

## Privacy and security

Raw values remain only in Chrome's session storage so the user can explicitly inspect them when needed. Redaction is applied before display, clipboard generation, code generation, and report export. Clear data from Settings at any time; closing the tab also removes its captured records. The reveal preference remains enabled until the user turns it off.
