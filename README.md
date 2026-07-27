# Setter Command

Door-knocking field app for exterior home-improvement appointment setters (stucco, exterior paint, woodwork/eaves/fascia, roofing, turf — retail, no insurance claims). A RepCard-style knock logger with an end-of-day export back into RepCard.

## What it does

- **Knocking (RepCard-style)** — four dispositions, big tap targets: **Not home · Not interested · Renting · Lead**. Every knock is timestamped; leads prompt you for owner info.
- **Map** — satellite view where you can see every actual house (toggle to street map), GPS "locate me," tap a house to drop a door (auto reverse-geocoded), pins color-coded by disposition. Live knock mode times your doorstep dwell and auto-logs short stops as Not home.
- **Knock route + directions** — one tap plans a walking route through your un-knocked doors (nearest-neighbor from where you stand), numbers the pins in order, draws the path, and gives turn-by-turn directions per stop (free OSRM routing) plus a "Go" deep link into Google Maps navigation for each house.
- **Area planning** — draw a radius, and AI builds a knock plan + flags active rentals to skip + writes a manager summary.
- **Public records** — "Pull records" returns owner name, owner-occupied vs rental (→ mark it Renting), year built, sale history (RentCast; optional key).
- **Book** — ranks tomorrow's slots against your schedule. A Lead only exports once it has an appointment.
- **EOD → RepCard** — one screen at the end of the day: today's disposition counts, CSV export (share sheet on your phone, RepCard import format), a warning for leads still missing appointments, and **Quick Fill** — tap-to-copy fields in RepCard's form order so you can punch doors into the RepCard app in seconds.
- **Texting CRM** — per-contact threads, follow-up queue with due dates, canned templates, AI drafts in your voice. Sending always opens your phone's Messages app prefilled — texts go from your number, never auto-sent.
- **Scripts** — psychology-backed openers, objection handlers, re-knock scripts, all built around the retail pitch: free exterior walk-around + written quote, crew-in-the-neighborhood pricing. No insurance-claim angles.
- **Train** — three modes: **Full door** (16 personas covering edge cases: renters, no-soliciting signs, tight budgets, one-leggers, teens, dog chaos, curveball interruptions), **Section drills** (start the conversation at the exact moment you want to practice — opener, "how much", spouse lock-in, either/or close, re-knock…), and the **Objection gauntlet** (rapid-fire objections, every answer scored /10 with the better line). Voice in/out, coach hints, rubric scorecard.
- **Stats** — contact rate, hot hours, AI pattern analysis, one-tap manager report.

## Deploy

Push to `main` — Vercel auto-deploys (project: `doorknockingapp`).

## Environment variables (Vercel → Settings → Environment Variables)

| Key | Powers | Required? |
|-----|--------|-----------|
| `ANTHROPIC_API_KEY` | Trainer, texts, area plans, reports, pattern analysis | For AI features. Get at console.anthropic.com |
| `RENTCAST_API_KEY` | Owner records, year built, sale history, rental detection | Optional. Free tier 50/mo at app.rentcast.io/app/api |

Without keys, the app still logs knocks, maps, books, exports, and quick-fills — and deep-links to county records/Zillow instead of auto-pulling.

## Honest limits (by design)

- **No iMessage automation** — Apple locks iMessage; the app opens Messages with your text prefilled instead.
- **No auto-blasting texts** — cold-texting strangers violates the TCPA. The app drafts and hands off; it never auto-sends.
- **RepCard has no public write API** — export is via their CSV import plus the Quick Fill copy flow.
- **Property data isn't free-unlimited** — RentCast's free tier is 50 lookups/month.
- **GPS accuracy** — dwell auto-status works best with high-accuracy GPS on and the screen awake.

## Local dev

```bash
npm install
cp .env.example .env.local   # paste your keys
npm run dev                  # http://localhost:3000
```

Data is stored in your browser (localStorage), per device. Export CSV regularly so you don't lose your log.

Booking hours live in `lib/constants.js` → `HOURS` (0=Sun … 6=Sat, 24h). Dwell thresholds are in `lib/geo.js`. Trainer personas/sections/objections are in `components/TrainTab.jsx`.
