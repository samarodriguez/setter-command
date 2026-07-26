// Reverse geocode via OpenStreetMap Nominatim (free, no key).
// Server-side so we can set a User-Agent per Nominatim policy.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) return Response.json({ error: "lat/lon required" }, { status: 400 });
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`,
      { headers: { "User-Agent": "SetterCommand/1.0 (door-knock field app)" } }
    );
    const d = await r.json();
    const a = d.address || {};
    const line1 = [a.house_number, a.road].filter(Boolean).join(" ");
    const address = line1 || d.display_name?.split(",")[0] || "";
    return Response.json({
      address,
      city: a.city || a.town || a.village || a.hamlet || "",
      state: a.state || "",
      zip: a.postcode || "",
      display: d.display_name || "",
    });
  } catch (e) {
    return Response.json({ error: "geocode failed" }, { status: 500 });
  }
}
