<<<<<<< HEAD
# INnnovators

This repository contains a Next.js website at the root and an Expo Go mobile app in `mobile/`. The mobile app displays the same website in a native WebView, so edits to `app/` appear in the browser and on your phone. It requires a running website; it does not provide offline native screens.

## Run the website and mobile app

Install dependencies once (Node.js 22 LTS recommended):

```bash
npm install
npm --prefix mobile install
```

Start the website in one terminal:

```bash
npm run dev:web
```

Open http://localhost:3000 on your computer. If the website is already running on port 3000, keep that terminal running instead of starting it again.

Start Expo in a second terminal:

```bash
npm run dev:mobile
```

Connect your phone and computer to the same Wi-Fi. Open the QR code with the iPhone Camera app or the QR scanner in Expo Go on Android. Allow Expo Go local network access if prompted. Keep both terminals running; Ctrl+C stops a server.

The app uses **Expo SDK 54** for compatibility with the App Store build of Expo Go. On Android, install the matching SDK 54 build from [expo.dev/go](https://expo.dev/go?sdkVersion=54&platform=android&device=true) if your installed version reports a mismatch. See [Expo's compatibility guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

## How the connection works

In development, the mobile app gets your computer's network address from Expo and opens port 3000 on that computer. No account or deployment is needed for local use. Website edits reload through Next.js; changes to `mobile/App.tsx` reload through Expo.

For a different website address or port, copy `mobile/.env.example` to `mobile/.env` and set:

```dotenv
EXPO_PUBLIC_WEBSITE_URL=http://YOUR_COMPUTER_LAN_IP:3000
```

Restart Expo after changing this setting. Use a reachable HTTPS URL for a hosted website. This value is public and must not contain secrets. On a physical phone, `localhost` points to the phone, not your computer.

If the app cannot connect:

- Open the same website URL in your phone's browser first to check network access.
- Ensure the website is running, both devices use the same Wi-Fi, and local network access is allowed. Guest Wi-Fi or a VPN may block device-to-device connections.
- If the website uses a different port, set the full address in `mobile/.env`.
- Tap **Try again** after restoring the connection.
- Expo's tunnel only exposes the Expo bundler. It does not expose the Next.js website; use a separately reachable website URL if using a tunnel.

## Project files

- `app/page.tsx`: website home page.
- `app/layout.tsx` and `app/globals.css`: website layout and styles.
- `mobile/App.tsx`: Expo Go WebView, loading state, and connection retry screen.
- `mobile/app.json`: mobile name, icons, and Expo settings.

The website and mobile app have separate dependencies and lockfiles because they require different React versions. Install dependencies in both directories. Website TypeScript checks exclude the mobile app.

## Checks

```bash
npm run lint
npm run typecheck:mobile
npx tsc --noEmit
```

Build the website with `npm run build`. This local setup does not publish the website or submit a standalone app to an app store.
=======
# Plan B

> Plan A is your day. Plan B is what happens when it changes.

Hackathon prototype (Fieldday × Riverside, Track 2). Each attendee gets a pre-made plan for the normal night and for each likely disruption, cached on their phone. Staff type what's happening, approve, and a tiny signed trigger switches every phone to that person's next step, even if the phone has since lost signal.

## Team setup (run it on your own laptop)

You need: **Node.js 20 or newer** (`node -v` to check; install from nodejs.org), **Git**, and **Expo Go** on your phone.

```bash
git clone https://github.com/tiffanytongen/INnnovators.git plan-b
cd plan-b
npm install
cd mobile && npm install && cd ..
cp .env.example .env.local      # then paste an Anthropic API key after ANTHROPIC_API_KEY=
```

Run it (two terminals, both inside `plan-b`):

```bash
npm run build && npm start      # terminal 1: website + server → http://localhost:3000
npm run mobile                  # terminal 2: phone app → scan the QR code with Expo Go
```

- Your phone and laptop must be on the same Wi-Fi (a phone hotspot is most reliable).
- Without an API key, everything works except **Check** (organiser) and generating new plans.
- While editing website code, `npm run dev` reloads on save (offline mode only works with `npm start`).
- Phone app code: `mobile/App.tsx` and `mobile/SiteMap.tsx`. Shared logic: `lib/`. Website pages: `app/`.
- Get the latest before you start: `git pull`. Save your work: `git add -A && git commit -m "what you changed" && git push`.

## Setup (original notes)

```bash
npm install
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY
npm run gen:plans -- --demo  # test the 4-constraint demo case first (Mei, Tom, Jake)
npm run gen:plans            # heroes × all 8 scenarios
npm run dev                  # http://localhost:3000
```

For filming and the airplane-mode moment, use the production build (the service worker can't cache dev-mode chunks):

```bash
npm run build && npm start
```

## Pages

| URL | What |
|---|---|
| `/demo` | Organiser console + Mei, Tom, Jake phones side by side |
| `/organiser` | Free text → AI scenario → preview → Approve |
| `/me/{person_id}` | Attendee PWA (works offline after first load) |
| `/signup` | 30-second sign-up |
| `/organiser/premortem` | Who has no viable plan per scenario; add a resource, re-run |
| `/api/wallpaper/{person_id}` | Lock-screen PNG: gate, transport, meetup per scenario |

## Demo script (≈2 min)

1. `/demo`: three phones on Plan A. Mei's is in Mandarin.
2. Console: **Analyse** the pre-filled sentence → check chips + preview (affected count, 3 sample messages, simulated SMS to Jake's parent) → **Approve & send**.
3. Phones switch to three different Plan Bs.
4. On a real phone (or DevTools → Network → Offline), reload Mei's page: plan, gate, platform and meetup still there. Tap **这个不适合我** to see the next option offline.
5. `/organiser/premortem`: storm scenario shows **140** with no viable plan → add an accessible shuttle run 23:05 / 150 seats → **0**. Click **reset** after filming.

Reset between takes: **Reset everyone to Plan A** in the console.

## How it fits together

- `data/*.json`: fake site, transport, timetable, scenarios, profiles (`npm run gen:data` regenerates timetable + profiles, seeded).
- `lib/options.ts`: rules engine. Lists every physically possible exit for a person in a scenario (gate open, covered in storm, step-free, makes the departure).
- `lib/generate.ts`: Claude chooses and ranks between those options, explains the trade-off, and writes the localised text.
- `lib/plan.ts`: validator. Every ID, departure and time in the localised text must match the data; otherwise the plan is rejected and regenerated with the errors (3 tries, then a labelled rules fallback). Medical flags force `needs_human`.
- `lib/trigger.ts`: ed25519-signed trigger `CODE|issued_at|sig`. Phones verify with a public key cached in their bundle.
- `lib/premortem.ts`: same rules engine plus seat limits, every profile × every scenario. Deterministic count; Claude only explains it.
- `public/sw.js`: caches the page shell + plan bundle. `/api/trigger` is never cached: **a trigger needs some connection; the plan itself doesn't.**

Honesty notes: SMS and push are simulated (phones poll `/api/trigger`). The EMP sections cited are MOCK.

## Phone app (Expo Go)

The attendee screen is also a native app in `mobile/` (the organiser console and pre-mortem stay on the laptop).

1. Install **Expo Go** on your phone. Phone and laptop on the **same Wi-Fi**.
2. Terminal 1: `npm run build && npm start` (the Plan B server, port 3000). If macOS asks whether to allow incoming connections for `node`, click **Allow**.
3. Terminal 2: `npm run mobile` → scan the QR code (iPhone: Camera app; Android: Expo Go).
4. Pick Mei, Tom or Jake. The app finds the laptop automatically (the address is editable on the first screen).
5. Approve a scenario from `/organiser` on the laptop → the phone buzzes and switches to Plan B. Then turn on airplane mode: the plan stays (saved on the phone).

Long-press the coloured header to switch person. If the venue Wi-Fi blocks phone↔laptop traffic, use a phone hotspot for both.
>>>>>>> 531c703d045bec8f93e872f176c445ad09e78bad
