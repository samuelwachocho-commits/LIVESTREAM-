// CeremonyStream relay: a small Cloudflare Worker.
// The app sends its live video to Cloudflare Stream; this Worker tells Cloudflare to
// forward that video to YouTube / Facebook. Your Cloudflare secret key stays here,
// never inside the app.
//
// Settings to add in Cloudflare (Worker > Settings > Variables and Secrets):
//   CF_ACCOUNT_ID    your Cloudflare Account ID                (text)
//   CF_API_TOKEN     API token with  Stream > Edit             (secret)
//   ALLOWED_ORIGIN   https://YOURNAME.github.io               (text; no path, no slash at end)
//   GOOGLE_CLIENT_ID (optional) same Client ID as in index.html (text)

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''),
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Provider',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin'
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed.includes(origin)) return json({ error: 'This website is not allowed to use the relay.' }, 403);
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return json({ error: 'Relay is not set up: CF_ACCOUNT_ID / CF_API_TOKEN missing.' }, 500);

    // Only people who signed in to Google or Facebook may use the relay.
    if (!(await verify(req, env))) return json({ error: 'Sign-in could not be verified. Reconnect your account and try again.' }, 401);

    const path = new URL(req.url).pathname;
    const cf = async (p, opt) => {
      const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/stream' + p,
        Object.assign({ headers: { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' } }, opt));
      const d = await r.json().catch(() => ({}));
      if (!d.success) throw new Error((d.errors && d.errors[0] && d.errors[0].message) || 'Cloudflare error ' + r.status);
      return d.result;
    };

    try {
      const body = await req.json().catch(() => ({}));
      if (path === '/start') {
        const dests = Array.isArray(body.destinations) ? body.destinations.slice(0, 4) : [];
        if (!dests.length) return json({ error: 'No destinations given.' }, 400);
        for (const d of dests) {
          if (!/^rtmps?:\/\//i.test(d.url || '') || !d.key) return json({ error: 'Bad destination.' }, 400);
        }
        const input = await cf('/live_inputs', { method: 'POST', body: JSON.stringify({ meta: { name: 'CeremonyStream ' + new Date().toISOString() }, recording: { mode: 'off' } }) });
        const whipUrl = input.webRTC && input.webRTC.url;
        if (!whipUrl) { await cf('/live_inputs/' + input.uid, { method: 'DELETE' }).catch(() => {}); return json({ error: 'Cloudflare did not return a WebRTC address. Check that Stream is enabled on your account.' }, 502); }
        try {
          for (const d of dests) await cf('/live_inputs/' + input.uid + '/outputs', { method: 'POST', body: JSON.stringify({ url: d.url, streamKey: d.key }) });
        } catch (e) { await cf('/live_inputs/' + input.uid, { method: 'DELETE' }).catch(() => {}); throw e; }
        return json({ sessionId: input.uid, whipUrl });
      }
      if (path === '/stop') {
        if (!/^[a-f0-9]{32}$/.test(body.sessionId || '')) return json({ error: 'Bad session.' }, 400);
        await cf('/live_inputs/' + body.sessionId, { method: 'DELETE' });
        return json({ ok: true });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (e) {
      return json({ error: e.message || 'Relay error' }, 502);
    }
  }
};

async function verify(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  const t = encodeURIComponent(m[1]), p = req.headers.get('X-Provider');
  try {
    if (p === 'google') {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + t);
      if (!r.ok) return false;
      const d = await r.json();
      if (env.GOOGLE_CLIENT_ID && d.aud !== env.GOOGLE_CLIENT_ID) return false;
      return true;
    }
    if (p === 'facebook') {
      const r = await fetch('https://graph.facebook.com/me?fields=id&access_token=' + t);
      return r.ok;
    }
  } catch (_) {}
  return false;
}
