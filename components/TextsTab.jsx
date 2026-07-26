"use client";
import React, { useState } from "react";
import { MessageSquare, Sparkles, Loader2, Send, Copy, Info } from "lucide-react";

const GOALS = [
  { id: "confirm", label: "Confirm tomorrow's appt" },
  { id: "reschedule", label: "They no-showed / reschedule" },
  { id: "warm", label: "Talked but didn't book — nudge" },
  { id: "callback", label: "Nobody home — left a card" },
  { id: "thanks", label: "After the inspection — thanks" },
];

export default function TextsTab({ data }) {
  const contacts = data.houses.filter((h) => h.owner?.phone);
  const [sel, setSel] = useState(contacts[0]?.id || "");
  const [goal, setGoal] = useState("confirm");
  const [voice, setVoice] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const house = contacts.find((h) => h.id === sel);

  const gen = async () => {
    if (!house) return;
    setBusy(true); setDrafts([]);
    const goalText = GOALS.find((g) => g.id === goal)?.label;
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `You write short, natural, human-sounding text messages for a door-to-door roofing appointment setter. They must read like a real person texted them from their phone — casual, warm, lowercase-ish, no corporate tone, no emojis unless natural, under 320 characters. NEVER sound like a mass text or a bot. ${voice ? "Match this rep's texting voice: " + voice : ""}`,
          messages: [{ role: "user", content: `Write 3 different text options. Recipient: ${house.owner.first || "the homeowner"} at ${house.address}. Goal: ${goalText}. ${house.appt ? "Their appointment is " + house.appt.label + "." : ""} ${house.notes ? "What I know about them: " + house.notes.slice(0, 200) : ""} Number each 1/2/3, message only, no labels.` }],
        }),
      });
      const j = await res.json();
      const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const parts = txt.split(/\n?\s*\d[\).]\s*/).map((s) => s.trim()).filter(Boolean);
      setDrafts(parts.length ? parts : [txt]);
    } catch { setDrafts(["Couldn't reach AI — try again."]); }
    setBusy(false);
  };

  const sendSms = (body) => {
    const num = house.owner.phone.replace(/[^\d+]/g, "");
    // Opens the phone's native Messages app with number + text prefilled.
    window.location.href = `sms:${num}?&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-slate-900 text-white rounded-2xl p-4">
        <div className="disp text-lg font-extrabold uppercase flex items-center gap-2"><MessageSquare size={18} className="text-amber-400" /> Texting CRM</div>
        <p className="text-sm text-slate-300 mt-1">AI writes texts that sound like you, then opens your Messages app with it prefilled — one tap to send.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex gap-2">
        <Info size={16} className="shrink-0 mt-0.5" />
        <span>Only text people who gave you their number and okay'd a text. Cold-texting strangers breaks the TCPA and can mean fines. This tool drafts + hands off to your phone; it never auto-sends.</span>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No saved numbers yet. Add a phone to a house on the Doors tab and it'll show up here.</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm p-3 space-y-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm bg-white">
              {contacts.map((h) => <option key={h.id} value={h.id}>{h.owner.first} {h.owner.last} — {h.address}</option>)}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <button key={g.id} onClick={() => setGoal(g.id)} className={`text-xs px-2.5 py-1.5 rounded-full ${goal === g.id ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}>{g.label}</button>
              ))}
            </div>
            <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="How you text (e.g. 'chill, lowercase, say hey & no problem')"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-500" />
            <button onClick={gen} disabled={busy} className="w-full bg-slate-900 text-white rounded-xl py-3 disp font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-amber-400" />} Write 3 in my voice
            </button>
          </div>

          {drafts.map((d, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm p-3">
              <p className="text-sm leading-relaxed">{d}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => sendSms(d)} className="flex-1 bg-emerald-500 text-white rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-1"><Send size={14} /> Open in Messages</button>
                <button onClick={() => navigator.clipboard?.writeText(d)} className="bg-slate-100 text-slate-600 rounded-lg px-3"><Copy size={16} /></button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
