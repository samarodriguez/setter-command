"use client";
// RepCard Quick Fill: tap-to-copy each field in the same order as RepCard's
// new-contact form, so you can paste-paste-paste through it on your phone.
import React, { useState } from "react";
import { X, Check, Copy, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { statusMeta } from "../lib/constants";
import { rowNotes } from "../lib/repcard";

export default function QuickFill({ rows, startIndex = 0, close }) {
  const [idx, setIdx] = useState(startIndex);
  const [copied, setCopied] = useState({});
  const row = rows[idx];
  if (!row) return null;
  const h = row.house;

  const fields = [
    { k: "First name", v: h.owner.first },
    { k: "Last name", v: h.owner.last },
    { k: "Phone", v: h.owner.phone },
    { k: "Email", v: h.owner.email },
    { k: "Street address", v: h.address },
    { k: "City", v: h.city },
    { k: "State", v: h.state },
    { k: "Zip", v: h.zip },
    { k: "Status", v: statusMeta(row.status).label },
    { k: "Notes", v: rowNotes(row) },
  ].filter((f) => f.v);

  const copy = async (f, i) => {
    try { await navigator.clipboard.writeText(String(f.v)); } catch {}
    setCopied((c) => ({ ...c, [i]: true }));
  };
  const go = (d) => { setIdx((i) => Math.max(0, Math.min(rows.length - 1, i + d))); setCopied({}); };
  const nextIdx = fields.findIndex((_, i) => !copied[i]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="disp font-extrabold uppercase text-amber-400 text-sm">RepCard Quick Fill · {idx + 1}/{rows.length}</div>
          <div className="font-semibold text-lg leading-tight">{h.address}</div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full ${statusMeta(row.status).cls}`}>{statusMeta(row.status).label}</span>
            {h.appt && <span className="text-emerald-400">📅 {h.appt.label}</span>}
          </div>
        </div>
        <button onClick={close} className="p-2 bg-white/10 rounded-full"><X size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        <p className="text-xs text-slate-400">Open RepCard side-by-side (or app-switch). Tap a row to copy it, paste into the matching field, come back, tap the next one.</p>
        {fields.map((f, i) => (
          <button key={f.k} onClick={() => copy(f, i)}
            className={`w-full text-left rounded-2xl p-3 flex items-center gap-3 transition-colors ${copied[i] ? "bg-emerald-600/25 border border-emerald-500/60" : i === nextIdx ? "bg-white/15 border border-amber-400/70" : "bg-white/5 border border-white/10"}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase font-bold text-slate-400">{f.k}</div>
              <div className="font-semibold truncate">{String(f.v)}</div>
            </div>
            {copied[i] ? <Check size={20} className="text-emerald-400 shrink-0" /> : <Copy size={18} className="text-slate-400 shrink-0" />}
          </button>
        ))}
        <button onClick={() => copy({ v: fields.map((f) => `${f.k}: ${f.v}`).join("\n") }, "all")}
          className="w-full rounded-2xl p-3 bg-amber-500 text-slate-900 font-bold disp uppercase flex items-center justify-center gap-2">
          {copied.all ? <Check size={18} /> : <Copy size={18} />} Copy everything as one block
        </button>
        {h.owner.phone && (
          <a href={`tel:${h.owner.phone}`} className="w-full rounded-2xl p-3 bg-white/10 font-semibold flex items-center justify-center gap-2">
            <Phone size={16} /> Call {h.owner.phone}
          </a>
        )}
      </div>

      <div className="flex gap-2 p-3 bg-black/30">
        <button onClick={() => go(-1)} disabled={idx === 0} className="flex-1 py-3 rounded-xl bg-white/10 disabled:opacity-30 flex items-center justify-center gap-1 font-bold"><ChevronLeft size={18} /> Prev</button>
        <button onClick={() => go(1)} disabled={idx === rows.length - 1} className="flex-1 py-3 rounded-xl bg-amber-500 text-slate-900 disabled:opacity-30 flex items-center justify-center gap-1 font-bold">Next door <ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
