// Vercel serverless function — proxies requests to OpenRouter.
// The API key is injected server-side and never exposed to the browser.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { model, messages } = req.body;

  if (!model || !messages) {
    return res.status(400).json({ error: "Missing model or messages" });
  }

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://nutritak.vercel.app",
        "X-Title": "NutriTak",
      },
      body: JSON.stringify({ model, messages }),
    });

    const data = await upstream.json();

    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("OpenRouter proxy error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
