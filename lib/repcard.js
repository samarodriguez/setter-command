// RepCard export: filter the day's knocks to the four dispositions
// (lead only when an appointment is set) and build the import CSV.
import { statusMeta, sameDay } from "./constants";

const EXPORTABLE = ["not_home", "not_int", "renting", "lead"];

// Houses knocked on `date` (or ever, when date is null), with the disposition to report.
// Leads without an appointment are returned separately so the UI can warn.
export function buildExport(houses, date) {
  const rows = [];
  const leadsMissingAppt = [];
  for (const h of houses) {
    const knocks = date ? h.knocks.filter((k) => sameDay(k.ts, date)) : h.knocks;
    if (knocks.length === 0) continue;
    const status = h.status || knocks[knocks.length - 1].status;
    if (!EXPORTABLE.includes(status)) continue;
    if (status === "lead" && !h.appt) { leadsMissingAppt.push(h); continue; }
    rows.push({ house: h, status, lastKnock: knocks[knocks.length - 1].ts, knockCount: knocks.length });
  }
  // Leads first — those are the rows you enter into RepCard with the most care.
  rows.sort((a, b) => (a.status === "lead" ? -1 : 0) - (b.status === "lead" ? -1 : 0) || b.lastKnock - a.lastKnock);
  return { rows, leadsMissingAppt };
}

export function rowNotes(r) {
  const h = r.house;
  const parts = [];
  if (h.appt) parts.push(`Appt: ${h.appt.label}`);
  if (h.damage?.length) parts.push(`Damage: ${h.damage.join("; ")}`);
  if (h.notes) parts.push(h.notes);
  return parts.join(" | ");
}

export function toCSV(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "First Name,Last Name,Phone,Email,Address,City,State,Zip,Status,Appointment Date,Appointment Time,Notes,Knocked At,Knocks";
  const lines = rows.map((r) => {
    const h = r.house;
    return [
      h.owner.first, h.owner.last, h.owner.phone, h.owner.email,
      h.address, h.city, h.state, h.zip,
      statusMeta(r.status).label,
      h.appt ? new Date(h.appt.dateISO).toLocaleDateString() : "",
      h.appt ? h.appt.time : "",
      rowNotes(r),
      new Date(r.lastKnock).toLocaleString(),
      r.knockCount,
    ].map(esc).join(",");
  });
  return [header, ...lines].join("\n");
}

// Share the CSV via the phone's share sheet when available; otherwise download it.
export async function shareOrDownloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const file = new File([blob], filename, { type: "text/csv" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  return "downloaded";
}
