HealthGuard

Chrome Extension

Complete Technical Documentation

Version 1.0.0

Manifest V3  |  Chrome 120+  |  Pure JavaScript

# 1. Overview

HealthGuard is a Manifest V3 Chrome extension that helps users maintain their physical and mental health while using the browser. It provides two core health systems that run silently in the background and only surface when the user needs guidance or has reached a health threshold.

The extension is built entirely on native browser APIs with no external dependencies, no network requests, and no data collection. All data is stored locally in the user's browser and can be exported or deleted at any time.

## 1.1 Core Health Systems

- System 1: Screen Time Manager

Tracks active time spent on every website, enforces daily limits set by the user, and triggers structured health breaks on a configurable interval. It uses the 20-20-20 rule (every 20 minutes, look 20 feet away for 20 seconds) as its default break protocol.

- System 2: Sound Intensity Monitor

Intercepts audio playing in any browser tab, measures its loudness in real time using the Web Audio API, enforces a configurable volume ceiling, and tracks cumulative daily hearing exposure against the WHO safe listening model (85 dB averaged over 8 hours).

## 1.2 Design Principles

- Privacy first — no data ever leaves the browser, no analytics, no telemetry.

- Zero dependencies — no npm packages, no CDN scripts, no external APIs.

- Non-intrusive — health actions are graduated: gentle nudge first, then overlay, then block.

- Battery friendly — the service worker sleeps between alarm ticks and content scripts are event-driven.

- Accessible — all overlays have ARIA roles and keyboard dismissal.

# 2. Complete File & Folder Structure

Every file in the extension is described below. The project requires no build step — it runs directly from source after loading as an unpacked extension.

# 3. manifest.json — Extension Manifest

The manifest is the entry point Chrome reads first. It declares the extension's identity, permissions, and how each component file connects.

## 3.1 Permissions Explained

# 4. background/service-worker.js — Core Engine

The service worker is the brain of the extension. It runs as a background script in a separate context from any web page, surviving tab navigation. In Manifest V3, service workers can be killed by the browser when idle; chrome.alarms is used to wake it up every 30 seconds so no session data is lost.

## 4.1 Responsibilities

- Listen to chrome.tabs.onActivated and chrome.tabs.onUpdated to know which site is currently active.

- Maintain an in-memory sessionMap of { domain: { startTime, accumulatedMs } } for the current session.

- Every 30 seconds, a chrome.alarms tick flushes session data to chrome.storage.local.

- Compare elapsed time to user-configured daily limits and trigger health actions when thresholds are crossed.

- Receive sound exposure reports from content scripts and accumulate them into a daily dB budget.

- Send messages to content scripts to show or dismiss the break overlay.

- Schedule break alarms using the user-configured break interval.

## 4.2 Module Structure

## 4.3 Startup & Install Listener

## 4.4 Tab Tracking

## 4.5 Alarm Handler

## 4.6 Limit Checking Logic

## 4.7 Message API

The service worker listens for messages from the popup, options page, and content scripts. All messages follow the pattern { type: 'ACTION_NAME', payload: {} }.

# 5. content/content.js — Page Agent

