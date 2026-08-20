# Chrome Extension Prompt — DevScope

Create a production-quality Chrome extension called **DevScope**.

DevScope is a developer debugging tool that combines two main features:

1. **Bug Reporter**
2. **API / Network Inspector**

The extension must be genuinely functional, not just a visual prototype.

## Main Goal

Build a clean, professional Chrome extension that helps frontend developers, backend developers, QA engineers, and testers inspect API requests and quickly generate useful bug reports.

The product should feel like a serious developer utility that could realistically be published on the Chrome Web Store.

---

# 1. Technical Requirements

Use:

- Chrome Extension **Manifest V3**
- TypeScript
- React
- Vite
- Clean component architecture
- Modern CSS
- Chrome Extension APIs where appropriate

Prefer a lightweight dependency structure.

Do not add unnecessary libraries.

The project should be easy to run locally with:

```bash
npm install
npm run build
```

The generated build must be loadable through:

```text
chrome://extensions
→ Developer Mode
→ Load unpacked
```

Create a proper folder structure and keep extension-specific logic separated from UI components.

Suggested structure:

```text
src/
  background/
  content/
  popup/
  devtools/
  components/
  hooks/
  services/
  utils/
  types/
```

Use strong TypeScript types.

Avoid `any` unless absolutely necessary.

---

# 2. Design Direction

The extension must have a **professional corporate developer-tool appearance**.

## IMPORTANT DESIGN RULE

Do NOT use the stereotypical AI-product visual style.

Absolutely avoid:

- purple-heavy interfaces
- violet gradients
- pink/purple gradients
- glowing AI buttons
- neon backgrounds
- excessive gradients
- glassmorphism everywhere
- oversized rounded cards
- childish illustrations
- excessive animations

This is NOT an AI application.

It is a professional developer utility.

## Theme

Design primarily for **light mode**.

Use a clean neutral background such as:

```text
#F8FAFC
#F9FAFB
#FFFFFF
```

Use dark readable text such as:

```text
#0F172A
#111827
```

Choose ONE restrained corporate accent color.

Preferred direction:

```text
Primary: #0F6CBD
```

or another professional blue/teal corporate color if it produces a better result.

Use the primary color consistently for:

- active tabs
- primary buttons
- selected states
- focus states
- small highlights

Do not spread the accent color across every surface.

Use neutral gray borders and surfaces.

Example:

```text
Border: #E2E8F0
Muted Text: #64748B
Secondary Background: #F1F5F9
Success: #15803D
Warning: #B45309
Error: #DC2626
```

The overall visual feeling should resemble professional tools such as:

- GitHub
- Linear
- Vercel
- Stripe Dashboard
- Chrome DevTools

without directly copying them.

---

# 3. UI Quality

The interface must look polished.

Pay attention to:

- spacing
- typography hierarchy
- alignment
- empty states
- hover states
- disabled states
- loading states
- error states
- focus states
- keyboard accessibility

Use subtle shadows only where appropriate.

Use border radius around:

```text
6px – 10px
```

Avoid excessively rounded `20px+` UI elements.

Buttons should feel compact and professional.

Prefer native system fonts or:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

For code/request bodies use a monospace font.

---

# 4. Main Navigation

The extension should have a clear navigation structure.

Main sections:

```text
Overview
Network
Bug Report
Settings
```

If technically more appropriate, the Network inspector may be implemented as a Chrome DevTools panel while the popup acts as the quick-access dashboard.

Choose the architecture that gives the most reliable functionality.

---

# 5. Network / API Inspector

Create a useful API request inspector.

Capture relevant network requests from the inspected page.

Focus mainly on:

- fetch
- XMLHttpRequest / XHR
- API requests
- JSON responses

For every request show:

```text
HTTP Method
Endpoint / URL
Status Code
Duration
Request Time
Content Type
Request Size if available
Response Size if available
```

Example list item:

```text
POST   /api/v1/auth/login     200     423 ms
GET    /api/v1/profile        500     182 ms
```

Use meaningful status colors:

- 2xx → success
- 3xx → neutral/info
- 4xx → warning/error
- 5xx → error

Do not make the colors overwhelming.

---

# 6. Network Filters

Provide filters for:

```text
All
Fetch/XHR
GET
POST
PUT
PATCH
DELETE
Errors
```

