// Geolocation + reverse geocoding + distance helpers (client-side)

export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("No geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
    const d = await r.json();
    return d.address || "";
  } catch { return ""; }
}

// Suggest a lead status from dwell time (seconds) at the door.
export function statusFromDwell(seconds) {
  if (seconds < 15) return { id: "not_home", conf: "Bounced fast — likely no answer." };
  if (seconds < 25) return { id: "not_home", conf: "Short stop — probably not home." };
  if (seconds < 90) return { id: "talked", conf: "Brief chat — quick conversation." };
  if (seconds < 240) return { id: "talked", conf: "Real conversation — good pitch length." };
  return { id: "appt", conf: "Long doorstep time — sit-down territory, likely an appointment." };
}