The content script is injected into every page the user visits (except chrome:// and extension pages). It has two independent responsibilities: monitoring audio and rendering health overlays.

## 5.1 Audio Monitoring

When a page starts playing audio through an <audio> or <video> element, the content script intercepts it using the Web Audio API and routes it through an analyser and gain node.

## 5.2 Real-time dB Measurement

## 5.3 Break Overlay

When the service worker sends a SHOW_BREAK message, the content script injects a full-screen overlay into the current page. The overlay dims the page and shows a countdown timer with eye-relaxation guidance.

# 6. content/overlay.css — Break Overlay Styles

These styles are injected alongside content.js into every page. They are scoped to the #hg-overlay and .hg-* selectors so they never affect page styles.

# 7. popup/ — Extension Popup

The popup is the main UI surface, opening when the user clicks the extension icon. It is 320px wide and up to 480px tall. It shows today's health data and provides quick-access controls.

## 7.1 popup.html

The HTML shell declares the structure. All data is injected by popup.js at runtime — the HTML itself contains no hard-coded numbers.

## 7.2 popup.js

The popup script loads today's data from the service worker, renders all the UI sections, and wires up the control buttons.

# 8. options/ — Settings & Analytics Page

The options page is a full-window settings and analytics interface. It is opened from the popup or via chrome://extensions. It has four tabs: Settings, Weekly Report, Sound History, and Data Export.

## 8.1 Settings Tab — User-configurable Parameters

## 8.2 Weekly Report Tab

Renders a 7-day bar chart of total screen time per day and a stacked breakdown by top 10 domains. Both charts are drawn on HTML <canvas> elements using the built-in 2D context — no chart library required.

## 8.3 Sound History Tab

Shows a 30-day line chart of daily hearing dose percentage, a colour-coded calendar heatmap (green = safe, amber = moderate, red = exceeded), and a table of peak loudness events.

## 8.4 Data Export Tab

Offers two export formats:

- JSON export — full 30-day log with per-site times, sound doses, and health flags. Used for personal data portability.

- CSV export — simplified daily summary suitable for opening in a spreadsheet.

Both downloads are created with the Blob API and triggered by a dynamically created <a download> element. No file system permission is required.

# 9. onboarding/ — First-run Setup Wizard

Shown automatically on first install. A 5-step wizard that walks the user through the extension's purpose and collects their initial settings preferences.

## 9.1 Wizard Steps

- Step 1 — Welcome: brief explanation of what HealthGuard does.

- Step 2 — Screen time: set their daily limit and break interval.

- Step 3 — Sound: set their max dB level and hearing warning threshold.

- Step 4 — Schedule: set working hours so tracking is only active when needed.

- Step 5 — Done: shows a summary of their settings and a 'Start protecting my health' button.

On completion, the wizard writes the collected settings to chrome.storage.local and closes the tab. The service worker picks up the settings on its next flush tick.

# 10. utils/ — Utility Modules

## 10.1 utils/storage.js — Persistence Wrapper

Abstracts all read/write operations. Components import this module and never call chrome.storage or IndexedDB directly.

## 10.2 utils/audio-analyser.js — Sound Math & WHO Model

All sound intensity calculations are isolated in this module. It exposes pure functions with no side effects.

## 10.3 utils/time-utils.js — Date & Duration Helpers

# 11. Built-in Health Rules

The following health interventions are implemented in the service worker. All intervals are user-configurable in the options page.

## 11.1 20-20-20 Eye Break

Implementation: A chrome.alarms alarm fires every N minutes (default 20). The service worker sends a SHOW_BREAK message to the active tab content script, which renders the overlay with a 20-second countdown. The page is not blocked — the user can skip the break. Skipped breaks are logged separately.

## 11.2 Posture Check

Every 30 minutes, a desktop notification asks the user to sit up straight and check their posture. The notification includes a short guide: feet flat on floor, monitor at eye level, elbows at 90 degrees.

## 11.3 Hydration Reminder

Every 60 minutes, a notification reminds the user to drink water. Research recommends approximately 250ml of water per hour during sedentary screen use.

## 11.4 WHO Hearing Model

Every audio sample measured by the content script contributes to a daily dose accumulator using the WHO formula. When the dose reaches 80% of the daily limit, a warning notification is sent. When it reaches 100%, the extension automatically lowers the volume cap to 70 dB for the rest of the day.

## 11.5 Blue Light & Sleep Schedule

After 8pm (configurable), the extension shows a one-time notification suggesting the user enable their OS's night mode / blue-light filter and considers winding down screen activity. The notification links to the OS's display settings if possible.

## 11.6 Daily Health Score

At archival time (midnight), the extension computes a 0–100 health score for the day:

- Screen time within limit: +30 points

- All scheduled breaks taken: +25 points

- Hearing dose under 80%: +25 points

- No site limits exceeded: +20 points

The score is stored in the daily log and charted in the Weekly Report tab.

# 12. Installation & Development

## 12.1 Loading the Extension

## 12.2 Debugging

- Service worker logs — click 'Inspect views: service worker' on chrome://extensions.

- Popup logs — right-click the extension icon → Inspect popup.

- Content script logs — open DevTools on any page → Console (filter by content.js).

- Storage inspector — DevTools → Application → Storage → Extension Storage.

## 12.3 Publishing to Chrome Web Store

# 13. Security & Privacy

## 13.1 Data Stays Local

HealthGuard makes zero outbound network requests. There is no server, no analytics endpoint, no CDN, and no telemetry. All data is stored in chrome.storage.local and IndexedDB, both of which are scoped to the extension and inaccessible to web pages.

## 13.2 Content Security Policy

The manifest does not declare a custom CSP, so Chrome's Manifest V3 default applies: script-src 'self'; object-src 'self'. This means no inline scripts, no eval(), and no remote scripts in extension pages.

## 13.3 host_permissions

The <all_urls> host permission is required to inject content.js into all pages. Without it, audio monitoring and break overlays cannot function on arbitrary sites. Users are informed of this during onboarding and on the Chrome Web Store listing.

## 13.4 Cross-origin Isolation

The Web Audio API's AudioContext may require a user gesture to start (browser autoplay policy). The content script checks ctx.state === 'suspended' and calls ctx.resume() on the first user interaction event (click, keydown) using a one-time listener.

# 14. Testing Guide

## 14.1 Manual Testing Checklist

- Screen time: visit 3 sites for 30 seconds each, open popup, verify all three appear in the site list with correct durations.

- Idle detection: leave a tab open and walk away for 2 minutes. Return and verify that the idle time was not counted.

- Break trigger: set break interval to 1 minute in settings, wait, verify overlay appears and countdown works.

- Sound cap: open a YouTube video, set max dB to 60 in settings, verify the volume is audibly reduced.

- Sound dose: let audio play for 10 minutes at high volume, open popup, verify the hearing gauge has increased.

- Daily limit: set total limit to 1 minute, browse for 2 minutes, verify notification appears.

- Data export: go to options → Data Export, download JSON, verify it contains today's data.

## 14.2 Resetting State for Testing

# 15. Changelog

## v1.0.0 — Initial Release

- Screen time tracking with per-site and total daily limits.

- Sound intensity monitoring with WHO hearing dose model.

- 20-20-20 break overlay with configurable interval and duration.

- Posture check and hydration nudge notifications.

- Popup dashboard with screen time bars and hearing gauge.

- Full options page with settings, weekly report, sound history, and data export.

- First-run onboarding wizard.

- Daily health score (0–100).

- JSON and CSV data export.

HealthGuard Chrome Extension — Complete Technical Documentation — v1.0.0
