"use client";
// Texting CRM that runs through YOUR phone: threads per contact, follow-up
// queue, templates + AI drafts. Sending always hands off to the native
// Messages app via an sms: link — nothing is auto-sent (TCPA-safe).
import React, { useState } from "react";
import {
  MessageSquare, Sparkles, Loader2, Send, Copy, Info, ChevronLeft,
  Phone, CalendarClock, Plus, X, ChevronRight, Reply
} from "lucide-react";
import { uid, askClaude, statusMeta } from "../lib/constants";

const GOALS = [
  { id: "confirm", label: "Confirm appt" },
  { id: "reschedule", label: "No-show / reschedule" },
  { id: "warm", label: "Didn't book — nudge" },
  { id: "callback", label: "Left a card" },
  { id: "thanks", label: "Post-inspection thanks" },
  { id: "reply", label: "Reply to their last text" },
];

const TEMPLATES = [
  { id: "confirm", label: "Confirm", make: (h, first) => `hey ${first}, it's the roof guy from earlier — still good for ${h.appt?.label || "our appointment"}? both of you gonna be home?` },
  { id: "onmyway", label: "On my way", make: (h, first) => `hey ${first}, heading your way now — see you in about 15` },
  { id: "nudge", label: "Nudge", make: (h, first) => `hey ${first}, crew's back on your street tomorrow. still want me to grab those roof photos? takes 15 min` },
  { id: "card", label: "Left card", make: (h, first) => `hey, this is the roofing inspector who left a card at ${h.address} — saw a couple things on the roofline worth a free look. tomorrow morning or afternoon work?` },
  { id: "thanks", label: "Thanks", make: (h, first) => `${first ? first + ", " : ""}thanks for letting us take a look today — photos are with the team and I'll text you as soon as I hear back` },
];

const fmtTs = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

export default function TextsTab({ data, update }) {
  const [openId, setOpenId] = useState(null);
  const contacts = data.houses.filter((h) => h.owner?.phone);
  const open = contacts.find((h) => h.id === openId);

  if (open) return <Thread house={open} update={update} back={() => setOpenId(null)} />;

  const lastTs = (h) => h.texts?.length ? h.texts[h.texts.length - 1].ts : 0;
  const due = contacts.filter((h) => h.followUpAt && h.followUpAt <= endOfToday()).sort((a, b) => a.followUpAt - b.followUpAt);
  const rest = contacts.filter((h) => !due.includes(h)).sort((a, b) => (lastTs(b) || b.createdAt) - (lastTs(a) || a.createdAt));

  return (
    <div className="p-4 space-y-4">
      <div className="bg-slate-900 text-white rounded-2xl p-4">
        <div className="disp text-lg font-extrabold uppercase flex items-center gap-2"><MessageSquare size={18} className="text-amber-400" /> Texting CRM</div>
        <p className="text-sm text-slate-300 mt-1">Every contact gets a thread. Drafts open in your phone's Messages app prefilled — one tap to send from your own number.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex gap-2">
        <Info size={16} className="shrink-0 mt-0.5" />
        <span>Only text people who gave you their number and okay'd a text. Cold-texting strangers breaks the TCPA. This tool drafts + hands off to your phone; it never auto-sends.</span>
      </div>

      {contacts.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">No saved numbers yet. Add a phone to a house on the Doors tab and it'll show up here.</p>
      )}

      {due.length > 0 && (
        <div>
          <div className="disp font-bold uppercase text-sm text-rose-600 mb-2">Follow-ups due ({due.length})</div>
          <div className="space-y-2">{due.map((h) => <ContactRow key={h.id} h={h} onOpen={setOpenId} due />)}</div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          <div className="disp font-bold uppercase text-sm text-slate-500 mb-2">All contacts</div>
          <div className="space-y-2">{rest.map((h) => <ContactRow key={h.id} h={h} onOpen={setOpenId} />)}</div>
        </div>
      )}
    </div>
  );
}

