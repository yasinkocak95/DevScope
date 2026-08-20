# DevScope

> Local-first Chrome DevTools for API inspection, SPA navigation tracking, and privacy-conscious bug reporting.

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

DevScope is a local-first Chrome extension for inspecting `fetch` and `XMLHttpRequest` traffic and turning live diagnostics into useful bug reports. It captures request metadata, readable text/JSON bodies, console errors, page environment details, and visible-area screenshots without sending data to an external server.

DevScope works both as a persistent floating panel and as a Chrome DevTools panel. Its interface and generated reports support English and Turkish.

### Features

- Inspect fetch/XHR requests, responses, headers, bodies, status codes, and timing.
- Filter and search captured network traffic.
- Replay editable requests and compare original and replay responses.
- Compare requests by status, duration, headers, and body.
- Import and export HAR 1.2 files with privacy-aware redaction.
- Create Manifest V3 dynamic block rules for API endpoints.
- Inspect Local Storage, Session Storage, cookies, and JWT values.
- Decode JWT headers/payloads and display expiration status.
- Generate Markdown, plain-text, Jira, GitHub, and Slack-friendly bug reports.
- Capture visible-area screenshots and attach failed requests or console errors.
- Record ordered timelines of user actions, navigation, API activity, failures, and console events.
- Use a draggable floating panel that remains open until explicitly closed.
- Switch the interface and generated reports between English and Turkish.

### SPA navigation support

DevScope follows client-side navigation without requiring a refresh:

- Displays the complete URL, including protocol, path, query string, and hash.
- Detects `history.pushState`, `history.replaceState`, `popstate`, and `hashchange`.
- Supports the Navigation API and routers that replace History API methods.
- Updates current page information immediately after route changes.
- Continues capturing API requests created by the new route.
- Keeps the floating panel mounted during SPA navigation.
- Prevents duplicate hooks, listeners, and polling loops.
- Preserves normal full-page reload behavior.

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

### Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `dist` directory.
5. Open an HTTP or HTTPS page.
6. Select the DevScope toolbar icon.

DevScope also registers a **DevScope** panel in Chrome DevTools. Reopen DevTools after installing or reloading the extension.

### Usage

1. Open the page you want to inspect.
2. Select the DevScope toolbar icon or open the **DevScope** DevTools panel.
3. Interact with the page or navigate between SPA routes.
4. Review captured traffic in **Network**.
5. Open a request to inspect, copy, replay, or compare it.
6. Use **Bug Report** or **Recorder** to create a shareable report.
7. Use **Settings** to control capture, redaction, language, and storage limits.

The floating panel can be dragged by its header. Its open state is stored per tab, and its last position is restored automatically.

### Development commands

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Vite for UI development. |
| `npm run typecheck` | Runs strict TypeScript validation without emitting files. |
| `npm run build` | Type-checks and creates the production extension in `dist/`. |
| `npm run preview` | Serves the latest production build locally. |

Chrome API behavior must be verified with a production build loaded as an unpacked extension. After rebuilding, reload the extension from `chrome://extensions`.

### How capture works

1. The Manifest V3 service worker observes fetch/XHR metadata through `chrome.webRequest`.
2. A main-world hook captures readable bodies, console errors, navigation, and meaningful user actions.
3. An isolated-world content script relays page events to the extension runtime.
4. The background worker correlates records and stores bounded per-tab snapshots in `chrome.storage.session`.
5. The React interface renders the same data in the floating panel and Chrome DevTools.

Bodies are limited to 100,000 characters. Binary media is ignored, console history is capped, and request history follows the configured storage limit.

### Project structure

```text
src/
  background/   Manifest V3 service worker and per-tab session data
  components/   Shared floating-panel and DevTools React interface
  content/      Main-world hook, isolated relay, and floating panel host
  devtools/     DevTools panel registration and entry point
  hooks/        React and Chrome state synchronization
  popup/        Standalone popup entry point
  services/     Settings persistence
  types/        Shared strict TypeScript models
  utils/        Redaction, formatting, HAR, JWT, clipboard, and reports
public/
  manifest.json Chrome extension manifest
```

