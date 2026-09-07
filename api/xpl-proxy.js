module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'POST only'});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.action === 'signup') {
      const r = await fetch('https://platform.experientiallabs.ai/api/signup/instant', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({email: body.email, agree: true})
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ok:false, status:r.status, error:j.error||j.code||j.message||'signup failed'});
      return res.status(200).json({ok:true, api_key:j.api_key, org_id:j.org_id, credits_granted:j.credits_granted, verification_required:j.verification_required, overview_url:j.overview_url});
    }
    if (body.action === 'call') {
      if (!body.key || !body.prompt) return res.status(400).json({ok:false,error:'missing key or prompt'});
      const r = await fetch('https://api.experientiallabs.ai/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${body.key}`},
        body:JSON.stringify({model:'gpt-6-astra',messages:[{role:'user',content:body.prompt}]})
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ok:false,status:r.status,error:j.error||j.message||j});
      return res.status(200).json({ok:true, model:j.model||'gpt-6-astra', text:j.choices?.[0]?.message?.content||'', usage:j.usage||null, id:j.id||null});
    }
    return res.status(400).json({ok:false,error:'unknown action'});
  } catch (e) {
    return res.status(500).json({ok:false,error:String(e && e.message || e)});
  }
};
