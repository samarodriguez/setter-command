"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import TextsTab from "./TextsTab";
import TrainTab from "./TrainTab";
import QuickFill from "./QuickFill";
const MapTab = dynamic(() => import("./MapTab"), { ssr: false, loading: () => <div className="p-10 text-center text-slate-400">Loading map…</div> });
import {
  DoorOpen, CalendarClock, Mic, MicOff, BarChart3,
  Download, Satellite, Search, Phone, Plus, X, ChevronRight,
  Home, Sparkles, Trash2, ExternalLink, ClipboardList, Flame,
  Map as MapIcon, MessageSquare, Building2, Loader2, FileText,
  Share2, ClipboardCopy, AlertTriangle
} from "lucide-react";
import { STATUSES, statusMeta, HOURS, DAY_NAMES, fmtHour, uid, askClaude, sameDay } from "../lib/constants";
import { buildExport, toCSV, shareOrDownloadCSV } from "../lib/repcard";
import { makeRecognizer } from "../lib/speech";

/* ---------- constants ---------- */

const DAMAGE_ITEMS = [
  "Missing / lifted shingles", "Granules in gutters or driveway", "Dented gutters / downspouts",
  "Dented soft metals (vents, flashing)", "Tarp or patch visible", "Sagging roofline",
  "Neighbor has new roof / yard sign", "Tree overhang / limb damage", "Older roof (curling, dark streaks)"
];

const SCRIPTS = [
  {
    title: "Storm opener — neighbor proof",
    tag: "Social proof + pattern interrupt",
    body: `Hey, sorry to bug you — I'm actually not selling anything door to door today. I'm [NAME] with [COMPANY]; we're the ones doing the roof over on [STREET/NEIGHBOR]. While our crew's in the neighborhood, the adjusters flagged this block for the same storm path. Took me literally 30 seconds from the street to see a couple things on your roofline I'd want checked if it were my house. When we're back out tomorrow, would late morning or afternoon be easier for a free 15-minute look?`,
    why: "Opens by breaking the 'salesman' frame, borrows trust from a visible neighbor job, and closes on an either/or time — never a yes/no."
  },
  {
    title: "The assumptive reset (they hesitate)",
    tag: "Assumptive close",
    body: `Totally fair — most folks on this street said the same thing until they saw the photos. Here's all it is: we get on the roof, take pictures, and hand them to you. If it's clean, you get peace of mind and never see me again. If it's not, insurance usually covers it and your rate doesn't change for storm damage. I've got tomorrow at 10:30 or 1 — which one's worse for you?`,
    why: "'Which one's worse' is a soft-pattern-interrupt version of the alternative close; the 'never see me again' line lowers threat."
  },
  {
    title: "Both-homeowners lock-in",
    tag: "Decision-unit control",
    body: `One thing so I don't waste your evening — when we show the photos, it's a 20-minute sit-down and it only makes sense with both of you there, since it's an insurance decision on the house. What time tomorrow are you both actually home and not running out the door — like a solid open hour or two?`,
    why: "Names the real reason (insurance decision) so asking for the spouse feels logical, not salesy. Anchors them to a wide-open window."
  },
  {
    title: "Objection: 'How much is this?'",
    tag: "Reframe",
    body: `Great question — and honestly, maybe nothing. The inspection's free, and if there's storm damage your insurance is what pays for the roof; that's what your premiums have been buying. My job is just to document it so you don't eat a $15k roof out of pocket in three years. Fastest way to know is the 15-minute look — mornings or afternoons better?`,
    why: "Moves price from 'cost to them' to 'money they already paid.' Ends on the appointment, not the debate."
  },
  {
    title: "Objection: 'I already have a roofer / a guy'",
    tag: "Aikido — agree and redirect",
    body: `Perfect — that actually makes this easier. Get our inspection photos for free, hand them to your guy, and he can do the work. All I care about is that it gets documented before the insurance filing window closes on this storm date. Want me to grab those photos tomorrow morning?`,
    why: "Zero resistance. You keep the appointment; the close on-site handles the rest."
  },
  {
    title: "Objection: 'Not interested'",
    tag: "One-line takeaway",
    body: `No problem at all — quick heads up before I go: the filing window on the [DATE] storm closes soon, and I'm only in this neighborhood while our crew is. If the roof's fine, the photos just prove it for when you sell. 15 minutes tomorrow, and I'm out of your hair either way — fair enough?`,
    why: "Ethical scarcity (real deadline, real crew schedule) + a benefit even if there's no damage. 'Fair enough' gets micro-agreement."
  },
  {
    title: "Callback door hanger pitch (nobody home twice)",
    tag: "Curiosity loop",
    body: `(Write on hanger/note) "Stopped by twice — saw something on the [left/right] side of your roofline you'll want to look at before the next rain. Free photos, no obligation. Text [NAME] at [PHONE]." `,
    why: "Specific + incomplete information ('the left side') creates a curiosity gap generic flyers never do."
  },
  {
    title: "Re-knock a 'not interested' 2+ weeks later",
    tag: "New reason, new frame",
    body: `Hey — [NAME] again, different reason this time. We finished [NEIGHBOR ADDRESS] and the adjuster approved full replacement two doors down, same storm. Since the damage pattern runs down this side of the street, I'd feel bad not offering the look again. Same free 15 minutes — tomorrow work?`,
    why: "Never re-open with the old pitch. A concrete new event resets the interaction."
  }
];

