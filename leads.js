/**
 * /api/leads — server-side proxy to the Google Sheets backend.
 *
 * Why this exists: without it, the Apps Script URL and token would have to sit
 * in client-side JavaScript, where anyone viewing source could read every
 * customer record. Here they live in Vercel environment variables instead.
 *
 *   POST { action: "create", lead }   public   — the homeowner request form
 *   POST { action: "update"|"bulk" }  passcode — the CRM
 *   GET  ?key=PASSCODE                passcode — read the lead list
 *
 * Reading is gated because the list contains names, phone numbers and home
 * addresses. Creating is open because a homeowner filling in the form has no
 * passcode; it is validated and length-capped instead.
 */

const UPSTREAM = process.env.SHEETS_WEBAPP_URL;
const TOKEN    = process.env.SHEETS_TOKEN;
const PASSCODE = process.env.CRM_PASSCODE;

const MAX = { name: 120, phone: 40, address: 200, email: 160, notes: 2000, damage: 400 };

function clean(lead) {
  const out = {};
  for (const k of Object.keys(lead || {})) {
    let v = lead[k];
    if (typeof v === 'string') v = v.slice(0, MAX[k] || 500).trim();
    out[k] = v;
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!UPSTREAM || !TOKEN) {
    return res.status(501).json({
      ok: false,
      error: 'Backend not configured. Add SHEETS_WEBAPP_URL and SHEETS_TOKEN in ' +
             'Vercel -> Settings -> Environment Variables, then redeploy.'
    });
  }

  const key =
    (req.query && req.query.key) ||
    req.headers['x-crm-key'] ||
    '';
  const authed = Boolean(PASSCODE) && key === PASSCODE;

  try {
    if (req.method === 'GET') {
      if (!authed) {
        return res.status(401).json({
          ok: false,
          error: PASSCODE
            ? 'Wrong passcode.'
            : 'CRM_PASSCODE is not set on the server, so reading leads is disabled.'
        });
      }
      const r = await fetch(UPSTREAM + '?token=' + encodeURIComponent(TOKEN), { redirect: 'follow' });
      const j = await r.json();
      return res.status(200).json(j);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body || {};
      const action = body.action || 'create';

      if (action !== 'create' && !authed) {
        return res.status(401).json({ ok: false, error: 'Passcode required to change leads.' });
      }

      if (action === 'create') {
        const lead = clean(body.lead || {});
        if (lead.website) return res.status(200).json({ ok: true, id: 'ignored' }); // honeypot
        const phone = String(lead.phone || '').replace(/\D/g, '');
        if (!lead.name || phone.length < 10) {
          return res.status(400).json({ ok: false, error: 'A name and a full phone number are required.' });
        }
        body.lead = lead;
      }

      const r = await fetch(UPSTREAM, {
        method: 'POST',
        redirect: 'follow',
        // text/plain keeps this a "simple" request; Apps Script cannot answer a CORS preflight.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, body, { token: TOKEN }))
      });
      const j = await r.json();
      return res.status(200).json(j);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'Upstream sheet unreachable: ' + err.message });
  }
};