function ContactRow({ h, onOpen, due }) {
  const last = h.texts?.[h.texts.length - 1];
  const m = h.status ? statusMeta(h.status) : null;
  return (
    <button onClick={() => onOpen(h.id)} className={`w-full bg-white rounded-2xl shadow-sm p-3 text-left flex items-center gap-3 ${due ? "border border-rose-200" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] truncate">{[h.owner.first, h.owner.last].filter(Boolean).join(" ") || h.address}</div>
        <div className="text-xs text-slate-500 truncate">{h.address}</div>
        <div className="text-xs text-slate-400 truncate mt-0.5">
          {last ? <>{last.dir === "out" ? "You: " : "Them: "}{last.body}</> : "No texts logged yet"}
        </div>
        <div className="flex gap-1.5 mt-1">
          {m && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>}
          {h.appt && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">📅 {h.appt.label}</span>}
          {h.followUpAt && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${due ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>⏰ {new Date(h.followUpAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-300 shrink-0" />
    </button>
  );
}

function Thread({ house, update, back }) {
  const [draft, setDraft] = useState("");
  const [goal, setGoal] = useState("confirm");
  const [voice, setVoice] = useState("");
  const [aiDrafts, setAiDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [logging, setLogging] = useState(false);
  const [inbound, setInbound] = useState("");

  const set = (fn) => update((d) => fn(d.houses.find((x) => x.id === house.id)));
  const first = house.owner.first || "";
  const num = house.owner.phone.replace(/[^\d+]/g, "");

  const sendSms = (body) => {
    set((h) => { h.texts.push({ id: uid(), ts: Date.now(), dir: "out", body }); });
    setDraft(""); setAiDrafts([]);
    window.location.href = `sms:${num}?&body=${encodeURIComponent(body)}`;
  };

  const logInbound = () => {
    const b = inbound.trim();
    if (!b) return;
    set((h) => { h.texts.push({ id: uid(), ts: Date.now(), dir: "in", body: b }); });
    setInbound(""); setLogging(false);
  };

  const setFollowUp = (days) => set((h) => {
    if (days === null) { h.followUpAt = null; return; }
    const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0);
    h.followUpAt = d.getTime();
  });

  const gen = async () => {
    setBusy(true); setAiDrafts([]);
    const goalText = GOALS.find((g) => g.id === goal)?.label;
    const thread = (house.texts || []).slice(-8).map((t) => `${t.dir === "out" ? "ME" : "THEM"}: ${t.body}`).join("\n");
    try {
      const txt = await askClaude(
        [{ role: "user", content: `Write 3 different text options. Recipient: ${first || "the homeowner"} at ${house.address}. Goal: ${goalText}. ${house.appt ? "Their appointment is " + house.appt.label + "." : ""} ${house.notes ? "What I know about them: " + house.notes.slice(0, 200) + "." : ""} ${thread ? "Conversation so far:\n" + thread : ""} Output ONLY the 3 messages, separated by a line containing exactly three dashes (---). No numbering, no labels.` }],
        `You write short, natural, human-sounding text messages for a door-to-door roofing appointment setter. They must read like a real person texted them from their phone — casual, warm, lowercase-ish, no corporate tone, no emojis unless natural, under 320 characters. NEVER sound like a mass text or a bot. ${voice ? "Match this rep's texting voice: " + voice : ""}`,
        { effort: "low" });
      let parts = txt.split(/\n\s*-{3,}\s*\n?/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) parts = txt.split(/\n(?=\s*\d[\).\s])/).map((s) => s.replace(/^\s*\d[\).]?\s*/, "").trim()).filter(Boolean);
      setAiDrafts(parts.length ? parts : [txt]);
    } catch { setAiDrafts(["Couldn't reach AI — try again."]); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>
      <div className="px-4 py-2 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <button onClick={back} className="text-slate-500 flex items-center text-sm"><ChevronLeft size={18} /> Back</button>
          <div className="text-center">
            <div className="disp font-bold uppercase text-sm">{[house.owner.first, house.owner.last].filter(Boolean).join(" ") || house.address}</div>
            <div className="text-[11px] text-slate-400">{house.address}</div>
          </div>
          <a href={`tel:${num}`} className="p-2 bg-emerald-50 text-emerald-600 rounded-full"><Phone size={16} /></a>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto pb-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 shrink-0"><CalendarClock size={12} /> Follow up:</span>
          {[["Today", 0], ["Tmrw", 1], ["3 days", 3], ["Next wk", 7]].map(([l, d]) => (
            <button key={l} onClick={() => setFollowUp(d)} className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold whitespace-nowrap">{l}</button>
          ))}
          {house.followUpAt && <button onClick={() => setFollowUp(null)} className="text-[11px] px-2 py-1 rounded-full bg-rose-50 text-rose-600 font-semibold whitespace-nowrap flex items-center gap-0.5"><X size={11} /> {new Date(house.followUpAt).toLocaleDateString([], { month: "short", day: "numeric" })}</button>}
        </div>
      </div>

      {/* thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {(house.texts || []).length === 0 && <p className="text-center text-slate-400 text-sm mt-8">No messages logged yet. Texts you send from here get logged automatically; tap "Log their reply" when they answer.</p>}
        {(house.texts || []).map((t) => (
          <div key={t.id} className={`max-w-[85%] ${t.dir === "out" ? "ml-auto" : ""}`}>
            <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${t.dir === "out" ? "bg-emerald-500 text-white" : "bg-white shadow-sm"}`}>{t.body}</div>
            <div className={`text-[10px] text-slate-400 mt-0.5 ${t.dir === "out" ? "text-right" : ""}`}>{fmtTs(t.ts)}</div>
          </div>
        ))}

        {aiDrafts.map((d, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm p-3 border border-amber-200">
            <p className="text-sm leading-relaxed">{d}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => sendSms(d)} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-1"><Send size={14} /> Open in Messages</button>
              <button onClick={() => setDraft(d)} className="bg-slate-100 text-slate-600 rounded-lg px-3 text-xs font-semibold">Edit</button>
              <button onClick={() => navigator.clipboard?.writeText(d)} className="bg-slate-100 text-slate-600 rounded-lg px-3"><Copy size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* composer */}
      <div className="bg-white border-t border-slate-200 p-3 space-y-2">
        {logging ? (
          <div className="flex gap-2">
            <input value={inbound} onChange={(e) => setInbound(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logInbound()} autoFocus
              placeholder="Paste / type what they replied…" className="flex-1 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5 text-sm outline-none" />
            <button onClick={logInbound} className="rounded-xl bg-sky-500 text-white px-3 text-sm font-bold">Log</button>
            <button onClick={() => setLogging(false)} className="rounded-xl bg-slate-100 text-slate-500 px-2"><X size={16} /></button>
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button onClick={() => setLogging(true)} className="text-[11px] px-2.5 py-1.5 rounded-full bg-sky-100 text-sky-700 font-semibold whitespace-nowrap flex items-center gap-1"><Reply size={12} /> Log their reply</button>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => setDraft(t.make(house, first || "there"))} className="text-[11px] px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 font-semibold whitespace-nowrap">{t.label}</button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 items-center">
          {GOALS.map((g) => (
            <button key={g.id} onClick={() => setGoal(g.id)} className={`text-[11px] px-2 py-1 rounded-full ${goal === g.id ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}>{g.label}</button>
          ))}
          <button onClick={gen} disabled={busy} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-900 text-white font-bold flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-amber-400" />} AI ×3
          </button>
        </div>
        <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="How you text (e.g. 'chill, lowercase, say hey & no problem')"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-amber-500" />

        <div className="flex gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Type a text…"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 resize-none" />
          <button onClick={() => draft.trim() && sendSms(draft.trim())} disabled={!draft.trim()}
            className="knockbtn rounded-xl bg-emerald-500 text-white px-4 disabled:opacity-40"><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
}
