module.exports = async function handler(req, res) {
  try {
    const base = 'https://synapse.garden';
    const html = await (await fetch(base + '/login')).text();
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
    const out = [];
    for (const s of [...new Set(scripts)]) {
      const u = s.startsWith('http') ? s : base + s;
      let t = '';
      try { t = await (await fetch(u)).text(); } catch { continue; }
      const hits = [];
      for (const term of ['supabase.co','signInWithOtp','createClient','NEXT_PUBLIC_SUPABASE','eyJ','magic-email','MagicLinkForm']) {
        let from = 0, count = 0;
        while (count < 4) {
          const i = t.indexOf(term, from);
          if (i < 0) break;
          hits.push({term, snippet:t.slice(Math.max(0,i-650), Math.min(t.length,i+1500))});
          from = i + term.length; count++;
        }
      }
      if (hits.length) out.push({url:u,hits});
    }
    res.setHeader('content-type','application/json');
    return res.status(200).json({scripts:scripts.length,results:out});
  } catch (e) {
    return res.status(500).json({error:String(e)});
  }
};
