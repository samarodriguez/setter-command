export async function POST(req) {
  const { messages, system } = await req.json();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: "Missing ANTHROPIC_API_KEY. Add it in Vercel → Settings → Environment Variables." }, { status: 500 });
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages }),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
