# Tidal Field Kit

Door-knocking field kit for exterior remodeling appointment setting in North San Diego County.
Four pages, one serverless route, no build step.

| Route | What it is |
|---|---|
| `/` | Home. Add this to your phone's home screen. |
| `/shift` | Shift tool. Auto-logs a door every time you stop at one (GPS + accelerometer), plus script, damage guide, objections, live pace and end-of-shift numbers. |
| `/crm` | Lead CRM. Who to contact right now, filterable pipeline, appointment tracking with confirmation texts. |
| `/request` | The homeowner-facing page behind your QR code. Requests a free assessment and says exactly when the office will call. Also at `/qr`. |
| `/print` | Printable pocket card and QR leave-behinds. |
| `/api/leads` | Serverless proxy to the Google Sheet. |

---

## Deploy

Push to `main` and Vercel builds it. There is no build step — it's static files plus one
Node function in `api/`, so `vercel.json` sets `framework: null`.

### Environment variables

Set these in **Vercel → Settings → Environment Variables**, then **redeploy** — environment
variables only take effect on a new deployment.

| Key | What it does | Required? |
|---|---|---|
| `SHEETS_WEBAPP_URL` | The Apps Script web app URL from `docs/tidal-crm-backend.gs` | For lead capture |
| `SHEETS_TOKEN` | The `TOKEN` value inside that script. Must match exactly. | For lead capture |
| `CRM_PASSCODE` | A passcode you invent. Required to *read* the lead list. | For the CRM |

Without them the pages all still work — the shift tool, script, damage guide, objections and
printables need no backend at all. Only lead capture and the CRM go quiet, and they say so.

### The Google Sheet backend

`docs/tidal-crm-backend.gs` turns a free Google Sheet into the database. Setup is in the
comment block at the top of that file, and repeated in the CRM's SETUP tab. Roughly: new sheet →
Extensions → Apps Script → paste → set `TOKEN` and `NOTIFY_EMAIL` → Deploy as a web app,
executing as *Me*, access *Anyone* → copy the URL into `SHEETS_WEBAPP_URL`.

It emails you the moment a homeowner submits. During office hours the subject line says
**call now**; outside them it says which morning to call. Attach the `sendMorningDigest`
function to a weekday 8–9am trigger and it also mails a digest of anything still uncalled.

---

## Why the API route exists

Without it, the Apps Script URL and token would have to sit in client-side JavaScript, where
anyone could read every customer record by viewing source. `api/leads.js` keeps them in
environment variables instead.

The two directions are deliberately asymmetric:

- **Writing a new lead is open.** A homeowner filling in `/request` has no passcode. Input is
  validated, length-capped, and has a honeypot field.
- **Reading the list requires `CRM_PASSCODE`.** It contains names, phone numbers and home
  addresses. If `CRM_PASSCODE` isn't set, reading is off entirely rather than open.

The CRM sends the passcode as an `X-CRM-Key` header. You enter it once in SETUP, then
**Get my link** bakes it into a URL you add to your home screen. That link is a credential —
treat it like one.

---

## Offline

`sw.js` precaches the shell and serves network-first with a cache fallback, because canyon
neighbourhoods and dead zones are normal here. `/api/` is never cached — stale lead data would
be worse than no lead data.

Bump `VERSION` in `sw.js` on any deploy where you want clients to drop their cached copies.
`activate` deletes every cache that isn't the current version.

---

## Local development

```bash
npm run dev        # serves the static files on :3000
```

That serves the pages but not `/api/leads` — for the full thing use `npx vercel dev`, which
runs the function too, with a `.env.local` copied from `.env.example`.

---

## Notes that matter more than the code

**Clear this with your manager before using it.** Leads are usually company property and Tidal
requires RepCard. The safe framing is that RepCard is the system of record and this is a personal
working layer on top of it.

**The script content is deliberately not the standard one.** The mold / termite / "moisture is
getting in right now" chain that circulates in canvassing scripts is factually weak in a climate
with ~10 inches of rain a year, and asserting unobserved damage to procure a contract is a
misdemeanour under California B&P §7161(b) — which reaches the *solicitor* personally, not just
the contractor. `docs/PLAYBOOK.md` has the reasoning and the replacement wording.

**Verified company facts only.** CSLB #984966 (note there is a second licence, #1135348, for
Tidal Remodeling USA Inc — confirm which entity writes the contracts before quoting a number at
a door), GAF Master Elite, BBB Accredited since 2023 rated **A** — not A+. Financing and Owens
Corning / CertainTeed certification could not be verified; don't claim them.

**Location data never leaves the phone.** The shift tool's GPS track, door counts and notes are
held in memory and exported by you. Nothing is uploaded. Only leads you explicitly save go to
your sheet.
