# Plan B

> Plan A is your day. Plan B is what happens when it changes.

Hackathon prototype (Fieldday × Riverside, Track 2). Each attendee gets a pre-made plan for the normal night and for each likely disruption, cached on their phone. Staff type what's happening, approve, and a tiny signed trigger switches every phone to that person's next step, even if the phone has since lost signal.

## Setup

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
