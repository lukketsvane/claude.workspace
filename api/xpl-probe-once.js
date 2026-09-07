const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'GET only' });
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    const digest = crypto.createHash('sha256').update(email).digest('hex');
    if (digest !== '2d1269fc5f977e7763982a2c99127020a7fd6dc378cf1962a52dd4103790ed7f') {
      return res.status(403).json({ ok:false, error:'not authorized' });
    }

    const signup = await fetch('https://platform.experientiallabs.ai/api/signup/instant', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ email, agree:true })
    });
    const sj = await signup.json().catch(() => ({}));
    if (!signup.ok) {
      return res.status(signup.status).json({
        ok:false,
        stage:'signup',
        status:signup.status,
        error:sj.error || sj.code || sj.message || 'signup failed'
      });
    }

    const key = sj.api_key;
    const meta = {
      signup_ok:true,
      credits_granted:sj.credits_granted ?? null,
      verification_required:sj.verification_required ?? null,
      overview_url:sj.overview_url ?? null,
      key_received:!!key
    };
    if (!key) return res.status(200).json({ ok:false, stage:'signup', ...meta });

    const probe = await fetch('https://api.experientiallabs.ai/v1/chat/completions', {
      method:'POST',
      headers:{'content-type':'application/json','authorization':`Bearer ${key}`},
      body:JSON.stringify({
        model:'gpt-6-astra',
        messages:[{role:'user',content:'Reply with exactly ASTRA_OK and nothing else.'}],
        max_tokens:32
      })
    });
    const pj = await probe.json().catch(() => ({}));
    if (!probe.ok) {
      return res.status(200).json({
        ok:false,
        stage:'probe',
        ...meta,
        probe_status:probe.status,
        probe_error:pj.error || pj.message || pj
      });
    }

    return res.status(200).json({
      ok:true,
      ...meta,
      model:pj.model || 'gpt-6-astra',
      text:pj.choices?.[0]?.message?.content || '',
      usage:pj.usage || null
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e?.message || e) });
  }
};
