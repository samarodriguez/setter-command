// Walking/driving directions proxy (OSRM via the free FOSSGIS servers) so the
// browser avoids CORS and we can swap providers later without touching the UI.
const SERVERS = { foot: "routed-foot", car: "routed-car", bike: "routed-bike" };

export async function POST(req) {
  try {
    const { coords, profile } = await req.json(); // coords: [[lat,lng], ...]
    if (!Array.isArray(coords) || coords.length < 2 || coords.length > 60) {
      return Response.json({ error: "Need 2-60 coordinates" }, { status: 400 });
    }
    const server = SERVERS[profile] || SERVERS.foot;
    const path = coords.map(([lat, lng]) => `${lng},${lat}`).join(";");
    const url = `https://routing.openstreetmap.de/${server}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true&alternatives=false`;
    const r = await fetch(url, { headers: { "User-Agent": "setter-command-app" } });
    const data = await r.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      return Response.json({ error: data.message || "No route found" }, { status: 502 });
    }
    const route = data.routes[0];
    return Response.json({
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
      legs: route.legs.map((leg) => ({
        distance: leg.distance,
        duration: leg.duration,
        steps: (leg.steps || []).map((s) => ({
          type: s.maneuver?.type,
          modifier: s.maneuver?.modifier,
          name: s.name || "",
          distance: s.distance,
        })),
      })),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
