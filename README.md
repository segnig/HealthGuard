<div align="center">
  <img src="icons/icon128.png" alt="HealthGuard logo" width="96" height="96" />

  # HealthGuard

  ### A Chrome extension for screen time management and hearing health

  HealthGuard runs silently in the background and surfaces only when your health needs attention. It tracks screen time across every website, monitors audio loudness in real time, and nudges you toward healthier digital habits, all without sending a single byte to any server.

  [Installation](#installation) · [Features](#features) · [How it works](#how-it-works) · [Configuration](#configuration) · [Privacy](#privacy) · [Contributing](#contributing)
</div>

---

<!-- Replace this image with: ![Popup screenshot](docs/screenshots/popup.png) -->
<p align="center">
  <img src="https://via.placeholder.com/720x420/1A56A0/FFFFFF?text=Screenshot+placeholder+-+replace+with+docs/screenshots/popup.png" alt="HealthGuard popup screenshot" width="720" />
</p>

---

## Why HealthGuard?

Most screen-time tools tell you how long you've been online. HealthGuard goes further:

- **Eyes** - enforces the 20-20-20 rule with a distraction-free break overlay
- **Ears** - measures actual loudness hitting your ears and tracks cumulative dose against WHO guidelines
- **Posture and hydration** - gentle, scheduled nudges throughout the day
- **Data ownership** - a 30-day health log you can export anytime, stored entirely on your device

---

## Features

### Screen time management

- Tracks active time on every domain, pausing automatically when you're idle
- Set a **total daily limit** and **per-site limits** (for example, YouTube to 1 hour)
- Choose what happens when a limit is hit: notify, overlay reminder, or hard block
- Respects a configurable **schedule** (for example, only track 9 AM to 6 PM on weekdays)

### Sound intensity control

- Hooks into the **Web Audio API** to measure real-time loudness in decibels
- Automatically **caps volume** at your configured safe level via a `GainNode`
- Tracks your **daily hearing dose** using the WHO 85 dB / 8-hour energy model
- Shows a **hearing budget gauge** in the popup from 0% to 100% consumed

### Health break system

| Rule | Default | What it does |
| --- | --- | --- |
| 20-20-20 eye break | Every 20 min | Full-screen overlay with 20-second countdown |
| Posture check | Every 30 min | Desktop notification with a short guide |
| Hydration reminder | Every 60 min | Drink-water nudge notification |
| Blue light warning | After 8 PM | Suggests enabling OS night mode |

### Analytics and reporting

- **Popup dashboard** - today's screen time bars and hearing gauge at a glance
- **Weekly report** - 7-day bar chart of screen time and per-domain breakdown
- **Sound history** - 30-day line chart and calendar heatmap of hearing exposure
- **Daily health score** - 0-100 composite score based on breaks, limits, and hearing

### Data export

Export your full 30-day log as **JSON** or **CSV** at any time from the options page.

---

## Screenshots

Replace the placeholders below with real screenshots after loading the extension.

<table>
  <tr>
    <td align="center">
      <img src="https://via.placeholder.com/300x480/EFF6FF/1A56A0?text=Popup+dashboard" width="300" alt="Popup dashboard" /><br />
      <sub>Popup dashboard</sub>
    </td>
    <td align="center">
      <img src="https://via.placeholder.com/300x480/ECFDF5/0F6E56?text=Settings+page" width="300" alt="Settings page" /><br />
      <sub>Settings page</sub>
    </td>
    <td align="center">
      <img src="https://via.placeholder.com/300x480/FFFBEB/854F0B?text=Break+overlay" width="300" alt="Break overlay" /><br />
      <sub>20-20-20 break overlay</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://via.placeholder.com/300x220/F8FAFC/334155?text=Weekly+report" width="300" alt="Weekly report" /><br />
      <sub>Weekly screen time report</sub>
    </td>
    <td align="center">
      <img src="https://via.placeholder.com/300x220/F8FAFC/334155?text=Sound+history" width="300" alt="Sound history" /><br />
      <sub>Sound history heatmap</sub>
    </td>
    <td align="center">
      <img src="https://via.placeholder.com/300x220/F8FAFC/334155?text=Onboarding+wizard" width="300" alt="Onboarding wizard" /><br />
      <sub>First-run setup wizard</sub>
    </td>
  </tr>
</table>

---

## How it works

### Screen time tracking

```text
Tab activated -> record domain + timestamp
      |
Every 30 s -> flush elapsed ms to chrome.storage.local
      |
Compare against daily limit per domain + total
      |
Limit hit? -> notify / overlay / block (user's choice)
```

The service worker listens to `chrome.tabs.onActivated` and `chrome.idle.onStateChanged`. When you're idle for more than 60 seconds, the timer pauses automatically so idle time is never counted.

### Sound intensity pipeline

```text
<audio> / <video> plays on page
      |
content.js creates AudioContext -> AnalyserNode -> GainNode -> destination
      |
4x per second: compute RMS amplitude -> convert to dB
      |
Apply volume cap via GainNode.gain
      |
Report { dB, durationMs } to service worker
      |
Accumulate WHO dose: delta = hours * 10^((dB - 85) / 10)
```

When dose reaches **80%**, HealthGuard shows a warning notification.  
When dose reaches **100%**, volume cap automatically drops to 70 dB for the rest of the day.

### Daily health score

| Component | Points |
| --- | --- |
| Total screen time within daily limit | 30 |
| All scheduled breaks taken | 25 |
| Hearing dose below 80% | 25 |
| No per-site limit exceeded | 20 |
| **Maximum** | **100** |

---

## Project structure

```text
healthguard/
├── manifest.json                 <- Extension manifest (MV3)
├── background/
│   └── service-worker.js         <- Core engine and alarm scheduler
├── content/
│   ├── content.js                <- Audio monitoring and break overlay
│   └── overlay.css               <- Overlay styles (scoped to #hg-*)
├── popup/
│   └── popup.html / .js / .css   <- Dashboard popup
├── options/
│   └── options.html / .js / .css <- Settings and analytics page
├── onboarding/
│   └── onboarding.html / .js     <- First-run wizard
├── utils/
│   ├── storage.js                <- chrome.storage + IndexedDB wrapper
│   ├── time-utils.js             <- Date and duration helpers
│   └── audio-analyser.js         <- WHO dB model and gain math
├── icons/
│   └── icon16 / 32 / 48 / 128.png
└── _locales/en/messages.json     <- i18n strings
```

---

## Installation

### Load unpacked (development)

No build step required; the extension runs directly from source.

1. Clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/healthguard.git
   cd healthguard
   ```

2. Open `chrome://extensions`.
3. Enable **Developer Mode** (top-right toggle).
4. Click **Load unpacked** and select the `healthguard/` folder.
5. The HealthGuard icon appears in your toolbar.

### Reload after changes

- On `chrome://extensions`, click the refresh icon next to HealthGuard.
- Or press `Ctrl+R` while the extension options page is open.

### Chrome Web Store

Coming soon; submission in progress.

---

## Configuration

Open the options page via popup -> **Settings**, or right-click the extension icon -> **Options**.

| Setting | Default | Description |
| --- | --- | --- |
| Daily screen time limit | 4 hours | Total active browser time per day |
| Per-site limits | None | Domain-level caps (for example, `youtube.com -> 1h`) |
| Action on limit | Notify | `notify`, `overlay`, or `block` |
| Break interval | 20 min | How often the 20-20-20 overlay appears |
| Break duration | 20 sec | Countdown length |
| Max sound level | 85 dB | Volume ceiling applied to all media |
| Hearing budget warning | 80% | When to send the first hearing alert |
| Active schedule | 9 AM to 6 PM | Tracking hours on weekdays |
| Posture check interval | 30 min | Posture notification frequency |
| Hydration nudge interval | 60 min | Drink-water reminder frequency |
| Blue light warning | 8 PM | Evening screen-time suggestion |
| Notification sound | Gentle chime | `none`, `chime`, or `voice` |
| Auto-export | Off | Weekly JSON saved to Downloads |

---

## Permissions

| Permission | Reason |
| --- | --- |
| `tabs` | Know which site is active to track time correctly |
| `activeTab` | Read the current tab's URL without exposing all tabs |
| `alarms` | 30-second flush ticks and break scheduling |
| `storage` | Persist today's data and user settings locally |
| `notifications` | Show break reminders and health alerts |
| `scripting` | Inject the break overlay into the active page |
| `idle` | Pause the timer when you step away |
| `host_permissions: <all_urls>` | Required to inject `content.js` for audio monitoring on any site |

---

## Privacy

**No data ever leaves your browser.**

- Zero outbound network requests: no analytics, no telemetry, no CDN calls
- No accounts, no sign-in, no cloud sync
- All data is stored in `chrome.storage.local` and `IndexedDB`, both scoped to the extension
- Export your full history anytime as JSON or CSV from the options page
- Uninstalling the extension deletes all stored data automatically

---

## Browser support

| Browser | Support |
| --- | --- |
| Chrome 120+ | Full support |
| Edge 120+ (Chromium) | Full support |
| Firefox | Not supported (Manifest V3 differences) |
| Safari | Not supported |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/healthguard.git
cd healthguard

# Load unpacked as described in Installation above
# Make your changes (no build step needed)
# Open a pull request against main
```

### Ideas for contributions

- [ ] Firefox port (Manifest V3 compatible)
- [ ] Allow/block list for sound monitoring (for example, skip video calls)
- [ ] Pomodoro mode as an alternative to the 20-20-20 schedule
- [ ] Export to Apple Health / Google Fit format
- [ ] Color-blind-friendly gauge themes

---

## License

[MIT](LICENSE) © 2025 segni

---

<div align="center">
  Made with care for digital health.  
  If HealthGuard helped you, consider giving it a star.
</div>