### Permissions

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Accesses the explicitly selected page and supports visible-area screenshots. |
| `cookies` | Reads cookies for the Storage inspector; values are masked by default. |
| `declarativeNetRequestWithHostAccess` | Installs user-created dynamic block rules. |
| `scripting` | Injects the floating panel loader when needed. |
| `storage` | Stores local settings and bounded per-tab session diagnostics. |
| `tabs` | Reads the inspected tab URL/title and captures its visible area. |
| `webRequest` | Observes API method, URL, status, timing, and headers. |
| `http://*/*`, `https://*/*` | Injects hooks and observes supported web traffic. |

### Privacy and security

- No analytics, telemetry, remote API, account, or backend is used.
- Captured data stays in Chrome's local/session storage.
- Sensitive headers, query values, JSON fields, bearer tokens, cookies, and JWT-like values are masked by default.
- Redaction is applied to the UI, clipboard output, generated code, HAR exports, and reports.
- Raw values require disabling redaction and explicitly enabling **Reveal sensitive values**.
- Per-tab diagnostic data is removed when the tab closes and can be cleared from Settings.

### Known limitations

- Chrome internal pages, the Chrome Web Store, extension pages, and restricted origins cannot be inspected.
- Already-open pages may require one refresh after installation or extension reload.
- Requests completed before DevScope injection cannot be recovered.
- Opaque, streaming, cached, cross-origin, compressed, multipart, or binary bodies may be unavailable.
- DevScope captures the visible tab area because Chrome has no reliable general-purpose full-page capture API.
- Manifest V3 rules cannot reliably delay arbitrary responses or synthesize response bodies.
- Replay follows the inspected page's CORS and Content Security Policy rules.
- Browser-managed headers such as `Cookie`, `Host`, `Origin`, and `User-Agent` may be ignored during replay.
- Page scripts that replace `fetch`, XHR, or console methods can limit body or console capture; `webRequest` metadata may remain available.

### Contributing

1. Fork the repository and create a focused branch.
2. Preserve strict TypeScript types and privacy defaults.
3. Run `npm run typecheck` and `npm run build`.
4. Test both classic navigation and SPA route changes.
5. Open a pull request with the behavior change and verification steps.

---

<a id="turkce"></a>

## Türkçe

### Hakkında

DevScope; `fetch` ve `XMLHttpRequest` trafiğini incelemek, canlı tanılama verilerini kullanışlı hata raporlarına dönüştürmek için geliştirilmiş, veriyi yerelde tutan bir Chrome uzantısıdır. İstek meta verilerini, okunabilir metin/JSON gövdelerini, konsol hatalarını, sayfa ortam bilgilerini ve görünür alan ekran görüntülerini harici bir sunucuya göndermeden yakalar.

DevScope hem kalıcı bir floating panel hem de Chrome DevTools paneli olarak çalışır. Arayüz ve oluşturulan raporlar Türkçe ve İngilizce dil desteğine sahiptir.

### Özellikler

- Fetch/XHR isteklerini, yanıtlarını, header'larını, gövdelerini, durum kodlarını ve sürelerini inceleme.
- Yakalanan ağ trafiğinde filtreleme ve arama.
- Düzenlenebilir istekleri yeniden gönderme ve orijinal/tekrar yanıtlarını karşılaştırma.
- İstekleri durum, süre, header ve gövde bakımından karşılaştırma.
- Gizlilik odaklı maskeleme ile HAR 1.2 içe ve dışa aktarma.
- API endpoint'leri için Manifest V3 dinamik engelleme kuralları oluşturma.
- Local Storage, Session Storage, çerez ve JWT değerlerini inceleme.
- JWT header/payload çözümleme ve sona erme durumunu gösterme.
- Markdown, düz metin, Jira, GitHub ve Slack uyumlu hata raporları oluşturma.
- Görünür alan ekran görüntüsü alma; başarısız istekleri ve konsol hatalarını rapora ekleme.
- Kullanıcı aksiyonları, navigasyon, API trafiği, hatalar ve konsol olaylarından sıralı zaman çizelgesi oluşturma.
- Açıkça kapatılana kadar sayfada kalan, sürüklenebilir floating panel kullanma.
- Arayüzü ve raporları Türkçe veya İngilizce kullanma.