Provide a search field.

Search should work against:

- URL
- endpoint
- HTTP method
- status code

Include:

```text
Clear
Pause Capture
Resume Capture
```

---

# 7. Request Details

Clicking a network request should open a detailed inspector.

Tabs:

```text
Overview
Headers
Request
Response
Timing
```

## Overview

Display:

```text
Request URL
Method
Status
Duration
Timestamp
Content Type
```

## Headers

Separate:

```text
Request Headers
Response Headers
```

Make headers searchable if practical.

## Request

Pretty-print JSON request bodies.

Support raw text fallback.

## Response

Pretty-print JSON response bodies.

Support nested objects and arrays.

Allow collapsing JSON nodes if reasonably possible.

Large response bodies should not freeze the extension.

---

# 8. Copy Actions

For a selected API request provide:

```text
Copy URL
Copy Endpoint
Copy Request Body
Copy Response
Copy cURL
Copy as fetch()
Copy as Axios
```

Example generated fetch code:

```javascript
const response = await fetch('/api/v1/profile', {
  method: 'GET',
  headers: {
    Accept: 'application/json'
  }
});

const data = await response.json();
```

Example Axios output:

```javascript
const response = await axios.get('/api/v1/profile');
```

Generate usable code rather than placeholders wherever possible.

---

# 9. Security and Sensitive Information

This feature is extremely important.

DevScope must avoid accidentally exposing sensitive information.

Automatically detect and redact common sensitive values such as:

```text
Authorization
Bearer tokens
access_token
refresh_token
JWT
password
passwd
secret
api_key
api-key
x-api-key
cookie
set-cookie
```

For example:

```text
Authorization: Bearer ••••••••••••••••
```

Add a setting:

```text
Reveal sensitive values
```

Default:

```text
OFF
```

Sensitive information must remain hidden when exporting a bug report unless the user explicitly enables it.

---

# 10. Bug Reporter

Create a **Create Bug Report** workflow.

The extension should automatically collect useful debugging information.

Collect:

```text
Current URL
Page title
Browser
Browser version if available
Operating system if available
Viewport width
Viewport height
Device pixel ratio
Current timestamp
Timezone
User agent
```

Also include:

```text
Console errors
Failed API/network requests
```

when technically available.

---

# 11. Screenshot

Bug reports should support capturing a screenshot of the current page/tab.

Provide:

```text
Capture Visible Area
```

If reliably possible using Chrome APIs, also support:

```text
Capture Full Page
```

Do not implement fake functionality.

If Chrome restrictions prevent a reliable feature, gracefully disable it and explain the limitation in the UI.

The screenshot should be previewable before export.

Allow the user to remove the screenshot.

---

# 12. Bug Description Form

Include editable fields:

```text
Title
Description
Steps to Reproduce
Expected Result
Actual Result
Severity
```

Severity options:

```text
Low
Medium
High
Critical
```

Also allow optional selection of network requests to attach to the report.

---

# 13. Automatic Error Detection

The Bug Reporter should show a summary such as:

```text
Console Errors        3
Failed Requests       2
Warnings              5
```

Allow the user to inspect these items before generating the report.

Do not automatically include unlimited logs.

Use sensible limits so the report remains readable.

---

# 14. Generated Bug Report

Generate clean Markdown.

Example:

```markdown
# Dashboard fails to load profile

## Environment

- URL: https://example.com/dashboard
- Browser: Chrome
- Viewport: 1920×1080
- OS: Windows
- Date: 20 Aug 2026

## Description

Profile data does not load after opening the dashboard.

## Steps to Reproduce

1. Log into the application.
2. Open Dashboard.
3. Navigate to Profile.

## Expected Result

Profile data should load.

## Actual Result

An error message appears.

## Failed Network Requests

### GET /api/profile

Status: 500  
Duration: 182 ms

Response:

```json
{
  "message": "Internal Server Error"
}
```

## Console Errors

```text
Failed to load resource: server responded with 500.
```
```

---

# 15. Export Options

Provide:

```text
Copy Markdown
Copy Plain Text
Copy for Jira
Copy for GitHub Issue
Copy for Slack
Download Report
```

If appropriate, downloaded reports can use:

```text
.md
```

format.