/* ---------- storage + migration ---------- */

const STATUS_MIGRATION = { talked: "lead", callback: "lead", appt: "lead", dnk: "not_int" };

function migrate(data) {
  if (!data || data.v >= 2) return data;
  for (const h of data.houses || []) {
    if (STATUS_MIGRATION[h.status]) h.status = STATUS_MIGRATION[h.status];
    for (const k of h.knocks || []) if (STATUS_MIGRATION[k.status]) k.status = STATUS_MIGRATION[k.status];
    if (!h.texts) h.texts = [];
    if (h.followUpAt === undefined) h.followUpAt = null;
  }
  data.v = 2;
  return data;
}

async function loadData() {
  try {
    const r = localStorage.getItem("setter-command-v1");
    return r ? migrate(JSON.parse(r)) : null;
  } catch { return null; }
}
async function saveData(data) {
  try { localStorage.setItem("setter-command-v1", JSON.stringify(data)); } catch (e) { console.error(e); }
}

export function newHouse(fields = {}) {
  return {
    id: uid(), address: "", city: "", state: "", zip: "",
    owner: { first: "", last: "", phone: "", email: "" },
    status: "", notes: "", damage: [], knocks: [], appt: null, property: null,
    texts: [], followUpAt: null, createdAt: Date.now(), ...fields,
  };
}

/* ---------- scheduling ---------- */

function nextWorkDay(from) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (!HOURS[d.getDay()]) d.setDate(d.getDate() + 1);
  return d;
}
function buildSlots(date) {
  const [start, end] = HOURS[date.getDay()];
  const dow = date.getDay();
  const slots = [];
  for (let t = start; t <= end - 1; t += 0.5) {
    const buffer = end - t;
    let score = 0; const reasons = [];
    if (buffer >= 2.5) { score += 3; reasons.push("big open window — no rush on your end"); }
    else if (buffer >= 1.5) { score += 1; reasons.push("workable window"); }
    else { score -= 3; reasons.push("hard stop looming — sit gets cut short"); }
    if (dow === 6 && t >= 10 && t <= 13) { score += 3; reasons.push("Saturday late morning: both owners usually home, unhurried"); }
    if (dow >= 1 && dow <= 5 && t >= 10 && t <= 14.5) { score += 2; reasons.push("midday weekday: WFH / retirees, relaxed pace"); }
    if (dow >= 1 && dow <= 5 && t >= 17 && t < 18.5) { score -= 2; reasons.push("dinner-hour risk: distracted, clock-watching"); }
    if (t === start) { score += 1; reasons.push("first sit of your day — fresh energy, on time"); }
    slots.push({ t, label: fmtHour(t), score, reasons });
  }
  return slots.sort((a, b) => b.score - a.score);
}

/* ---------- app ---------- */

