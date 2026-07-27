"use client";
import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Crosshair, Radar, Radio, Square, Loader2, MapPin, Layers,
  Navigation, X, ChevronDown, ChevronUp, ExternalLink, Check
} from "lucide-react";
import { getPosition, reverseGeocode, haversineMeters, statusFromDwell } from "../lib/geo";
import { STATUS_COLOR } from "../lib/constants";

function pin(color, me) {
  const size = me ? 18 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size],
  });
}
function numberedPin(n, color, active) {
  const size = active ? 32 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${active ? "#f59e0b" : color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${active ? 15 : 12}px;font-family:system-ui">${n}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

const fmtDist = (m) => m < 300 ? `${Math.round(m / 3.048) * 10} ft` : `${(m / 1609).toFixed(1)} mi`;
const fmtDur = (s) => s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;

function stepText(s) {
  const on = s.name ? ` onto ${s.name}` : "";
  const along = s.name ? ` on ${s.name}` : "";
  switch (s.type) {
    case "depart": return `Head out${along}`;
    case "arrive": return "Arrive at the door";
    case "turn": case "end of road": case "fork": return `Turn ${s.modifier || ""}${on}`;
    case "continue": case "new name": return `Continue${along}`;
    case "roundabout": case "rotary": return `Take the roundabout${on}`;
    default: return `${s.modifier ? s.modifier[0].toUpperCase() + s.modifier.slice(1) : "Continue"}${on || along}`;
  }
}

function ClickCatcher({ onClick }) {
  useMapEvents({ click(e) { onClick(e.latlng); } });
  return null;
}
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, Math.max(map.getZoom(), 18)); }, [center]);
  return null;
}