### SPA navigasyon desteği

DevScope, sayfayı yenilemeye gerek kalmadan istemci taraflı navigasyonu takip eder:

- Protokol, path, query string ve hash dahil tam URL'yi gösterir.
- `history.pushState`, `history.replaceState`, `popstate` ve `hashchange` olaylarını algılar.
- Navigation API'yi ve History API metodlarını değiştiren router'ları destekler.
- Route değişiminden hemen sonra geçerli sayfa bilgisini günceller.
- Yeni route'un oluşturduğu API isteklerini yakalamaya devam eder.
- SPA navigasyonu sırasında floating paneli açık tutar.
- Duplicate hook, listener ve polling loop oluşmasını engeller.
- Klasik tam sayfa yenileme davranışını korur.

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

Production'a hazır unpacked uzantı `dist/` dizininde oluşturulur.

### Chrome'a yükleme

1. `chrome://extensions` adresini açın.
2. **Geliştirici modu** seçeneğini etkinleştirin.
3. **Paketlenmemiş öğe yükle** seçeneğini seçin.
4. Oluşturulan `dist` dizinini seçin.
5. Bir HTTP veya HTTPS sayfası açın.
6. DevScope araç çubuğu ikonuna tıklayın.

DevScope ayrıca Chrome DevTools içinde bir **DevScope** paneli oluşturur. Uzantıyı yükledikten veya yeniden yükledikten sonra DevTools'u tekrar açın.

### Kullanım

1. İncelemek istediğiniz sayfayı açın.
2. DevScope araç çubuğu ikonuna tıklayın veya DevTools içindeki **DevScope** panelini açın.
3. Sayfayla etkileşime geçin ya da SPA route'ları arasında gezinin.
4. Yakalanan trafiği **Ağ** bölümünden inceleyin.
5. İncelemek, kopyalamak, yeniden göndermek veya karşılaştırmak için bir isteği açın.
6. Paylaşılabilir rapor üretmek için **Hata Raporu** veya **Kayıt** bölümünü kullanın.
7. Yakalama, maskeleme, dil ve depolama sınırları için **Ayarlar** bölümünü kullanın.

Floating panel başlık alanından sürüklenebilir. Açık/kapalı durumu sekme bazında saklanır ve son konumu otomatik olarak geri yüklenir.

### Geliştirme komutları

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Arayüz geliştirme için Vite'ı başlatır. |
| `npm run typecheck` | Dosya üretmeden strict TypeScript kontrolü çalıştırır. |
| `npm run build` | TypeScript kontrolü yapar ve production uzantısını `dist/` altında oluşturur. |
| `npm run preview` | Son production build'ini yerel olarak sunar. |

Chrome API davranışları, unpacked uzantı olarak yüklenmiş production build ile doğrulanmalıdır. Yeniden build aldıktan sonra uzantıyı `chrome://extensions` üzerinden yenileyin.

### Yakalama nasıl çalışır?

1. Manifest V3 service worker, fetch/XHR meta verilerini `chrome.webRequest` üzerinden gözlemler.
2. Main-world hook; okunabilir gövdeleri, konsol hatalarını, navigasyonu ve anlamlı kullanıcı aksiyonlarını yakalar.
3. Isolated-world content script, sayfa olaylarını uzantı runtime'ına aktarır.
4. Background worker kayıtları eşleştirir ve sınırlı sekme snapshot'larını `chrome.storage.session` içinde saklar.
5. React arayüzü aynı verileri floating panel ve Chrome DevTools içinde gösterir.

Gövde içerikleri 100.000 karakterle sınırlıdır. Binary medya yok sayılır, konsol geçmişi sınırlandırılır ve istek geçmişi yapılandırılan depolama limitine uyar.

### Proje yapısı

