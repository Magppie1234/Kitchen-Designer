// ui/auth.js — invite-only login in the browser (Supabase Auth via supabase-js from the CDN).
// Loaded first by builder.html. It:
//   - sends invite / password-reset links (which land on "/") on to login.html to set a password
//   - sends anyone without a session to login.html
//   - adds the signed-in user's access token to every /api call the page makes, so the rest of
//     the builder needed no changes; a 401 from the server means "sign in again"
// window.AUTH resolves to { sb, session, user } once signed in.
(function () {
  const hash = location.hash;
  if (/type=(invite|recovery|signup|magiclink)|error_code=/.test(hash)) { location.replace('/login.html' + hash); return; }
  const toLogin = () => location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search));
  const realFetch = window.fetch.bind(window);
  window.AUTH = realFetch('/api/auth-config').then((r) => r.json()).then(async (cfg) => {
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    const { data } = await sb.auth.getSession();
    if (!data.session) { toLogin(); return new Promise(() => {}); }
    sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') toLogin(); });
    return { sb, session: data.session, user: data.session.user };
  });
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!/(^|\/\/[^/]+)\/api\//.test(url) || /\/api\/auth-config/.test(url)) return realFetch(input, init);
    const { sb } = await window.AUTH;
    const { data } = await sb.auth.getSession();   // refreshed by supabase-js when near expiry
    const headers = Object.assign({}, init && init.headers, { authorization: 'Bearer ' + (data.session ? data.session.access_token : '') });
    const res = await realFetch(input, Object.assign({}, init, { headers }));
    if (res.status === 401) toLogin();
    return res;
  };
  window.signOut = async () => { const { sb } = await window.AUTH; await sb.auth.signOut(); toLogin(); };
})();
