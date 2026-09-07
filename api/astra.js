import crypto from 'node:crypto';

const EXPECTED = 'fb6db9f8ebeed0b2b6b2d91428f40152f3365fdc45ccbd91d3b3121038ad9b4f';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const supplied = String(req.headers['x-astra-key'] || '');
    const digest = crypto.createHash('sha256').update(supplied).digest('hex');
    if (digest !== EXPECTED) return res.status(403).json({ error: 'forbidden' });

    const prompt = req.body && req.body.prompt ? String(req.body.prompt) : '';
    if (!prompt) return res.status(400).json({ error: 'missing_prompt' });

    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!token) return res.status(500).json({ error: 'missing_gateway_auth' });

    const upstream = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        input: prompt,
        max_output_tokens: 256
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
