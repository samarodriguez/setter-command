import Anthropic from "@anthropic-ai/sdk";

// Single Claude proxy for the whole app. Callers may pass `effort`
// ("low" for snappy roleplay/text drafts) and `max_tokens`.
export async function POST(req) {
  const { messages, system, effort, max_tokens } = await req.json();
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Missing ANTHROPIC_API_KEY. Add it in Vercel → Settings → Environment Variables." }, { status: 500 });
  }
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: Math.min(max_tokens || 1024, 4096),
      system,
      messages,
      ...(effort ? { output_config: { effort } } : {}),
      // Safety classifiers can decline a request; fall back server-side so the
      // user gets an answer instead of an empty turn.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") {
      return Response.json({ content: [{ type: "text", text: "(That one got flagged — rephrase and try again.)" }] });
    }
    return Response.json({ content: response.content, stop_reason: response.stop_reason });
  } catch (e) {
    const msg = e?.error?.error?.message || e?.message || String(e);
    return Response.json({ error: msg }, { status: e?.status || 500 });
  }
}