export default function App() {
  const [tab, setTab] = useState("doors");
  const [data, setData] = useState({ houses: [], v: 2 });
  const [loaded, setLoaded] = useState(false);
  const [openHouse, setOpenHouse] = useState(null);

  useEffect(() => { loadData().then((d) => { if (d) setData(d); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) saveData(data); }, [data, loaded]);

  const update = (fn) => setData((d) => { const nd = JSON.parse(JSON.stringify(d)); fn(nd); return nd; });
  const house = data.houses.find((h) => h.id === openHouse) || null;

  const tabs = [
    { id: "map", label: "Map", icon: MapIcon },
    { id: "doors", label: "Doors", icon: DoorOpen },
    { id: "book", label: "Book", icon: CalendarClock },
    { id: "texts", label: "Texts", icon: MessageSquare },
    { id: "scripts", label: "Scripts", icon: ClipboardList },
    { id: "train", label: "Train", icon: Mic },
    { id: "stats", label: "EOD", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 pt-3 pb-2 shadow-md">
        <div className="flex items-center justify-between">
          <div className="disp text-2xl font-extrabold uppercase tracking-wide flex items-center gap-2">
            <Flame size={20} className="text-amber-400" /> Setter Command
          </div>
          <div className="text-xs text-slate-300">{DAY_NAMES[new Date().getDay()]} · {HOURS[new Date().getDay()] ? `${fmtHour(HOURS[new Date().getDay()][0])}–${fmtHour(HOURS[new Date().getDay()][1])}` : "Off"}</div>
        </div>
      </header>

      <main className="pb-24 max-w-2xl mx-auto">
        {tab === "map" && <MapTab data={data} update={update} onOpen={setOpenHouse} statuses={STATUSES} />}
        {tab === "texts" && <TextsTab data={data} update={update} />}
        {tab === "doors" && <Doors data={data} update={update} onOpen={setOpenHouse} />}
        {tab === "book" && <Book data={data} update={update} />}
        {tab === "scripts" && <Scripts />}
        {tab === "train" && <TrainTab />}
        {tab === "stats" && <Stats data={data} />}
      </main>

      {house && <HouseSheet house={house} update={update} close={() => setOpenHouse(null)} />}

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex justify-between max-w-2xl mx-auto overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center py-2 px-3 flex-1 min-w-[52px] ${tab === t.id ? "text-amber-600" : "text-slate-400"}`}>
            <t.icon size={22} />
            <span className="disp text-xs font-bold uppercase mt-0.5">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------- doors ---------- */

function Doors({ data, update, onOpen }) {
  const [addr, setAddr] = useState("");
  const [filter, setFilter] = useState("all");
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const add = () => {
    const a = addr.trim();
    if (!a) return;
    const h = newHouse({ address: a });
    update((d) => d.houses.unshift(h));
    setAddr("");
    onOpen(h.id);
  };

  const voiceAdd = () => {
    if (listening) { recRef.current?.stop(); return; }
    const r = makeRecognizer((t) => setAddr(t), () => setListening(false));
    if (!r) { alert("Voice input isn't supported in this browser."); return; }
    recRef.current = r; setListening(true); r.start();
  };

  const quickLog = (h, statusId) => {
    update((d) => {
      const x = d.houses.find((y) => y.id === h.id);
      x.status = statusId;
      x.knocks.push({ ts: Date.now(), status: statusId });
    });
    // Leads need a name/phone for the export — open the sheet right away.
    if (statusId === "lead") onOpen(h.id);
  };

  const todayCount = (sid) => data.houses.filter((h) => h.knocks.some((k) => sameDay(k.ts, new Date()) && (sid === "all" || h.status === sid))).length;
  const shown = data.houses.filter((h) => filter === "all" ? true : h.status === filter);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-3">
        <div className="flex gap-2">
          <input value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="123 Main St, City" className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-base outline-none focus:border-amber-500" />
          <button onClick={voiceAdd} className={`knockbtn rounded-xl px-3 ${listening ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600"}`}>
            {listening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button onClick={add} className="knockbtn rounded-xl bg-amber-500 text-white px-4 font-bold"><Plus size={22} /></button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Tap the mic and say the address while you walk up — or drop pins from the Map tab.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All ({data.houses.length})</Chip>
        {STATUSES.map((s) => (
          <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)}>
            {s.label} ({data.houses.filter((h) => h.status === s.id).length})
          </Chip>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="text-center py-14 text-slate-400">
          <DoorOpen size={40} className="mx-auto mb-2" />
          <p className="disp text-lg font-bold uppercase">No doors yet</p>
          <p className="text-sm">Add the first address on your street to start the log.</p>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((h) => {
          const m = h.status ? statusMeta(h.status) : null;
          return (
            <div key={h.id} className="bg-white rounded-2xl shadow-sm p-3">
              <button onClick={() => onOpen(h.id)} className="w-full flex items-center justify-between text-left">
                <div>
                  <div className="font-semibold text-[15px]">{h.address}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    {m ? <span className={`px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span> : <span className="text-slate-400">Not knocked</span>}
                    {h.knocks.length > 0 && <span>{h.knocks.length}×</span>}
                    {h.appt && <span className="text-emerald-700 font-medium">📅 {h.appt.label}</span>}
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </button>
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {STATUSES.map((s) => (
                  <button key={s.id} onClick={() => quickLog(h, s.id)}
                    className={`knockbtn rounded-xl py-2.5 flex flex-col items-center gap-0.5 ${h.status === s.id ? s.btn + " ring-2 ring-slate-900/10" : "bg-slate-50 text-slate-400"}`}>
                    <s.icon size={18} />
                    <span className="text-[10px] font-bold uppercase leading-none">{s.short}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{children}</button>
);

/* ---------- house detail ---------- */

function HouseSheet({ house, update, close }) {
  const [noteRec, setNoteRec] = useState(false);
  const recRef = useRef(null);
  const full = [house.address, house.city, house.state, house.zip].filter(Boolean).join(", ");
  const q = encodeURIComponent(full);

  const set = (fn) => update((d) => fn(d.houses.find((h) => h.id === house.id)));

  const voiceNote = () => {
    if (noteRec) { recRef.current?.stop(); return; }
    const r = makeRecognizer((t) => set((h) => { h.notes = (h.notes ? h.notes + " " : "") + t; }), () => setNoteRec(false));
    if (!r) { alert("Voice input isn't supported in this browser."); return; }
    recRef.current = r; setNoteRec(true); r.start();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={close}>
      <div className="bg-slate-100 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-100 px-4 pt-4 pb-2 flex items-start justify-between z-10">
          <div>
            <div className="disp text-xl font-extrabold uppercase leading-tight">{house.address}</div>
            <div className="text-xs text-slate-500">{house.knocks.length} knock{house.knocks.length === 1 ? "" : "s"} logged</div>
          </div>
          <button onClick={close} className="p-2 bg-white rounded-full shadow-sm"><X size={18} /></button>
        </div>

        <div className="px-4 pb-8 space-y-4">
          {/* disposition */}
          <div className="grid grid-cols-4 gap-1.5">
            {STATUSES.map((s) => (
              <button key={s.id} onClick={() => set((h) => { h.status = s.id; h.knocks.push({ ts: Date.now(), status: s.id }); })}
                className={`knockbtn rounded-xl py-3 flex flex-col items-center gap-1 ${house.status === s.id ? s.btn : "bg-white text-slate-400 shadow-sm"}`}>
                <s.icon size={19} />
                <span className="text-[10px] font-bold uppercase leading-none">{s.short}</span>
              </button>
            ))}
          </div>
          {house.status === "lead" && !house.appt && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> Leads only export to RepCard once an appointment is booked — set one on the Book tab.</p>
          )}

          {/* satellite roof view */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <iframe title="roof" className="w-full h-52" loading="lazy"
              src={`https://maps.google.com/maps?q=${q}&t=k&z=20&output=embed`} />
            <div className="p-2 grid grid-cols-3 gap-2 text-xs">
              <A href={`https://www.google.com/maps?q=${q}&layer=c`}><Satellite size={14} /> Street View</A>
              <A href={`https://www.zillow.com/homes/${q}_rb/`}><Home size={14} /> Zillow</A>
              <A href={`https://www.google.com/search?q=${q}+county+property+records+owner`}><Search size={14} /> County records</A>
            </div>
            <p className="px-3 pb-3 text-[11px] text-slate-400">Satellite zoom shows the roof from above — check for patching, tarps, and discoloration before you knock. Use the county link to pull the owner's name from the assessor, then save it below.</p>
          </div>

          <PropertyLookup house={house} set={set} />

          {/* owner */}
          <Card title="Homeowner">
            <div className="grid grid-cols-2 gap-2">
              <In v={house.owner.first} ph="First name" on={(v) => set((h) => (h.owner.first = v))} />
              <In v={house.owner.last} ph="Last name" on={(v) => set((h) => (h.owner.last = v))} />
              <In v={house.owner.phone} ph="Phone" on={(v) => set((h) => (h.owner.phone = v))} />
              <In v={house.owner.email} ph="Email" on={(v) => set((h) => (h.owner.email = v))} />
              <In v={house.city} ph="City" on={(v) => set((h) => (h.city = v))} />
              <div className="grid grid-cols-2 gap-2">
                <In v={house.state} ph="ST" on={(v) => set((h) => (h.state = v))} />
                <In v={house.zip} ph="Zip" on={(v) => set((h) => (h.zip = v))} />
              </div>
            </div>
            {house.owner.phone && <a href={`tel:${house.owner.phone}`} className="mt-2 flex items-center gap-1 text-sm text-amber-700 font-semibold"><Phone size={14} /> Call {house.owner.phone}</a>}
          </Card>

          {/* damage checklist */}
          <Card title="Visible damage (from street / satellite)">
            <div className="flex flex-wrap gap-1.5">
              {DAMAGE_ITEMS.map((it) => {
                const on = house.damage.includes(it);
                return (
                  <button key={it} onClick={() => set((h) => { h.damage = on ? h.damage.filter((x) => x !== it) : [...h.damage, it]; })}
                    className={`text-xs px-2.5 py-1.5 rounded-full ${on ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600"}`}>{it}</button>
                );
              })}
            </div>
            {house.damage.length > 0 && <p className="text-[11px] text-rose-600 mt-2 font-medium">Name one of these specifically at the door — "I noticed granules piling at your downspout" beats any pitch line.</p>}
          </Card>

          {/* notes */}
          <Card title="Interaction notes" action={
            <button onClick={voiceNote} className={`p-2 rounded-full ${noteRec ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600"}`}>
              {noteRec ? <MicOff size={16} /> : <Mic size={16} />}
            </button>}>
            <textarea value={house.notes} onChange={(e) => set((h) => (h.notes = e.target.value))} rows={4}
              placeholder="Who answered, objections, dog, best time, spouse's name, kids' sport in the yard…"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-amber-500" />
            <p className="text-[11px] text-slate-400">Notes ride along in the RepCard export. Details win re-knocks — log the small stuff.</p>
          </Card>

          {/* knock history */}
          {house.knocks.length > 0 && (
            <Card title="History">
              {house.knocks.slice().reverse().map((k, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className={`px-2 py-0.5 rounded-full ${statusMeta(k.status).cls}`}>{statusMeta(k.status).label}{k.auto ? " (auto)" : ""}</span>
                  <span className="text-slate-400">{new Date(k.ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
              ))}
            </Card>
          )}

          <button onClick={() => { if (confirm("Delete this house?")) { update((d) => { d.houses = d.houses.filter((h) => h.id !== house.id); }); close(); } }}
            className="w-full text-rose-500 text-sm py-2 flex items-center justify-center gap-1"><Trash2 size={14} /> Delete house</button>
        </div>
      </div>
    </div>
  );
}

function PropertyLookup({ house, set }) {
  const [busy, setBusy] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const p = house.property;
  const full = [house.address, house.city, house.state, house.zip].filter(Boolean).join(", ");

  const lookup = async () => {
    setBusy(true); setNeedsKey(false);
    try {
      const r = await fetch("/api/property", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record", address: full || house.address }),
      });
      const d = await r.json();
      if (d.needsKey) { setNeedsKey(true); setBusy(false); return; }
      if (d.found) {
        set((h) => {
          h.property = d;
          if (d.owner && d.owner[0] && !h.owner.first) {
            const parts = String(d.owner[0]).replace(/,/g, "").split(" ").filter(Boolean);
            h.owner.last = parts[0] || ""; h.owner.first = parts.slice(1).join(" ");
          }
        });
      } else {
        set((h) => { h.property = { found: false }; });
      }
    } catch {}
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="disp font-bold uppercase text-sm text-slate-500 flex items-center gap-1"><Building2 size={15} /> Public records</div>
        <button onClick={lookup} disabled={busy} className="text-xs bg-slate-900 text-white rounded-full px-3 py-1.5 font-bold flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Pull records
        </button>
      </div>
      {needsKey && <p className="text-xs text-amber-700">No RentCast key set. Add <b>RENTCAST_API_KEY</b> in Vercel to auto-pull owner, year built, sale history, and rental status. Until then use the county link above.</p>}
      {p && p.found === false && <p className="text-xs text-slate-400">No record found for this address. Try adding city/state/zip and pull again.</p>}
      {p && p.found !== false && (
        <div className="text-sm space-y-1">
          {p.owner?.length > 0 && <Row k="Owner" v={p.owner.join(", ")} />}
          <Row k="Owner-occupied" v={p.ownerOccupied === false ? "No — likely a rental/investor" : p.ownerOccupied ? "Yes" : "—"} flag={p.ownerOccupied === false} />
          {p.yearBuilt && <Row k="Built" v={p.yearBuilt + (p.yearBuilt < 2005 ? " (older roof likely)" : "")} />}
          {p.lastSaleDate && <Row k="Last sold" v={`${String(p.lastSaleDate).slice(0,10)}${p.lastSalePrice ? " · $" + Number(p.lastSalePrice).toLocaleString() : ""}`} />}
          {(p.bedrooms || p.squareFootage) && <Row k="Home" v={[p.bedrooms && p.bedrooms+"bd", p.bathrooms && p.bathrooms+"ba", p.squareFootage && p.squareFootage.toLocaleString()+" sqft"].filter(Boolean).join(" · ")} />}
          {p.history?.length > 1 && (
            <div className="pt-1">
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Sale history</div>
              {p.history.slice(0, 4).map((h, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-600"><span>{String(h.date).slice(0,10)}</span><span>{h.price ? "$"+Number(h.price).toLocaleString() : h.event || ""}</span></div>
              ))}
            </div>
          )}
          {p.ownerOccupied === false && <p className="text-[11px] text-rose-600 font-medium pt-1">Heads up: not owner-occupied. A tenant can't authorize a roof — mark it <b>Renting</b> and move on.</p>}
        </div>
      )}
    </div>
  );
}
const Row = ({ k, v, flag }) => (
  <div className="flex justify-between gap-3">
    <span className="text-slate-400">{k}</span>
    <span className={`text-right font-medium ${flag ? "text-rose-600" : "text-slate-800"}`}>{v}</span>
  </div>
);

const Card = ({ title, action, children }) => (
  <div className="bg-white rounded-2xl shadow-sm p-3">
    <div className="flex items-center justify-between mb-2">
      <div className="disp font-bold uppercase text-sm text-slate-500">{title}</div>
      {action}
    </div>
    {children}
  </div>
);
const In = ({ v, ph, on }) => (
  <input value={v} placeholder={ph} onChange={(e) => on(e.target.value)}
    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500 w-full" />
);
const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 bg-slate-100 rounded-lg py-2 font-semibold text-slate-700">{children}<ExternalLink size={11} className="text-slate-400" /></a>
);

/* ---------- book ---------- */

function Book({ data, update }) {
  const day = nextWorkDay(new Date());
  const slots = useMemo(() => buildSlots(day), []);
  const candidates = data.houses.filter((h) => h.status === "lead");
  const [sel, setSel] = useState(candidates[0]?.id || "");

  const book = (slot) => {
    if (!sel) { alert("Pick a house first (log it as a Lead on the Doors tab)."); return; }
    const label = `${DAY_NAMES[day.getDay()].slice(0, 3)} ${day.getMonth() + 1}/${day.getDate()} · ${slot.label}`;
    // Booking attaches the appointment — it isn't a knock, so don't log one.
    update((d) => {
      const h = d.houses.find((x) => x.id === sel);
      h.appt = { dateISO: day.toISOString(), time: slot.label, label };
      h.status = "lead";
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-slate-900 text-white rounded-2xl p-4">
        <div className="disp text-lg font-extrabold uppercase">Next-day booking</div>
        <p className="text-sm text-slate-300 mt-1">Knocking today → booking <b className="text-amber-400">{DAY_NAMES[day.getDay()]} {day.getMonth() + 1}/{day.getDate()}</b>. A lead only counts (and only exports to RepCard) once it has a time on the calendar.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-3">
        <div className="disp font-bold uppercase text-sm text-slate-500 mb-2">Booking for</div>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-400">No leads yet — mark a door as <b>Lead</b> first.</p>
        ) : (
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm bg-white">
            {candidates.map((h) => <option key={h.id} value={h.id}>{h.address}{h.appt ? ` — booked ${h.appt.label}` : " — NO APPT YET"}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {slots.slice(0, 8).map((s, i) => (
          <button key={s.t} onClick={() => book(s)} className="knockbtn w-full bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3 text-left">
            <div className={`disp font-extrabold text-lg w-20 text-center rounded-xl py-2 ${i === 0 ? "bg-amber-500 text-white" : s.score >= 3 ? "bg-emerald-100 text-emerald-800" : s.score >= 0 ? "bg-slate-100 text-slate-700" : "bg-rose-50 text-rose-600"}`}>{s.label}</div>
            <div className="flex-1">
              {i === 0 && <div className="text-[11px] font-bold text-amber-600 uppercase">Best slot</div>}
              <div className="text-xs text-slate-500 leading-snug">{s.reasons.join(" · ")}</div>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
          </button>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 space-y-1">
        <p className="font-bold disp uppercase">At the door, say it like this:</p>
        <p>"I've got tomorrow at <b>{slots[0]?.label}</b> or <b>{slots[1]?.label}</b> — which is easier for both of you?" Two options, both yours, both wide-open windows. Then lock the spouse: "And you're both home then, not running out the door?"</p>
      </div>
    </div>
  );
}

/* ---------- scripts ---------- */

function Scripts() {
  const [open, setOpen] = useState(0);
  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-slate-500 px-1 pb-1">Tap a script. The <b>why it works</b> line under each one is the part to internalize — say it your way, not word-for-word. Drill any of these live on the Train tab.</p>
      {SCRIPTS.map((s, i) => (
        <div key={i} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full p-3 text-left flex items-center justify-between">
            <div>
              <div className="font-semibold text-[15px]">{s.title}</div>
              <div className="text-[11px] text-amber-600 font-bold uppercase">{s.tag}</div>
            </div>
            <ChevronRight size={16} className={`text-slate-300 transition-transform ${open === i ? "rotate-90" : ""}`} />
          </button>
          {open === i && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-sm leading-relaxed bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{s.body}</p>
              <p className="text-xs text-slate-500"><b className="text-slate-700">Why it works:</b> {s.why}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- stats + end-of-day export ---------- */

function Stats({ data }) {
  const [insight, setInsight] = useState("");
  const [busy, setBusy] = useState(false);
  const [quickFill, setQuickFill] = useState(null); // index into rows, or null
  const [exportMsg, setExportMsg] = useState("");
  const [allTime, setAllTime] = useState(false);

  const today = new Date();
  const { rows, leadsMissingAppt } = useMemo(() => buildExport(data.houses, allTime ? null : today), [data, allTime]);
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

  const knocks = data.houses.flatMap((h) => h.knocks);
  const todayKnocks = knocks.filter((k) => sameDay(k.ts, today));
  const total = knocks.length;
  const contacts = knocks.filter((k) => k.status !== "not_home").length;
  const appts = data.houses.filter((h) => h.appt).length;
  const byHour = {};
  knocks.forEach((k) => {
    const h = new Date(k.ts).getHours();
    byHour[h] = byHour[h] || { total: 0, contact: 0 };
    byHour[h].total++;
    if (k.status !== "not_home") byHour[h].contact++;
  });
  const bestHours = Object.entries(byHour).filter(([, v]) => v.total >= 3)
    .map(([h, v]) => ({ h, rate: v.contact / v.total, n: v.total }))
    .sort((a, b) => b.rate - a.rate).slice(0, 3);

  const doExport = async () => {
    if (rows.length === 0) { setExportMsg("Nothing to export — no dispositioned knocks " + (allTime ? "yet." : "today.")); return; }
    const name = `repcard-${allTime ? "all" : today.toISOString().slice(0, 10)}.csv`;
    const result = await shareOrDownloadCSV(toCSV(rows), name);
    if (result !== "cancelled") setExportMsg(result === "shared" ? "Sent to your share sheet." : `Downloaded ${name}. In RepCard: Contacts → Import → map the columns once.`);
  };

  const analyze = async () => {
    setBusy(true);
    try {
      const summary = data.houses.map((h) => ({
        street: h.address.replace(/^\d+\s*/, ""), status: h.status, damage: h.damage.length,
        knockTimes: h.knocks.map((k) => new Date(k.ts).toLocaleString([], { weekday: "short", hour: "numeric" })),
        notes: (h.notes || "").slice(0, 120),
      }));
      const out = await askClaude([{ role: "user", content: `I'm a door-to-door roofing appointment setter. Here's my knock log as JSON:\n${JSON.stringify(summary)}\nStats: ${total} knocks, ${contacts} contacts, ${appts} appointments. My dispositions are: not_home, not_int (not interested), renting, lead.\nFind patterns: best times/streets, what my notes suggest about objections I keep hitting, which not-homes to re-hit first tomorrow and at what hour, and one habit to change. Under 200 words, bullet-style, blunt and practical.` }],
        "You are a door-to-door sales analyst. Be specific and practical, not generic.");
      setInsight(out);
    } catch { setInsight("Couldn't run the analysis — try again."); }
    setBusy(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* ---- end of day export ---- */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="disp text-lg font-extrabold uppercase">End of day → RepCard</div>
          <button onClick={() => setAllTime(!allTime)} className="text-[11px] font-bold uppercase bg-white/10 rounded-full px-3 py-1">{allTime ? "All time" : "Today"}</button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {STATUSES.map((s) => (
            <div key={s.id} className="bg-white/10 rounded-xl py-2">
              <div className="disp text-xl font-extrabold">{counts[s.id] || 0}</div>
              <div className="text-[10px] uppercase font-bold text-slate-300">{s.short}</div>
            </div>
          ))}
        </div>
        {leadsMissingAppt.length > 0 && (
          <p className="text-xs text-amber-300 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {leadsMissingAppt.length} lead{leadsMissingAppt.length > 1 ? "s" : ""} without an appointment ({leadsMissingAppt.map((h) => h.address).join("; ")}) — book them or they won't export.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={doExport} className="knockbtn bg-amber-500 text-slate-900 rounded-xl py-3 disp font-extrabold uppercase text-sm flex items-center justify-center gap-1.5">
            <Share2 size={16} /> Export CSV
          </button>
          <button onClick={() => rows.length ? setQuickFill(0) : setExportMsg("Nothing to quick-fill yet.")} className="knockbtn bg-white text-slate-900 rounded-xl py-3 disp font-extrabold uppercase text-sm flex items-center justify-center gap-1.5">
            <ClipboardCopy size={16} /> Quick Fill
          </button>
        </div>
        {exportMsg && <p className="text-xs text-slate-300">{exportMsg}</p>}
        <p className="text-[11px] text-slate-400">Exports {allTime ? "every" : "today's"} Not home / Not interested / Renting knock — and Leads only once they have an appointment. Quick Fill gives you tap-to-copy fields for punching doors into the RepCard app one at a time.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat n={todayKnocks.length} l="Knocks today" />
        <Stat n={total ? Math.round((contacts / total) * 100) + "%" : "—"} l="Contact rate" />
        <Stat n={appts} l="Appts" />
      </div>

      {bestHours.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-3">
          <div className="disp font-bold uppercase text-sm text-slate-500 mb-2">Your hot hours (answer rate)</div>
          {bestHours.map((b) => (
            <div key={b.h} className="flex justify-between text-sm py-1">
              <span>{fmtHour(Number(b.h))}</span>
              <span className="font-bold text-emerald-600">{Math.round(b.rate * 100)}% <span className="text-slate-400 font-normal">({b.n} knocks)</span></span>
            </div>
          ))}
        </div>
      )}

      <button onClick={analyze} disabled={busy || total === 0} className="knockbtn w-full bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-center gap-2 disp font-extrabold uppercase disabled:opacity-40">
        <Sparkles size={18} className="text-amber-400" /> {busy ? "Analyzing…" : "Find my patterns"}
      </button>
      {insight && <div className="bg-white rounded-2xl shadow-sm p-4 text-sm whitespace-pre-wrap leading-relaxed">{insight}</div>}

      <ManagerReport data={data} />

      {quickFill !== null && <QuickFill rows={rows} startIndex={quickFill} close={() => setQuickFill(null)} />}
    </div>
  );
}

function ManagerReport({ data }) {
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);

  const gen = async () => {
    setBusy(true);
    const today = new Date();
    const todayHouses = data.houses.filter((h) => h.knocks.some((k) => sameDay(k.ts, today)));
    const knocks = todayHouses.flatMap((h) => h.knocks.filter((k) => sameDay(k.ts, today)));
    const appts = data.houses.filter((h) => h.appt);
    const stats = {
      doorsKnockedToday: todayHouses.length,
      knocksToday: knocks.length,
      contacts: knocks.filter((k) => k.status !== "not_home").length,
      byStatus: { notHome: todayHouses.filter((h) => h.status === "not_home").length, notInterested: todayHouses.filter((h) => h.status === "not_int").length, renting: todayHouses.filter((h) => h.status === "renting").length, leads: todayHouses.filter((h) => h.status === "lead").length },
      appointments: appts.map((h) => ({ address: h.address, when: h.appt?.label, owner: [h.owner.first, h.owner.last].filter(Boolean).join(" ") })),
    };
    try {
      const out = await askClaude(
        [{ role: "user", content: `Write my end-of-day report to my manager from this data: ${JSON.stringify(stats)}. Include: doors knocked, contact rate, dispositions breakdown, appointments set (with addresses and times), and a one-line plan for tomorrow. Keep it tight and professional.` }],
        "You write concise, professional daily field reports from a door-to-door setter to their sales manager. Clean, confident, no fluff.");
      setReport(out);
    } catch { setReport("Couldn't generate — try again."); }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <button onClick={gen} disabled={busy} className="knockbtn w-full bg-indigo-600 text-white rounded-2xl p-4 flex items-center justify-center gap-2 disp font-extrabold uppercase disabled:opacity-50">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} Report for my manager
      </button>
      {report && (
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{report}</p>
          <button onClick={() => navigator.clipboard?.writeText(report)} className="mt-2 text-xs bg-slate-100 rounded-full px-3 py-1.5 font-semibold text-slate-600">Copy</button>
        </div>
      )}
    </div>
  );
}

const Stat = ({ n, l }) => (
  <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
    <div className="disp text-2xl font-extrabold">{n}</div>
    <div className="text-[11px] text-slate-500 uppercase font-semibold">{l}</div>
  </div>
);