export default function MapTab({ data, update, onOpen }) {
  const [center, setCenter] = useState(null);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sat, setSat] = useState(true);
  const [areaMode, setAreaMode] = useState(false);
  const [area, setArea] = useState(null);
  const [areaResult, setAreaResult] = useState("");
  const [live, setLive] = useState(false);
  const [nearest, setNearest] = useState(null);
  const [dwell, setDwell] = useState(0);
  const [route, setRoute] = useState(null); // {stops:[houseId], legs, geometry, distance, duration}
  const [routeIdx, setRouteIdx] = useState(0);
  const [routeErr, setRouteErr] = useState("");
  const [openSteps, setOpenSteps] = useState(null);
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
      status: "", notes: "", damage: [], knocks: [], appt: null, property: null,
      texts: [], followUpAt: null, createdAt: Date.now(),
    }));
    setBusy(false);
    onOpen(id);
  };

  /* ---- knock route + directions ---- */

  const planRoute = async () => {
    if (route) { setRoute(null); setRouteErr(""); return; }
    // Doors worth walking to: never dispositioned, or not-home re-hits.
    let targets = doors.filter((h) => !h.status || h.status === "not_home");
    if (targets.length === 0) targets = doors;
    if (targets.length < 1) { setRouteErr("Drop some doors on the map first."); return; }
    setBusy(true); setRouteErr("");
    try {
      let start = me;
      if (!start) { try { const p = await getPosition(); start = [p.lat, p.lng]; setMe(start); } catch { start = center; } }
      // Nearest-neighbor order from wherever you're standing.
      const remaining = [...targets];
      const ordered = [];
      let cur = { lat: start[0], lng: start[1] };
      while (remaining.length) {
        let bi = 0, bd = Infinity;
        remaining.forEach((h, idx) => {
          const d = haversineMeters(cur, { lat: h.lat, lng: h.lng });
          if (d < bd) { bd = d; bi = idx; }
        });
        const next = remaining.splice(bi, 1)[0];
        ordered.push(next);
        cur = { lat: next.lat, lng: next.lng };
      }
      const capped = ordered.slice(0, 50);
      const coords = [start, ...capped.map((h) => [h.lat, h.lng])];
      const r = await fetch("/api/directions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords, profile: "foot" }),
      });
      const d = await r.json();
      if (d.error) { setRouteErr("Routing failed — " + d.error); setBusy(false); return; }
      setRoute({ stops: capped.map((h) => h.id), legs: d.legs, geometry: d.geometry, distance: d.distance, duration: d.duration });
      setRouteIdx(0); setOpenSteps(0); setArea(null); setAreaMode(false);
    } catch (e) { setRouteErr("Routing failed — check your connection."); }
    setBusy(false);
  };

  const routeHouses = route ? route.stops.map((id) => data.houses.find((h) => h.id === id)).filter(Boolean) : [];
  const gmapsStop = (h) => `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}&travelmode=walking`;
  const gmapsFull = () => {
    if (!routeHouses.length) return "#";
    const dest = routeHouses[routeHouses.length - 1];
    const way = routeHouses.slice(0, -1).slice(0, 9).map((h) => `${h.lat},${h.lng}`).join("|");
    return `https://www.google.com/maps/dir/?api=1${me ? `&origin=${me[0]},${me[1]}` : ""}&destination=${dest.lat},${dest.lng}${way ? `&waypoints=${encodeURIComponent(way)}` : ""}&travelmode=walking`;
  };

  /* ---- live knock: watch GPS, find nearest door, time the doorstep visit ---- */
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
        if (enterRef.current) {
          const secs = Math.round((Date.now() - enterRef.current.t) / 1000);
          const prev = doors.find((h) => h.id === enterRef.current.id);
          if (prev && secs >= 5 && !prev.status) {
            const sug = statusFromDwell(secs);
            // Only auto-log the unambiguous case (short dwell = not home);
            // if someone answered, the rep picks NI / Renting / Lead themselves.
            if (sug.id) {
              update((d) => {
                const x = d.houses.find((y) => y.id === prev.id);
                if (x && !x.status) { x.status = sug.id; x.knocks.push({ ts: Date.now(), status: sug.id, dwell: secs, auto: true }); }
              });
            }
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
    let rentalsTxt = "Rental scan needs a RentCast key.";
    try {
      const r = await fetch("/api/property", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rentalsInArea", lat, lng, radius: radiusMi }),
      });
      const d = await r.json();
      if (d.needsKey) rentalsTxt = "No RentCast key set — add RENTCAST_API_KEY to pull live rentals. Skipping owners this pass.";
      else if (d.rentals) rentalsTxt = d.rentals.length
        ? `${d.rentals.length} active rental listings in this radius (skip or deprioritize — renters can't authorize exterior work): ${d.rentals.slice(0, 8).map((x) => x.address).join("; ")}`
        : "No active rental listings found in this radius — mostly owner-occupied, good knocking.";
    } catch {}
    const inArea = doors.filter((h) => haversineMeters({ lat, lng }, { lat: h.lat, lng: h.lng }) <= area.radius);
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You are a door-to-door canvassing strategist for a retail exterior home-improvement company (stucco, exterior paint, woodwork/eaves/fascia, roofing, turf). No insurance claims — homeowners pay directly. Be specific and tactical.",
          messages: [{ role: "user", content: `Plan a knock route for this area. Center ~${lat.toFixed(4)},${lng.toFixed(4)}, radius ${radiusMi} miles. I already have ${inArea.length} pins here. Rental intel: ${rentalsTxt}. Give: 1) knock order logic for this block, 2) which homes to prioritize/skip and why (visible exterior wear = priority), 3) the best opener for this area, 4) a one-paragraph summary I can paste to my manager. Under 200 words.` }],
        }),
      });
      const j = await res.json();
      const txt = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      setAreaResult(txt + "\n\n— Rentals: " + rentalsTxt);
    } catch { setAreaResult("Couldn't reach AI. Rentals: " + rentalsTxt); }
    setBusy(false);
  };

  if (!center) return <div className="p-10 text-center text-slate-400"><Loader2 className="animate-spin mx-auto" /> Getting your location…</div>;

  const stopNumber = (id) => route ? route.stops.indexOf(id) : -1;

  return (
    <div className="relative">
      <div style={{ height: "calc(100vh - 195px)" }}>
        <MapContainer center={center} zoom={18} maxZoom={20} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          {sat ? (
            <TileLayer key="sat" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20} maxNativeZoom={19} attribution="Imagery &copy; Esri" />
          ) : (
            <TileLayer key="osm" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} maxNativeZoom={19}
              attribution='&copy; OpenStreetMap' />
          )}
          <Recenter center={center} />
          <ClickCatcher onClick={handleClick} />
          {route && <Polyline positions={route.geometry} pathOptions={{ color: "#f59e0b", weight: 5, opacity: 0.85 }} />}
          {me && <Marker position={me} icon={pin("#2563eb", true)} zIndexOffset={500} />}
          {doors.map((h) => {
            const n = stopNumber(h.id);
            return (
              <Marker key={h.id} position={[h.lat, h.lng]}
                icon={n >= 0 ? numberedPin(n + 1, STATUS_COLOR[h.status] || "#0f172a", n === routeIdx) : pin(STATUS_COLOR[h.status] || "#94a3b8")}
                eventHandlers={{ click: () => onOpen(h.id) }} />
            );
          })}
          {area && <Circle center={area.center} radius={area.radius} pathOptions={{ color: "#f59e0b", fillOpacity: 0.08 }} />}
        </MapContainer>
      </div>

      {/* map controls */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button onClick={locate} className="bg-white shadow-md rounded-xl p-2.5 text-slate-700">{busy ? <Loader2 size={20} className="animate-spin" /> : <Crosshair size={20} />}</button>
        <button onClick={() => setSat(!sat)} className={`shadow-md rounded-xl p-2.5 ${sat ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}><Layers size={20} /></button>
        <button onClick={planRoute} className={`shadow-md rounded-xl p-2.5 ${route ? "bg-amber-500 text-white" : "bg-white text-slate-700"}`}><Navigation size={20} /></button>
        <button onClick={() => { setAreaMode(!areaMode); if (areaMode) setArea(null); }} className={`shadow-md rounded-xl p-2.5 ${areaMode ? "bg-amber-500 text-white" : "bg-white text-slate-700"}`}><Square size={20} /></button>
        <button onClick={() => setLive(!live)} className={`shadow-md rounded-xl p-2.5 ${live ? "bg-rose-500 text-white animate-pulse" : "bg-white text-slate-700"}`}><Radio size={20} /></button>
      </div>

      <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur rounded-xl px-3 py-1.5 text-xs text-slate-600 shadow">
        {areaMode ? "Tap map to set area center" : route ? `Knock route · ${routeHouses.length} stops` : "Tap a house to drop a door"}
      </div>
      {routeErr && <div className="absolute top-12 left-3 z-[1000] bg-rose-600 text-white rounded-xl px-3 py-1.5 text-xs shadow">{routeErr}</div>}

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

      {/* route directions panel */}
      {route && !live && (
        <div className="absolute bottom-3 inset-x-3 z-[1000] bg-white rounded-2xl shadow-lg max-h-[48vh] overflow-y-auto">
          <div className="sticky top-0 bg-slate-900 text-white rounded-t-2xl px-3 py-2 flex items-center justify-between">
            <div>
              <div className="disp font-extrabold uppercase text-sm">Knock route</div>
              <div className="text-[11px] text-slate-300">{routeHouses.length} stops · {fmtDist(route.distance)} · ~{fmtDur(route.duration)} walking</div>
            </div>
            <div className="flex items-center gap-1.5">
              <a href={gmapsFull()} target="_blank" rel="noreferrer" className="text-[11px] bg-white/15 rounded-full px-2.5 py-1 font-bold flex items-center gap-1">Google Maps <ExternalLink size={11} /></a>
              <button onClick={() => setRoute(null)} className="p-1.5 bg-white/15 rounded-full"><X size={14} /></button>
            </div>
          </div>
          <div className="p-2 space-y-1.5">
            {routeHouses.map((h, i) => {
              const leg = route.legs[i];
              const done = i < routeIdx;
              const activeStop = i === routeIdx;
              return (
                <div key={h.id} className={`rounded-xl border ${activeStop ? "border-amber-400 bg-amber-50" : done ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-100"}`}>
                  <div className="flex items-center gap-2 p-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-extrabold shrink-0 ${activeStop ? "bg-amber-500" : done ? "bg-emerald-500" : "bg-slate-800"}`}>{done ? <Check size={14} /> : i + 1}</div>
                    <button onClick={() => onOpen(h.id)} className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-semibold truncate">{h.address}</div>
                      {leg && <div className="text-[11px] text-slate-500">{fmtDist(leg.distance)} · {fmtDur(leg.duration)} walk</div>}
                    </button>
                    <a href={gmapsStop(h)} target="_blank" rel="noreferrer" className="text-[11px] bg-slate-900 text-white rounded-full px-2.5 py-1.5 font-bold shrink-0">Go</a>
                    <button onClick={() => setOpenSteps(openSteps === i ? null : i)} className="p-1.5 text-slate-400 shrink-0">{openSteps === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                  </div>
                  {openSteps === i && leg && (
                    <div className="px-3 pb-2 space-y-1">
                      {leg.steps.filter((s) => s.distance > 1 || s.type === "arrive").map((s, si) => (
                        <div key={si} className="flex justify-between text-xs text-slate-600 border-t border-slate-100 pt-1">
                          <span>{stepText(s)}</span>
                          {s.distance > 1 && <span className="text-slate-400 shrink-0 ml-2">{fmtDist(s.distance)}</span>}
                        </div>
                      ))}
                      {activeStop && (
                        <button onClick={() => { setRouteIdx(i + 1); setOpenSteps(i + 1 < routeHouses.length ? i + 1 : null); const nh = routeHouses[i]; onOpen(nh.id); }}
                          className="w-full mt-1 bg-emerald-500 text-white rounded-lg py-2 text-xs font-bold uppercase">Knocked it → next stop</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* area panel */}
      {area && !live && !route && (
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
