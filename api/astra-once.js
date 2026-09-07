const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET only' });

  const k = String(req.query.k || '');
  const digest = crypto.createHash('sha256').update(k).digest('hex');
  if (digest !== '11f142f02b84308b597558bcecc8df61c0b8be1b693b92df83affe25f3ccb0f4') {
    return res.status(403).json({ ok:false, error:'not authorized' });
  }

  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return res.status(500).json({ ok:false, stage:'auth', error:'No AI Gateway credential available' });

  try {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-6-astra',
        messages: [{ role:'user', content:'Reply with exactly ASTRA_OK and nothing else.' }],
        max_tokens: 32
      })
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(200).json({
        ok:false,
        stage:'gateway',
        status:r.status,
        error:j.error || j.message || j
      });
    }

    const choice = j.choices?.[0] || {};
    return res.status(200).json({
      ok:true,
      model:j.model || 'openai/gpt-6-astra',
      text:choice.message?.content || '',
      finish_reason:choice.finish_reason || null,
      usage:j.usage || null
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
};
