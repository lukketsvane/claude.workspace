export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const token = process.env.AI_GATEWAY_API_KEY
      || process.env.VERCEL_OIDC_TOKEN
      || String(req.headers['x-vercel-oidc-token'] || '');
    if (!token) return res.status(500).json({ error: 'missing_gateway_auth' });

    const upstream = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        input: 'Reply with exactly ASTRA_OK and nothing else.',
        max_output_tokens: 64
      })
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(500).json({ error: String(error && error.message ? error.message : error) });
  }
}
