// Shared constants: RepCard-style dispositions, schedule, formatting helpers.
import { Home, UserX, KeyRound, Star } from "lucide-react";

// The four dispositions used in the field and in RepCard exports.
// Lead is only exported when an appointment is attached.
export const STATUSES = [
  { id: "not_home", label: "Not home", short: "NH", icon: Home, cls: "bg-slate-200 text-slate-700", btn: "bg-slate-600 text-white" },
  { id: "not_int", label: "Not interested", short: "NI", icon: UserX, cls: "bg-amber-100 text-amber-800", btn: "bg-amber-500 text-white" },
  { id: "renting", label: "Renting", short: "RENT", icon: KeyRound, cls: "bg-violet-100 text-violet-800", btn: "bg-violet-500 text-white" },
  { id: "lead", label: "Lead", short: "LEAD", icon: Star, cls: "bg-emerald-100 text-emerald-800", btn: "bg-emerald-500 text-white" },
];

export const statusMeta = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export const STATUS_COLOR = {
  "": "#94a3b8",
  not_home: "#64748b",
  not_int: "#f59e0b",
  renting: "#8b5cf6",
  lead: "#10b981",
};

// Booking hours: 0=Sun … 6=Sat, 24h clock. null = day off.
export const HOURS = { 0: null, 1: [10, 17], 2: [13, 19], 3: [10, 19], 4: [10, 19], 5: [10, 18], 6: [10, 17] };
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fmtHour(h) {
  const hr = Math.floor(h), min = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:${min === 0 ? "00" : min} ${ampm}`;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function sameDay(ts, date) {
  const a = new Date(ts), b = date;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export async function askClaude(messages, system, opts = {}) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, ...opts }),
  });
  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : "API error");
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
