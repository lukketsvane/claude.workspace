module.exports = async function handler(req, res) {
  try {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    const token = await getVercelOidcToken();
    if (!token) {
      return res.status(500).json({ ok: false, error: 'getVercelOidcToken() returned no token' });
    }

    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        messages: [
          { role: 'user', content: 'Reply with exactly ASTRA_OK and nothing else.' }
        ],
        reasoning_effort: 'max',
        max_completion_tokens: 64
      })
    });

    const body = await r.text();
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
};
