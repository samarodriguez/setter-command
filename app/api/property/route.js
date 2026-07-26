// RentCast proxy. Real property records, owners, sale history, rent estimate,
// and active rental listings in an area. Needs RENTCAST_API_KEY (free tier: 50/mo).
// Without a key, returns { needsKey:true } so the UI falls back to deep links.
const BASE = "https://api.rentcast.io/v1";

async function rc(path, key) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

export async function POST(req) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return Response.json({ needsKey: true });
  const { action, address, lat, lng, radius } = await req.json();
  try {
    if (action === "record") {
      const { data } = await rc(`/properties?address=${encodeURIComponent(address)}`, key);
      const p = Array.isArray(data) ? data[0] : data;
      if (!p) return Response.json({ found: false });
      const owners = p.owner?.names || p.ownerName ? [].concat(p.owner?.names || p.ownerName) : [];
      const history = p.history ? Object.entries(p.history)
        .map(([date, h]) => ({ date, price: h.price, event: h.event }))
        .sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
      return Response.json({
        found: true,
        owner: owners,
        ownerOccupied: p.ownerOccupied,
        yearBuilt: p.yearBuilt,
        propertyType: p.propertyType,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms,
        squareFootage: p.squareFootage, lotSize: p.lotSize,
        lastSaleDate: p.lastSaleDate, lastSalePrice: p.lastSalePrice,
        assessedValue: p.taxAssessments ? Object.values(p.taxAssessments).slice(-1)[0]?.value : undefined,
        history,
        raw: undefined,
      });
    }
    if (action === "rent") {
      const { data } = await rc(`/avm/rent/long-term?address=${encodeURIComponent(address)}`, key);
      return Response.json({ rent: data?.rent, rentRangeLow: data?.rentRangeLow, rentRangeHigh: data?.rentRangeHigh });
    }
    if (action === "rentalsInArea") {
      const { data } = await rc(`/listings/rental/long-term?latitude=${lat}&longitude=${lng}&radius=${radius || 1}&status=Active&limit=100`, key);
      const list = (Array.isArray(data) ? data : []).map((x) => ({
        address: x.formattedAddress, price: x.price, beds: x.bedrooms, baths: x.bathrooms, lat: x.latitude, lng: x.longitude,
      }));
      return Response.json({ rentals: list });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