```text
src/
  background/   Manifest V3 service worker ve sekme bazlı oturum verileri
  components/   Ortak floating panel ve DevTools React arayüzü
  content/      Main-world hook, isolated relay ve floating panel host
  devtools/     DevTools panel kaydı ve giriş noktası
  hooks/        React ve Chrome state senkronizasyonu
  popup/        Bağımsız popup giriş noktası
  services/     Ayarların saklanması
  types/        Ortak strict TypeScript modelleri
  utils/        Maskeleme, formatlama, HAR, JWT, clipboard ve raporlar
public/
  manifest.json Chrome uzantı manifesti
```

### İzinler

| İzin | Neden gerekli? |
| --- | --- |
| `activeTab` | Açıkça seçilen sayfaya erişir ve görünür alan ekran görüntüsünü destekler. |
| `cookies` | Depolama inceleyicisi için çerezleri okur; değerler varsayılan olarak maskelenir. |
| `declarativeNetRequestWithHostAccess` | Kullanıcının oluşturduğu dinamik engelleme kurallarını yükler. |
| `scripting` | Gerektiğinde floating panel loader'ını enjekte eder. |
| `storage` | Yerel ayarları ve sınırlı sekme bazlı oturum verilerini saklar. |
| `tabs` | İncelenen sekmenin URL/title bilgisini okur ve görünür alanını yakalar. |
| `webRequest` | API metot, URL, durum, süre ve header bilgilerini gözlemler. |
| `http://*/*`, `https://*/*` | Hook'ları enjekte eder ve desteklenen web trafiğini gözlemler. |

### Gizlilik ve güvenlik

- Analytics, telemetri, uzak API, kullanıcı hesabı veya backend kullanılmaz.
- Yakalanan veriler Chrome'un local/session storage alanlarında kalır.
- Hassas header'lar, query değerleri, JSON alanları, bearer token'ları, çerezler ve JWT benzeri değerler varsayılan olarak maskelenir.
- Maskeleme; arayüze, clipboard çıktısına, oluşturulan koda, HAR export'larına ve raporlara uygulanır.
- Ham değerler için maskelemenin kapatılması ve **Hassas değerleri göster** seçeneğinin açıkça etkinleştirilmesi gerekir.
- Sekme bazlı tanılama verileri sekme kapandığında kaldırılır ve Ayarlar'dan temizlenebilir.

### Bilinen sınırlamalar

- Chrome dahili sayfaları, Chrome Web Mağazası, uzantı sayfaları ve kısıtlı origin'ler incelenemez.
- Kurulumdan veya uzantı reload işleminden sonra açık sayfalarda bir yenileme gerekebilir.
- DevScope enjekte edilmeden tamamlanan istekler geriye dönük olarak alınamaz.
- Opaque, streaming, cache'lenmiş, cross-origin, sıkıştırılmış, multipart veya binary gövdeler kullanılamayabilir.
- Chrome güvenilir bir genel amaçlı tam sayfa yakalama API'si sunmadığından yalnızca görünür sekme alanı yakalanır.
- Manifest V3 kuralları rastgele yanıtları güvenilir biçimde geciktiremez veya yanıt gövdesi üretemez.
- Replay işlemi incelenen sayfanın CORS ve Content Security Policy kurallarına uyar.
- `Cookie`, `Host`, `Origin` ve `User-Agent` gibi tarayıcı tarafından yönetilen header'lar replay sırasında yok sayılabilir.
- `fetch`, XHR veya console metodlarını değiştiren sayfa script'leri gövde ya da konsol yakalamayı sınırlayabilir; `webRequest` meta verileri kullanılabilir.

### Katkıda bulunma

1. Repoyu fork'layın ve odaklı bir branch oluşturun.
2. Strict TypeScript tiplerini ve varsayılan gizlilik ayarlarını koruyun.
3. `npm run typecheck` ve `npm run build` komutlarını çalıştırın.
4. Klasik navigasyonu ve SPA route değişimlerini test edin.
5. Davranış değişikliğini ve doğrulama adımlarını açıklayan bir pull request açın.
