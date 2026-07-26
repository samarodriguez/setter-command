"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Radar, Plus, Radio, Square, Loader2, MapPin } from "lucide-react";
import { getPosition, reverseGeocode, haversineMeters, statusFromDwell } from "../lib/geo";

const STATUS_COLOR = {
  "": "#94a3b8", not_home: "#64748b", callback: "#0ea5e9", talked: "#6366f1",
  appt: "#10b981", not_int: "#f59e0b", dnk: "#f43f5e",
};
function pin(color, me) {
  const size = me ? 18 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size],
  });
}

function ClickCatcher({ onClick }) {
  useMapEvents({ click(e) { onClick(e.latlng); } });
  return null;
}
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, Math.max(map.getZoom(), 17)); }, [center]);
  return null;
}

export default function MapTab({ data, update, onOpen, statuses }) {
  const [center, setCenter] = useState(null);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [areaMode, setAreaMode] = useState(false);
  const [area, setArea] = useState(null); // {center, radius}
  const [areaResult, setAreaResult] = useState("");
  const [live, setLive] = useState(false);
  const [nearest, setNearest] = useState(null);
  const [dwell, setDwell] = useState(0);
  const watchRef = useRef(null);
  const enterRef = useRef(null);

  const doors = data.houses.filter((h) => h.lat && h.lng);
  const fallback = [32.7157, -117.1611]; // San Diego default until GPS

  useEffect(() => {
    getPosition().then((p) => { setCenter([p.lat, p.lng]); setMe([p.lat, p.lng]); }).catch(() => setCenter(fallback));
  }, []);

  const locate = async () => {
    setBusy(true);
    try { const p = await getPosition(); setCenter([p.lat, p.lng]); setMe([p.lat, p.lng]); }
    catch { alert("Couldn't get GPS. Allow location access in your browser."); }
    setBusy(false);
  };

  // Tap map to drop a door at that exact point, reverse-geocoded.
  const handleClick = async (latlng) => {
    if (areaMode) {
      setArea({ center: [latlng.lat, latlng.lng], radius: area?.radius || 300 });
      return;
    }
    setBusy(true);
    const g = await reverseGeocode(latlng.lat, latlng.lng);
    const id = Math.random().toString(36).slice(2, 10);
    update((d) => d.houses.unshift({
      id, address: g || `Dropped pin`, lat: latlng.lat, lng: latlng.lng,
      city: "", state: "", zip: "", owner: { first: "", last: "", phone: "", email: "" },
      status: "", notes: "", damage: [], knocks: [], appt: null, property: null, createdAt: Date.now(),
    }));
    setBusy(false);
    onOpen(id);
  };

  // Live knock: watch GPS, find nearest door, time the doorstep visit.
  useEffect(() => {
    if (!live) {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null; enterRef.current = null; setNearest(null); setDwell(0);
      return;
    }
    if (!navigator.geolocation) { alert("No GPS on this device."); setLive(false); return; }
    watchRef.current = navigator.geolocation.watchPosition((pos) => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMe([here.lat, here.lng]);
      let best = null, bestD = Infinity;
      for (const h of doors) {
        const d = haversineMeters(here, { lat: h.lat, lng: h.lng });
        if (d < bestD) { bestD = d; best = h; }
      }
      if (best && bestD <= 30) {
        if (!enterRef.current || enterRef.current.id !== best.id) {
          enterRef.current = { id: best.id, t: Date.now() };
        }
        setNearest({ house: best, dist: Math.round(bestD) });
        setDwell(Math.round((Date.now() - enterRef.current.t) / 1000));
      } else {
        // left the door — if we were on one long enough, suggest a status
        if (enterRef.current) {
          const secs = Math.round((Date.now() - enterRef.current.t) / 1000);
          const prev = doors.find((h) => h.id === enterRef.current.id);
          if (prev && secs >= 5 && !prev.status) {
            const sug = statusFromDwell(secs);
            update((d) => {
              const x = d.houses.find((y) => y.id === prev.id);
              if (x && !x.status) { x.status = sug.id; x.knocks.push({ ts: Date.now(), status: sug.id, dwell: secs, auto: true }); }
            });
          }
          enterRef.current = null;
        }
        setNearest(null); setDwell(0);
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [live, data.houses.length]);

  const analyzeArea = async () => {
    if (!area) return;
    setBusy(true); setAreaResult("");
    const [lat, lng] = area.center;
    const radiusMi = (area.radius / 1609).toFixed(2);
    let rentalsTxt = "Rental scan needs a RentCast key (see Settings).";
    try {
      const r = await fetch("/api/property", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rentalsInArea", lat, lng, radius: radiusMi }),
      });
      const d = await r.json();
      if (d.needsKey) rentalsTxt = "No RentCast key set — add RENTCAST_API_KEY to pull live rentals. Skipping owners this pass.";
      else if (d.rentals) rentalsTxt = d.rentals.length
        ? `${d.rentals.length} active rental listings in this radius (skip or deprioritize — renters can't authorize a roof): ${d.rentals.slice(0, 8).map((x) => x.address).join("; ")}`
        : "No active rental listings found in this radius — mostly owner-occupied, good knocking.";
    } catch {}
    const inArea = doors.filter((h) => haversineMeters({ lat, lng }, { lat: h.lat, lng: h.lng }) <= area.radius);
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You are a door-to-door canvassing strategist for storm-damage roofing. Be specific and tactical.",
          messages: [{ role: "user", content: `Plan a knock route for this area. Center ~${lat.toFixed(4)},${lng.toFixed(4)}, radius ${radiusMi} miles. I already have ${inArea.length} pins here. Rental intel: ${rentalsTxt}. Give: 1) knock order logic for this block, 2) which homes to prioritize/skip and why, 3) the best opener for this area, 4) a one-paragraph summary I can paste to my manager. Under 200 words.` }],
        }),
      });
      const j = await res.json();
      const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      setAreaResult(txt + "\n\n— Rentals: " + rentalsTxt);
    } catch { setAreaResult("Couldn't reach AI. Rentals: " + rentalsTxt); }
    setBusy(false);
  };

  if (!center) return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" /> Getting your location…</div>;

  return (
    <div className="relative">
      <div style={{ height: "calc(100vh - 195px)" }}>
        <MapContainer center={center} zoom={17} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap' />
          <Recenter center={center} />
          <ClickCatcher onClick={handleClick} />
          {me && <Marker position={me} icon={pin("#2563eb", true)} />}
          {doors.map((h) => (
            <Marker key={h.id} position={[h.lat, h.lng]} icon={pin(STATUS_COLOR[h.status] || "#94a3b8")}
              eventHandlers={{ click: () => onOpen(h.id) }} />
          ))}
          {area && <Circle center={area.center} radius={area.radius} pathOptions={{ color: "#f59e0b", fillOpacity: 0.08 }} />}
        </MapContainer>
      </div>

      {/* map controls */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button onClick={locate} className="bg-white shadow-md rounded-xl p-2.5 text-slate-700">{busy ? <Loader2 size={20} className="animate-spin" /> : <Crosshair size={20} />}</button>
        <button onClick={() => { setAreaMode(!areaMode); if (areaMode) setArea(null); }} className={`shadow-md rounded-xl p-2.5 ${areaMode ? "bg-amber-500 text-white" : "bg-white text-slate-700"}`}><Square size={20} /></button>
        <button onClick={() => setLive(!live)} className={`shadow-md rounded-xl p-2.5 ${live ? "bg-rose-500 text-white animate-pulse" : "bg-white text-slate-700"}`}><Radio size={20} /></button>
      </div>

      <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur rounded-xl px-3 py-1.5 text-xs text-slate-600 shadow">
        {areaMode ? "Tap map to set area center" : "Tap map to drop a door"}
      </div>

      {/* live knock hud */}
      {live && (
        <div className="absolute bottom-3 inset-x-3 z-[1000] bg-slate-900 text-white rounded-2xl p-3 shadow-lg">
          {nearest ? (
            <div>
              <div className="text-xs text-slate-300">On doorstep · {nearest.dist}m away</div>
              <div className="font-semibold">{nearest.house.address}</div>
              <div className="disp text-3xl font-extrabold text-amber-400">{dwell}s <span className="text-sm text-slate-400 font-normal">{statusFromDwell(dwell).conf}</span></div>
            </div>
          ) : <div className="text-sm text-slate-300 flex items-center gap-2"><Radar size={16} className="text-rose-400" /> Live tracking on — walk up to a pinned door and it auto-times you.</div>}
        </div>
      )}

      {/* area panel */}
      {area && !live && (
        <div className="absolute bottom-3 inset-x-3 z-[1000] bg-white rounded-2xl p-3 shadow-lg max-h-[45vh] overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-amber-500" />
            <input type="range" min="100" max="1000" step="50" value={area.radius}
              onChange={(e) => setArea({ ...area, radius: Number(e.target.value) })} className="flex-1" />
            <span className="text-xs w-20 text-right">{(area.radius / 1609).toFixed(2)} mi</span>
          </div>
          <button onClick={analyzeArea} disabled={busy} className="w-full bg-slate-900 text-white rounded-xl py-2.5 disp font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} className="text-amber-400" />} Plan this area
          </button>
          {areaResult && <p className="text-xs mt-2 whitespace-pre-wrap leading-relaxed">{areaResult}</p>}
        </div>
      )}
    </div>
  );
}
