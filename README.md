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

## The app (Expo Go)

Plan B is channel-agnostic: in deployment the attendee view lives inside the organiser's existing event app or behind an SMS link. The Expo app shows both sides for the demo; a switch at the top flips roles.

| Role | Screens |
|---|---|
| 🎟 **Participant** (warm peach) | One screen: what changed → when to leave → the journey (gate → transport) → Start route (map) → Why this plan → other options. Works offline. Ticket checkout = 3 optional journey questions. |
| 🦺 **Organizer** (muted green) | **Tonight**: normal-night status → "Something changed?" → triage (solved automatically vs needs you) → simulated delivery → Approve & send; compact live forecast. **Pre-mortem**: the weakness found, main constraint, a verified contingency, Apply → re-run. |

The laptop runs a small server (`npm start`, port 3000) with no screens: it holds the API keys, calls Claude, stores plans and sends updates to phones.

## Weather (Organizer → Weather tab)

Live forecast from Meteosource for the exit window, then the AI re-checks attendees' journeys for it (rain on open paths, waiting outside, wind) within their crowd-allocated gate and wave. Real changes become proposals; nothing reaches a phone until a named organizer approves.

Add to `.env.local` (then restart `npm start`):

```
METEOSOURCE_API_KEY=your-key
METEOSOURCE_TIER=free
FESTIVAL_LATITUDE=-37.8183
FESTIVAL_LONGITUDE=144.9739
FESTIVAL_TIMEZONE=Australia/Melbourne
FESTIVAL_DATE=2026-10-08   # the night you demo; the free tier forecasts the next ~day
```

Terminal version: `npm run weather:check`. Tests: `node --import tsx --test tests/*.test.ts`.

## Demo script (≈2 min, one or two phones)

1. Participant → Mei: Plan A, best time to leave 22:30, Gate B → Sandringham 23:07 (Mandarin).
2. Organizer → Tonight: "Plan B is spreading departures" (6,388 in a second wave). **Check** the pre-filled sentence → triage: solved automatically vs **140 need you**; 9,748 leave in waves so no gate is overloaded → simulated SMS link → **Approve & send**.
3. Participant → Mei: Plan B, leave 22:30, Gate C → 22:52 (Mandarin). Start route shows the map; "Why this plan" shows ✓ covered, ✓ avoids closed Gate A.
4. Airplane mode on: the plan stays; "这个不适合我" shows the next option offline.
5. Organizer → Pre-mortem: severe weather → **140** → +1 accessible shuttle at Gate D → **Apply** → **140 → 0**. Also found: River Stage 30 min late → 353 shuttle passengers.

Reset between takes: Organizer → "All clear: everyone back to Plan A", and "Reset contingencies" on the pre-mortem.

Numbers are computed live by the server from `data/` (15,487 attendees in the committed data).

## How it fits together

- `data/*.json`: fake site, transport, timetable, scenarios, profiles (`npm run gen:data` regenerates timetable + profiles, seeded).
- `lib/options.ts`: rules engine. Lists every physically possible exit for a person in a scenario (gate open, covered in storm, step-free, makes the departure).
- `lib/generate.ts`: Claude chooses and ranks between those options, explains the trade-off, and writes the localised text.
- `lib/plan.ts`: validator. Every ID, departure and time in the localised text must match the data; otherwise the plan is rejected and regenerated with the errors (3 tries, then a labelled rules fallback). Medical flags force `needs_human`.
- `lib/trigger.ts`: ed25519-signed trigger `CODE|issued_at|sig`. Phones verify with a public key cached in their bundle.
- `lib/premortem.ts`: same rules engine plus seat limits, every profile × every scenario. Deterministic count; Claude only explains it.
- `mobile/`: the app. Plans, map and trigger key are saved on the phone (AsyncStorage). Updates need *some* connection; the plan itself doesn't.

Honesty notes: SMS and push are simulated (phones poll `/api/trigger`). The EMP sections cited are MOCK.

## Phone app (Expo Go)

The attendee screen is also a native app in `mobile/` (the organiser console and pre-mortem stay on the laptop).

1. Install **Expo Go** on your phone. Phone and laptop on the **same Wi-Fi**.
2. Terminal 1: `npm run build && npm start` (the Plan B server, port 3000). If macOS asks whether to allow incoming connections for `node`, click **Allow**.
3. Terminal 2: `npm run mobile` → scan the QR code (iPhone: Camera app; Android: Expo Go).
4. Pick Mei, Tom or Jake. The app finds the laptop automatically (the address is editable on the first screen).
5. Approve a scenario from `/organiser` on the laptop → the phone buzzes and switches to Plan B. Then turn on airplane mode: the plan stays (saved on the phone).

Long-press the coloured header to switch person. If the venue Wi-Fi blocks phone↔laptop traffic, use a phone hotspot for both.
