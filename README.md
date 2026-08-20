# DevScope

> Local-first Chrome developer tooling for API inspection, SPA navigation tracking, request diagnostics, and privacy-conscious bug reporting.

![Version](https://img.shields.io/badge/version-2.0.0-2563eb)
![Chrome](https://img.shields.io/badge/Chrome-111%2B-4285F4?logo=googlechrome&logoColor=white)
![Manifest](https://img.shields.io/badge/Manifest-V3-0f766e)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

[English](#english) · [Türkçe](#turkce)

---

<a id="english"></a>

## English

### About

DevScope is a local-first Chrome extension for inspecting `fetch` and `XMLHttpRequest` traffic and converting live diagnostics into useful bug reports. It captures request metadata, readable text/JSON bodies, console problems, page environment details, user actions, and visible-area screenshots without sending data to an external service.

DevScope is available as a draggable floating panel and as a Chrome DevTools panel. The interface and generated reports support English and Turkish.

### Highlights

- Inspect request and response URLs, methods, statuses, headers, bodies, sizes, content types, and timings.
- Use smart query syntax and ready-made filters on the Network screen.
- Search URLs, methods, statuses, request/response bodies, and request/response headers.
- Link requests to related Recorder actions such as clicks and form submissions.
- Display real fetch/XHR initiator stack frames when the browser exposes them.
- Detect duplicate request bursts and show the initiator in request details.
- Replay editable requests and compare original and replay responses.
- Compare two captured requests by status, duration, headers, and body.
- Import and export HAR 1.2 files with privacy-aware redaction.
- Create Manifest V3 dynamic block rules for API endpoints.
- Inspect Local Storage, Session Storage, cookies, and JWT values.
- Decode JWT headers and payloads and display expiration status.
- Generate Markdown, plain-text, Jira, GitHub, and Slack-friendly bug reports.
- Capture the visible tab area and attach failed requests or console problems.
- Record ordered timelines of user actions, navigation, API activity, failures, and console events.
- Follow SPA route changes without closing or moving the floating panel.
- Show capture state as **Live**, **Paused**, or **Reconnecting**.
- Switch the interface and generated reports between English and Turkish.

### Smart Search and advanced filters

The Network search field supports free-text search and structured filters. Multiple expressions are combined, so a request must match all expressions.

| Query | Meaning |
| --- | --- |
| `status:500` | Exact HTTP status. |
| `status:>=400` | Numeric comparison. `>`, `>=`, `<`, `<=`, and `=` are supported. |
| `method:POST` | Exact HTTP method, case-insensitive. |
| `time:>500` | Requests slower than 500 milliseconds. |
| `domain:api.example.com` | Host/domain contains the supplied value. |
| `url:/profile` | Full URL contains the supplied value. |
| `type:xhr` | XHR requests. `type:fetch` is also supported. |
| `save failed` | Free-text search across URL, method, status, bodies, and headers. |

Examples:

```text
status:>=400 method:POST
domain:api.example.com url:/profile
type:xhr time:>500
authorization
```

Ready-made filters:

- **Errors:** status `0` or `>=400`.
- **Slow:** duration over 500 ms.
- **Auth:** `401`/`403`, authentication-related headers, or common auth/login/token/session paths.
- **Duplicates:** same method and URL repeated in a one-second burst.
- **Fetch/XHR:** captured API traffic only.
- **GET / POST / PUT / PATCH / DELETE:** quick method filters.

Matching URL and domain text is highlighted when visible in the request row. Search uses a short debounce, and results are rendered in bounded batches to keep large sessions responsive.

### Request Initiator and duplicate detection

When available, request details show both the related user action and the actual JavaScript initiator:

```text
Triggered by:
Click → "Save Profile"

Initiator:
src/pages/Profile.tsx:184
→ saveProfile()
→ updateProfile()
→ fetch()
```

DevScope never fabricates an initiator. If the browser does not expose a usable stack, the UI displays **Initiator unavailable**.

Requests with the same method and exact URL that occur within one second are marked as duplicate bursts, for example:

```text
GET /api/profile ×6 in 840ms
```

This helps identify repeated `useEffect` calls, double submits, retry loops, and repeated fetch/XHR calls.

### SPA navigation support

DevScope follows client-side navigation without requiring a manual refresh:

- Detects `history.pushState`, `history.replaceState`, `popstate`, and `hashchange`.
- Supports the Navigation API and routers that replace History API methods.
- Updates the full current URL, including path, query string, and hash.
- Refreshes request, failed-request, console, and page information automatically.
- Continues capture across route changes.
- Keeps the floating panel open and in the stored position.
- Coalesces route and network update bursts into one UI refresh path.
- Prevents duplicate page hooks, listeners, request records, and polling loops.
- Keeps manual refresh available.
- Preserves normal full-page reload behavior.

### Capture stability and performance

DevScope correlates two complementary capture sources:

1. `chrome.webRequest` supplies reliable request metadata.
2. A main-world hook supplies readable bodies, console events, user actions, route changes, and initiator stacks.
3. The background worker correlates page and webRequest records one-to-one by method, URL, timestamp, and source identifiers.
4. Bounded per-tab snapshots are serialized through a single update queue and stored in `chrome.storage.session`.

Performance protections:

- Static scripts, styles, images, fonts, audio, and video are excluded by default.
- Request and response bodies are limited to 100,000 characters.
- Opaque, binary, and unsupported streaming responses are not force-read.
- Stored request limits are configurable from 25 to 1,000; the default is 200.
- At the limit, oldest records are removed while newest-first ordering is preserved.
- Console history is capped at 100 records; Recorder timelines are capped at 500 events.
- Network rows are rendered in batches of 150.
- Search uses a 180 ms debounce and deferred request rendering.
- UI update bursts are coalesced before snapshot reloads.
- Closing the floating panel unmounts the React interface while capture remains available for the tab.
- HAR export yields between batches and builds a Blob from chunks instead of one large blocking string.
- Large-body limits remain active during HAR import/export and replay.

### Capture states

| State | Description |
| --- | --- |
| **Live** | Capture and snapshot communication are active. |
| **Paused** | New requests and console events are paused; existing records remain available. |
| **Reconnecting** | The UI temporarily lost snapshot communication and retries automatically. |

### Requirements

- Google Chrome 111 or newer
- Node.js 20 or newer
- npm

### Build from source

```bash
git clone https://github.com/yasinkocak95/DevScope.git
cd DevScope
npm install
npm run build
```

The production-ready unpacked extension is generated in `dist/`.

`npm run build` performs three checks in sequence:

1. Strict TypeScript validation.
2. Vite production build.
3. Integration tests against the generated extension bundle.

The build has an additional manifest-content-script guard. `pageHook.js`, `relay.js`, and `floatingLoader.js` are emitted as classic-safe IIFEs; if Rollup introduces a static `import` or `export`, the build fails instead of producing an invalid Chrome package.

### Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `dist` directory.
5. Open or refresh an HTTP/HTTPS page.
6. Select the DevScope toolbar icon.

DevScope also registers a **DevScope** panel in Chrome DevTools. Reopen DevTools after installing or reloading the extension.

### Usage

1. Open the page you want to inspect.
2. Select the DevScope toolbar icon or open the **DevScope** DevTools panel.
3. Interact with the page or navigate between SPA routes.
4. Review traffic in **Network** and combine text search, structured queries, and preset filters.
5. Open a request to inspect its origin, headers, bodies, timing, copy actions, and replay tools.
6. Use **Compare**, **Rules**, or **HAR** for deeper request workflows.
7. Use **Bug Report** or **Recorder** to create a shareable report.
8. Use **Storage** to inspect browser storage, cookies, and JWT values.
9. Use **Settings** to control capture, privacy, language, and request limits.

The floating panel can be dragged by its header. Its open state is stored per tab, its last position is restored automatically, and viewport constraints keep it on-screen.

### Development commands

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Vite for UI development. Chrome APIs still require an unpacked extension build. |
| `npm run typecheck` | Runs strict TypeScript validation without emitting files. |
| `npm test` | Runs integration tests against the current files in `dist/`. Build first after source changes. |
| `npm run build` | Type-checks, creates the production extension, and tests the generated bundle. |
| `npm run preview` | Serves the latest production UI build locally; it does not emulate extension APIs. |

After every production build:

1. Reload DevScope from `chrome://extensions`.
2. Refresh already-open inspected tabs.
3. Reopen DevTools if the DevScope tab is not visible.

### Automated verification

The integration suite verifies:

- `pushState`, `replaceState`, `popstate`, `hashchange`, and Navigation API route updates.
- A single page-info update per effective route change and duplicate-hook safety.
- Real initiator capture when a usable stack exists.
- Duplicate burst analysis and one-to-one correlation of parallel capture sources.
- Smart numeric, text, body, header, type, and preset filters.
- Static asset exclusion and oldest-record trimming.
- Invalidated extension-context handling and background notifications.
- Classic-script parsing with no static import/export in manifest content scripts.
- Floating panel size, scroll, typography, and viewport constraints.

### Project structure

```text
src/
  background/   Manifest V3 service worker, correlation, rules, and per-tab snapshots
  components/   Shared React UI, Network tools, Recorder, Storage, and Bug Report views
  content/      Main-world hook, isolated relay, floating loader, and floating UI host
  devtools/     DevTools panel registration and entry point
  hooks/        React state, auto refresh, pause, and reconnect synchronization
  popup/        Optional standalone React entry point
  services/     Settings persistence and defaults
  types/        Shared strict TypeScript models and extension messages
  utils/        Filtering, redaction, formatting, HAR, JWT, clipboard, diff, and reports
public/
  manifest.json Chrome extension manifest
tests/
  spa-navigation.test.mjs  Bundle and integration regression tests
vite.config.ts             Production entries and classic-content-script guard
```

### Permissions

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Accesses the selected page and supports visible-area screenshots. |
| `cookies` | Reads cookies for the Storage inspector; values are masked by default. |
| `declarativeNetRequestWithHostAccess` | Installs user-created dynamic block rules. |
| `scripting` | Injects the floating panel loader when needed. |
| `storage` | Stores local settings, panel position, and bounded per-tab diagnostics. |
| `tabs` | Reads inspected-tab information and captures the visible tab area. |
| `webRequest` | Observes API method, URL, status, timing, size, and headers. |
| `http://*/*`, `https://*/*` | Injects capture hooks and observes supported web traffic. |

### Privacy and security

- No analytics, telemetry, remote API, user account, or backend is used.
- Captured data stays in Chrome local/session storage.
- Sensitive headers, query values, JSON fields, bearer tokens, cookies, and JWT-like values are masked by default.
- Redaction is applied to views, clipboard output, generated code, HAR exports, and reports.
- Raw values require explicitly enabling **Reveal sensitive values**.
- Recorder timelines do not store form values, passwords, tokens, cookies, request bodies, or headers.
- Per-tab diagnostics are removed when the tab closes and can be cleared manually.
- Initiator information is displayed only when captured; no fake stack is generated.

### Request tools and Manifest V3 limits

- **Block** rules are supported through `declarativeNetRequest`.
- Arbitrary response delay and mock-response body generation are unavailable because Manifest V3 cannot implement them reliably for general page traffic.
- Replay runs in the inspected page and follows its CORS and Content Security Policy rules.
- Browser-managed headers such as `Cookie`, `Host`, `Origin`, and `User-Agent` may be ignored or rejected during replay.

### Troubleshooting

#### `Cannot use import statement outside a module`

Manifest content scripts are classic scripts. Current builds prevent static imports/exports in these files and fail during build if one is detected. If this appears, Chrome is normally running an older `dist` build:

1. Run `npm run build`.
2. Reload DevScope from `chrome://extensions`.
3. Hard-refresh or reopen every already-open inspected tab.

#### `Extension context invalidated`

This occurs when an old content script remains in a tab after the extension is reloaded or updated. DevScope stops the stale relay and consumes Chrome's runtime error, but the tab must be refreshed to receive the new extension context.

#### No requests are visible

- Confirm capture is **Live**, not **Paused**.
- Refresh pages that were open before DevScope was installed or reloaded.
- Remember that static assets are intentionally excluded.
- Requests completed before injection cannot be recovered.
- Confirm the page is a supported HTTP/HTTPS origin.

### Known limitations

- Chrome internal pages, the Chrome Web Store, extension pages, and restricted origins cannot be inspected.
- Already-open pages require a refresh after installation or extension reload.
- Requests completed before DevScope injection cannot be recovered.
- Opaque, cached, cross-origin, compressed, multipart, streaming, or binary bodies may be unavailable.
- Service worker, WebSocket, EventSource, navigation, and static-resource traffic are not general capture targets; DevScope focuses on page fetch/XHR API traffic.
- Chrome provides a reliable visible-area capture API, not a universal full-page screenshot API.
- Page scripts that replace `fetch`, XHR, console, or History API methods can limit main-world data; webRequest metadata and the navigation fallback may remain available.
- Stack traces depend on browser/runtime behavior and source-map availability.
- Imported HAR files are bounded, and unsupported or binary content may be omitted.

### Contributing

1. Fork the repository and create a focused branch.
2. Preserve strict TypeScript types, TR/EN parity, and privacy defaults.
3. Do not add runtime imports to manifest content-script entries.
4. Run `npm run build`.
5. Test classic navigation, SPA route changes, manual refresh, pause/resume, and the floating panel.
6. Open a pull request with the behavior change and verification steps.

---

<a id="turkce"></a>

## Türkçe

### Hakkında

DevScope; `fetch` ve `XMLHttpRequest` trafiğini inceleyen, canlı tanılama verilerini kullanışlı hata raporlarına dönüştüren ve veriyi yerelde tutan bir Chrome uzantısıdır. İstek meta verilerini, okunabilir metin/JSON gövdelerini, konsol sorunlarını, sayfa ortam bilgilerini, kullanıcı aksiyonlarını ve görünür alan ekran görüntülerini harici bir servise göndermeden yakalar.

DevScope, sürüklenebilir floating panel ve Chrome DevTools paneli olarak kullanılabilir. Arayüz ile oluşturulan raporlar Türkçe ve İngilizce desteğine sahiptir.

### Öne çıkanlar

- İstek ve yanıt URL’lerini, metotlarını, durumlarını, header’larını, gövdelerini, boyutlarını, içerik türlerini ve sürelerini inceleme.
- Network ekranında akıllı sorgu sözdizimi ve hazır filtreler kullanma.
- URL, metot, durum, istek/yanıt gövdesi ve istek/yanıt header’larında arama.
- İstekleri tıklama ve form gönderimi gibi ilişkili Recorder aksiyonlarına bağlama.
- Tarayıcı sunduğunda gerçek fetch/XHR initiator stack frame’lerini gösterme.
- Tekrarlanan istek kümelerini algılama ve istek detayında initiator bilgisini gösterme.
- Düzenlenebilir istekleri tekrar gönderme ve orijinal/tekrar yanıtlarını karşılaştırma.
- İki isteği durum, süre, header ve gövde bakımından karşılaştırma.
- Gizlilik odaklı maskeleme ile HAR 1.2 içe/dışa aktarma.
- API endpoint’leri için Manifest V3 dinamik engelleme kuralları oluşturma.
- Local Storage, Session Storage, çerez ve JWT değerlerini inceleme.
- JWT header/payload çözümleme ve sona erme durumunu gösterme.
- Markdown, düz metin, Jira, GitHub ve Slack uyumlu hata raporları oluşturma.
- Görünür sekme alanını yakalama; başarısız istekleri ve konsol sorunlarını rapora ekleme.
- Kullanıcı aksiyonları, navigasyon, API aktivitesi, hatalar ve konsol olaylarından sıralı zaman çizelgesi oluşturma.
- Floating paneli kapatmadan veya taşımadan SPA route değişimlerini takip etme.
- Yakalama durumunu **Canlı**, **Duraklatıldı** veya **Yeniden bağlanıyor** olarak gösterme.
- Arayüzü ve raporları Türkçe veya İngilizce kullanma.

### Akıllı arama ve gelişmiş filtreler

Network arama alanı serbest metin ve yapılandırılmış filtreleri destekler. Birden fazla ifade birlikte kullanıldığında isteğin tüm ifadelere uyması gerekir.

| Sorgu | Anlamı |
| --- | --- |
| `status:500` | Tam HTTP durum kodu. |
| `status:>=400` | Sayısal karşılaştırma. `>`, `>=`, `<`, `<=` ve `=` desteklenir. |
| `method:POST` | Büyük/küçük harf duyarsız tam HTTP metodu. |
| `time:>500` | 500 milisaniyeden yavaş istekler. |
| `domain:api.example.com` | Host/domain verilen değeri içerir. |
| `url:/profile` | Tam URL verilen değeri içerir. |
| `type:xhr` | XHR istekleri. `type:fetch` de desteklenir. |
| `save failed` | URL, metot, durum, gövdeler ve header’larda serbest metin araması. |

Örnekler:

```text
status:>=400 method:POST
domain:api.example.com url:/profile
type:xhr time:>500
authorization
```

Hazır filtreler:

- **Hatalar:** durum `0` veya `>=400`.
- **Yavaş:** süresi 500 ms’den uzun istekler.
- **Kimlik:** `401`/`403`, kimlik doğrulama header’ları veya yaygın auth/login/token/session yolları.
- **Tekrarlar:** aynı metot ve URL’nin bir saniyelik aralıkta tekrarlanması.
- **Fetch/XHR:** yalnızca yakalanan API trafiği.
- **GET / POST / PUT / PATCH / DELETE:** hızlı metot filtreleri.

Görünür istek satırında eşleşen URL ve domain metni vurgulanır. Arama kısa bir debounce kullanır ve büyük oturumlarda akıcılığı korumak için sonuçlar sınırlı gruplar halinde render edilir.

### Request Initiator ve tekrarlanan istek algılama

Mevcut olduğunda istek detayında ilişkili kullanıcı aksiyonu ve gerçek JavaScript initiator bilgisi birlikte gösterilir:

```text
Tetikleyen:
Tıklama → "Profili Kaydet"

Başlatan:
src/pages/Profile.tsx:184
→ saveProfile()
→ updateProfile()
→ fetch()
```

DevScope sahte initiator üretmez. Tarayıcı kullanılabilir bir stack sunmuyorsa **Başlatan bilgisi kullanılamıyor** gösterilir.

Aynı metot ve tam URL ile bir saniye içinde oluşan istekler tekrarlanan istek kümesi olarak işaretlenir:

```text
GET /api/profile ×6, 840ms içinde
```

Bu özellik tekrarlanan `useEffect`, çift submit, retry döngüsü ve yinelenen fetch/XHR çağrılarını fark etmeyi kolaylaştırır.

### SPA navigasyon desteği

DevScope, manuel yenileme gerektirmeden istemci taraflı navigasyonu takip eder:

- `history.pushState`, `history.replaceState`, `popstate` ve `hashchange` olaylarını algılar.
- Navigation API’yi ve History API metotlarını değiştiren router’ları destekler.
- Path, query string ve hash dahil tam güncel URL’yi gösterir.
- İstek, başarısız istek, konsol ve sayfa bilgilerini otomatik yeniler.
- Route değişimlerinde capture işlemini kesmeden sürdürür.
- Floating paneli açık ve kayıtlı konumunda tutar.
- Route ve network güncelleme kümelerini tek UI yenileme yolunda birleştirir.
- Duplicate page hook, listener, istek kaydı ve polling loop oluşmasını engeller.
- Manuel yenileme butonunu çalışır halde tutar.
- Normal tam sayfa yenileme davranışını korur.

### Capture kararlılığı ve performans

DevScope birbirini tamamlayan iki capture kaynağını ilişkilendirir:

1. `chrome.webRequest` güvenilir istek meta verilerini sağlar.
2. Main-world hook okunabilir gövdeleri, konsol olaylarını, kullanıcı aksiyonlarını, route değişimlerini ve initiator stack’lerini sağlar.
3. Background worker, page ve webRequest kayıtlarını metot, URL, zaman ve kaynak kimliklerine göre bire bir ilişkilendirir.
4. Sınırlandırılmış sekme snapshot’ları tek güncelleme kuyruğunda işlenerek `chrome.storage.session` içinde saklanır.

Performans korumaları:

- Script, stil, görsel, font, ses ve video gibi statik asset’ler varsayılan olarak yakalanmaz.
- İstek ve yanıt gövdeleri 100.000 karakterle sınırlandırılır.
- Opaque, binary ve desteklenmeyen streaming yanıtlar zorla okunmaz.
- Saklanan istek limiti 25–1.000 arasında ayarlanabilir; varsayılan değer 200’dür.
- Limite ulaşıldığında en yeni kayıt sırası korunarak en eski kayıtlar kaldırılır.
- Konsol geçmişi 100 kayıt, Recorder zaman çizelgesi 500 olay ile sınırlandırılır.
- Network satırları 150’lik gruplar halinde render edilir.
- Arama 180 ms debounce ve deferred request rendering kullanır.
- UI güncelleme kümeleri snapshot yüklemesinden önce birleştirilir.
- Floating panel kapatıldığında React arayüzü unmount edilir; sekme için capture kullanılabilir kalır.
- HAR export gruplar arasında ana akışa kontrol verir ve tek büyük string yerine parçalardan Blob oluşturur.
- Büyük gövde limitleri HAR içe/dışa aktarma ve replay sırasında korunur.

### Capture durumları

| Durum | Açıklama |
| --- | --- |
| **Canlı** | Capture ve snapshot iletişimi aktiftir. |
| **Duraklatıldı** | Yeni istek ve konsol olayları duraklatılır; mevcut kayıtlar kullanılabilir kalır. |
| **Yeniden bağlanıyor** | UI snapshot iletişimini geçici olarak kaybetmiştir ve otomatik tekrar dener. |

### Gereksinimler

- Google Chrome 111 veya üzeri
- Node.js 20 veya üzeri
- npm

### Kaynak koddan build alma

```bash
git clone https://github.com/yasinkocak95/DevScope.git
cd DevScope
npm install
npm run build
```

Production’a hazır unpacked uzantı `dist/` dizininde oluşturulur.

`npm run build` sırasıyla üç doğrulama yapar:

1. Strict TypeScript kontrolü.
2. Vite production build’i.
3. Oluşturulan extension paketi üzerinde entegrasyon testleri.

Build ayrıca manifest content scriptleri için güvenlik kontrolü içerir. `pageHook.js`, `relay.js` ve `floatingLoader.js` classic-safe IIFE olarak üretilir; Rollup statik `import` veya `export` eklerse geçersiz Chrome paketi üretmek yerine build durdurulur.

### Chrome’a yükleme

1. `chrome://extensions` adresini açın.
2. **Geliştirici modu** seçeneğini etkinleştirin.
3. **Paketlenmemiş öğe yükle** seçeneğini seçin.
4. Oluşturulan `dist` dizinini seçin.
5. Bir HTTP/HTTPS sayfası açın veya mevcut sayfayı yenileyin.
6. DevScope araç çubuğu ikonuna tıklayın.

DevScope ayrıca Chrome DevTools içinde bir **DevScope** paneli oluşturur. Uzantıyı yükledikten veya yeniden yükledikten sonra DevTools’u tekrar açın.

### Kullanım

1. İncelemek istediğiniz sayfayı açın.
2. DevScope araç çubuğu ikonuna tıklayın veya DevTools içindeki **DevScope** panelini açın.
3. Sayfayla etkileşime geçin ya da SPA route’ları arasında gezinin.
4. Trafiği **Ağ** bölümünde inceleyin; metin aramasını, yapılandırılmış sorguları ve hazır filtreleri birlikte kullanın.
5. Origin, header, gövde, zamanlama, kopyalama ve replay araçları için bir isteği açın.
6. İleri istek akışları için **Karşılaştır**, **Kurallar** veya **HAR** sekmesini kullanın.
7. Paylaşılabilir rapor için **Hata Raporu** veya **Kayıt** bölümünü kullanın.
8. Tarayıcı depolaması, çerez ve JWT incelemek için **Depolama** bölümünü kullanın.
9. Capture, gizlilik, dil ve istek limitleri için **Ayarlar** bölümünü kullanın.

Floating panel başlık alanından sürüklenebilir. Açık/kapalı durumu sekme bazında saklanır, son konumu otomatik geri yüklenir ve viewport sınırları panelin ekran dışında kalmasını engeller.

### Geliştirme komutları

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | UI geliştirme için Vite’ı başlatır. Chrome API’leri için unpacked extension build’i gerekir. |
| `npm run typecheck` | Dosya üretmeden strict TypeScript kontrolü çalıştırır. |
| `npm test` | Mevcut `dist/` dosyaları üzerinde entegrasyon testlerini çalıştırır. Source değiştiyse önce build alın. |
| `npm run build` | TypeScript kontrolü yapar, production extension’ı üretir ve oluşan paketi test eder. |
| `npm run preview` | Son production UI build’ini yerelde sunar; extension API’lerini taklit etmez. |

Her production build’inden sonra:

1. `chrome://extensions` üzerinden DevScope’u yeniden yükleyin.
2. Daha önce açık olan incelenen sekmeleri yenileyin.
3. DevScope sekmesi görünmüyorsa DevTools’u kapatıp yeniden açın.

### Otomatik doğrulama

Entegrasyon testleri şunları doğrular:

- `pushState`, `replaceState`, `popstate`, `hashchange` ve Navigation API route güncellemeleri.
- Her gerçek route değişimi için tek page-info güncellemesi ve duplicate-hook güvenliği.
- Kullanılabilir stack olduğunda gerçek initiator capture.
- Tekrarlanan istek analizi ve paralel capture kaynaklarının bire bir ilişkilendirilmesi.
- Akıllı sayısal, metin, gövde, header, type ve hazır filtreler.
- Statik asset eleme ve en eski kayıtları kırpma.
- Geçersiz extension context davranışı ve background bildirimleri.
- Manifest content scriptlerinde statik import/export olmadan classic-script parse.
- Floating panel boyut, scroll, typography ve viewport sınırları.

### Proje yapısı

```text
src/
  background/   Manifest V3 service worker, korelasyon, kurallar ve sekme snapshot’ları
  components/   Ortak React UI, Network araçları, Recorder, Storage ve Bug Report ekranları
  content/      Main-world hook, isolated relay, floating loader ve floating UI host
  devtools/     DevTools panel kaydı ve giriş noktası
  hooks/        React state, otomatik yenileme, pause ve reconnect senkronizasyonu
  popup/        İsteğe bağlı bağımsız React giriş noktası
  services/     Ayarların saklanması ve varsayılanlar
  types/        Ortak strict TypeScript modelleri ve extension mesajları
  utils/        Filtreleme, maskeleme, formatlama, HAR, JWT, clipboard, diff ve raporlar
public/
  manifest.json Chrome extension manifesti
tests/
  spa-navigation.test.mjs  Bundle ve entegrasyon regresyon testleri
vite.config.ts             Production girişleri ve classic-content-script güvenlik kontrolü
```

### İzinler

| İzin | Neden gerekli? |
| --- | --- |
| `activeTab` | Açıkça seçilen sayfaya erişir ve görünür alan ekran görüntüsünü destekler. |
| `cookies` | Depolama inceleyicisi için çerezleri okur; değerler varsayılan olarak maskelenir. |
| `declarativeNetRequestWithHostAccess` | Kullanıcının oluşturduğu dinamik engelleme kurallarını yükler. |
| `scripting` | Gerektiğinde floating panel loader’ını enjekte eder. |
| `storage` | Yerel ayarları, panel konumunu ve sınırlı sekme tanılama verilerini saklar. |
| `tabs` | İncelenen sekme bilgisini okur ve görünür sekme alanını yakalar. |
| `webRequest` | API metot, URL, durum, süre, boyut ve header bilgilerini gözlemler. |
| `http://*/*`, `https://*/*` | Capture hook’larını enjekte eder ve desteklenen web trafiğini gözlemler. |

### Gizlilik ve güvenlik

- Analytics, telemetri, uzak API, kullanıcı hesabı veya backend kullanılmaz.
- Yakalanan veriler Chrome local/session storage alanlarında kalır.
- Hassas header, query değeri, JSON alanı, bearer token, çerez ve JWT benzeri değerler varsayılan olarak maskelenir.
- Maskeleme; ekranlara, clipboard çıktısına, üretilen koda, HAR export’larına ve raporlara uygulanır.
- Ham değerler için **Hassas değerleri göster** seçeneğinin açıkça etkinleştirilmesi gerekir.
- Recorder zaman çizelgesi form değerlerini, parolaları, token’ları, çerezleri, istek gövdelerini veya header’ları saklamaz.
- Sekme tanılama verileri sekme kapandığında kaldırılır ve manuel olarak temizlenebilir.
- Initiator yalnızca gerçekten yakalandığında gösterilir; sahte stack üretilmez.

### İstek araçları ve Manifest V3 sınırları

- **Engelle** kuralları `declarativeNetRequest` üzerinden desteklenir.
- Rastgele response geciktirme ve mock response body üretme, Manifest V3 genel sayfa trafiğinde güvenilir biçimde uygulayamadığı için kullanılamıyor olarak gösterilir.
- Replay incelenen sayfada çalışır ve sayfanın CORS ile Content Security Policy kurallarına uyar.
- `Cookie`, `Host`, `Origin` ve `User-Agent` gibi tarayıcı tarafından yönetilen header’lar replay sırasında yok sayılabilir veya reddedilebilir.

### Sorun giderme

#### `Cannot use import statement outside a module`

Manifest content scriptleri klasik scriptlerdir. Güncel build bu dosyalarda statik import/export oluşmasını engeller ve algılarsa build’i durdurur. Hata görülüyorsa Chrome genellikle eski bir `dist` build’i çalıştırıyordur:

1. `npm run build` çalıştırın.
2. `chrome://extensions` üzerinden DevScope’u yeniden yükleyin.
3. Daha önce açık olan tüm incelenen sekmeleri hard-refresh ile yenileyin veya yeniden açın.

#### `Extension context invalidated`

Bu hata, uzantı reload veya update edildikten sonra eski content scriptin sekmede kalmasıyla oluşur. DevScope eski relay’i durdurur ve Chrome runtime hatasını tüketir; yeni extension context’in alınması için sekmenin yenilenmesi gerekir.

#### İstekler görünmüyor

- Capture durumunun **Canlı** olduğundan ve **Duraklatıldı** olmadığından emin olun.
- DevScope kurulmadan veya reload edilmeden önce açık olan sayfaları yenileyin.
- Statik asset’lerin bilinçli olarak hariç tutulduğunu unutmayın.
- Enjeksiyondan önce tamamlanan isteklerin geri getirilemeyeceğini dikkate alın.
- Sayfanın content script destekleyen bir HTTP/HTTPS origin’i olduğunu kontrol edin.

### Bilinen sınırlamalar

- Chrome dahili sayfaları, Chrome Web Mağazası, extension sayfaları ve kısıtlı origin’ler incelenemez.
- Kurulum veya extension reload işleminden sonra açık sayfaların yenilenmesi gerekir.
- DevScope enjeksiyonundan önce tamamlanan istekler geriye dönük alınamaz.
- Opaque, cache’lenmiş, cross-origin, sıkıştırılmış, multipart, streaming veya binary gövdeler kullanılamayabilir.
- Service worker, WebSocket, EventSource, navigasyon ve statik kaynak trafiği genel capture hedefi değildir; DevScope sayfa fetch/XHR API trafiğine odaklanır.
- Chrome evrensel tam sayfa ekran görüntüsü API’si yerine güvenilir görünür alan capture API’si sunar.
- `fetch`, XHR, console veya History API metotlarını değiştiren sayfa scriptleri main-world verisini sınırlayabilir; webRequest meta verileri ve navigasyon fallback’i kullanılabilir kalabilir.
- Stack trace bilgisi tarayıcı/runtime davranışına ve source-map bulunabilirliğine bağlıdır.
- İçe aktarılan HAR dosyaları sınırlandırılır; desteklenmeyen veya binary içerikler alınmayabilir.

### Katkıda bulunma

1. Repoyu fork’layın ve odaklı bir branch oluşturun.
2. Strict TypeScript tiplerini, TR/EN eşitliğini ve varsayılan gizlilik ayarlarını koruyun.
3. Manifest content-script girişlerine runtime import eklemeyin.
4. `npm run build` çalıştırın.
5. Klasik navigasyon, SPA route değişimi, manuel yenileme, pause/resume ve floating paneli test edin.
6. Davranış değişikliği ile doğrulama adımlarını açıklayan bir pull request açın.
