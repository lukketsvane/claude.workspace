const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET only' });

  const k = String(req.query.k || '');
  const digest = crypto.createHash('sha256').update(k).digest('hex');
  if (digest !== '11f142f02b84308b597558bcecc8df61c0b8be1b693b92df83affe25f3ccb0f4') {
    return res.status(403).json({ ok:false, error:'not authorized' });
  }

  try {
    const { generateText } = await import('ai');
    const result = await generateText({
      model: 'openai/gpt-6-astra',
      prompt: 'Reply with exactly ASTRA_OK and nothing else.',
      maxOutputTokens: 32,
      providerOptions: {
        gateway: { only: ['openai'] }
      }
    });

    return res.status(200).json({
      ok: true,
      model: 'openai/gpt-6-astra',
      text: result.text || '',
      finish_reason: result.finishReason || null,
      usage: result.usage || null,
      provider_metadata: result.providerMetadata || null
    });
  } catch (e) {
    return res.status(200).json({
      ok:false,
      stage:'ai-sdk',
      error:String(e?.message || e),
      name:e?.name || null
    });
  }
};