Do not integrate directly with Jira/GitHub APIs in the first version.

Just generate well-formatted text compatible with them.

---

# 16. Quick Overview Dashboard

When the extension opens, display a concise summary of the current page.

Example:

```text
DevScope

example.com

12 Requests
2 Failed
3 Console Errors

[ Inspect Network ]

[ Create Bug Report ]
```

Below this, optionally show recent failed requests:

```text
GET /api/profile
500 · 182 ms

POST /api/orders
422 · 364 ms
```

Keep this dashboard simple.

---

# 17. Empty States

Design useful empty states.

Examples:

```text
No requests captured yet.

Interact with the page or refresh it to start capturing API requests.
```

and:

```text
No errors detected.

Everything looks healthy on this page.
```

Do not use illustrations.

Simple icons and text are sufficient.

---

# 18. Settings

Add settings for:

```text
Redact sensitive information
Capture console errors
Capture network requests
Maximum stored requests
Clear captured data
Reveal sensitive values
```

Default sensitive data redaction must be enabled.

Settings can use `chrome.storage.local`.

---

# 19. Data Storage

Do not persist unnecessary browsing history.

Captured debugging information should preferably be session-oriented.

Do not send any collected data to external servers.

The extension must operate locally.

No analytics.

No telemetry.

No remote APIs.

No account registration.

No backend.

Clearly state inside the application:

```text
Your debugging data stays in your browser.
```

---

# 20. Performance

The extension must not noticeably slow down websites.

Avoid:

- capturing huge binary responses
- storing every resource request forever
- storing images/video/font bodies
- excessive MutationObservers
- expensive polling
- unbounded arrays

Prioritize API/XHR/fetch traffic.

Implement configurable limits.

Example:

```text
Maximum stored requests: 200
```

---

# 21. Error Handling

The application must handle situations such as:

- inaccessible Chrome internal pages
- permissions unavailable
- request body unavailable
- response body unavailable
- tab no longer active
- screenshot permission failure
- malformed JSON
- huge response payload
- Chrome API exceptions

Never let the entire extension crash because one feature fails.

Show a clear error state instead.

---

# 22. Developer Experience

Provide:

```text
README.md
```

The README must contain:

```text
What DevScope does
Tech stack
Installation
Development
Build
How to load into Chrome
Permissions explanation
Project structure
Known limitations
```

Comment complex Chrome-specific code where necessary.

Do not clutter obvious code with unnecessary comments.

---

# 23. Chrome Permissions

Request only permissions that are genuinely required.

Do not use overly broad permissions without justification.

Explain each permission in the README.

Follow Chrome Manifest V3 best practices.

---

# 24. Accessibility

Ensure:

- buttons are keyboard accessible
- interactive elements have visible focus states
- icons have accessible labels
- text has sufficient contrast
- status information is not represented only by color
- forms have labels

---

# 25. Icons

Use a consistent professional icon set such as Lucide.

Do not mix multiple icon libraries.

Icons should be simple outline icons.

Do not use emojis as primary UI icons.

---

# 26. Product Identity

Product name:

```text
DevScope
```

Optional tagline:

```text
Debug faster. Report better.
```

The visual identity should communicate:

```text
Developer Tool
Debugging
Inspection
Reliability
Professional Software
```

Not:

```text
AI
Crypto
Gaming
Social Media
Futuristic SaaS
```

---

# 27. Final Quality Requirement

Do not produce only scaffolding or placeholder screens.

Implement the functionality end-to-end as far as Chrome APIs allow.

Do not leave buttons that do nothing.

Do not use fake network data in the final application.

Do not use fake charts or meaningless statistics.

Do not prioritize visual effects over functionality.

Before considering the task complete:

1. Check the Manifest V3 configuration.
2. Check permissions.
3. Check build errors.
4. Check TypeScript errors.
5. Check that popup/devtools communication works.
6. Check network request capture.
7. Check request detail view.
8. Check sensitive-data redaction.
9. Check screenshot capture.
10. Check bug report generation.
11. Check all copy buttons.
12. Check empty/error states.
13. Check Chrome extension reload behavior.
14. Check that the extension works on real HTTP/HTTPS pages.

The finished application should look and behave like a polished developer tool someone would genuinely keep installed in Chrome.