// vendor/supabase.js — Supabase over plain fetch, no SDK: PostgREST for the design tables,
// GoTrue for "who is calling". Every table call runs with the CALLER's access token, so the
// row-level security in supabase/schema.sql decides what each designer / the admin can see.
//
// The caller is carried per request in AsyncLocalStorage (set by server.mjs), so the design
// store's functions keep their signatures and never take a token argument.
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestUser = new AsyncLocalStorage();   // { token, id, email, role }

const fail = (status, message) => Object.assign(new Error(message), { status });

export function supabaseEnv() {
  const raw = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!raw || !anon) throw fail(503, 'Supabase is not configured: SUPABASE_URL / SUPABASE_ANON_KEY missing on the server.');
  // origin only: a URL pasted with /rest/v1/ on the end still works
  return { url: new URL(raw).origin, anon, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

// rest('projects?id=eq.X', { method, body, single }) — `service: true` uses the secret key and
// bypasses RLS; only the public share-link lookup does that.
export async function rest(path, { method = 'GET', body, single = false, service = false } = {}) {
  const { url, anon, service: secret } = supabaseEnv();
  let key = anon, bearer = requestUser.getStore()?.token;
  if (service) {
    if (!secret) throw fail(503, 'SUPABASE_SERVICE_ROLE_KEY missing on the server.');
    key = bearer = secret;
  }
  if (!bearer) throw fail(401, 'Not signed in.');
  const headers = { apikey: key, authorization: `Bearer ${bearer}`, 'content-type': 'application/json' };
  if (method !== 'GET') headers.prefer = 'return=representation';
  if (single) headers.accept = 'application/vnd.pgrst.object+json';
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (res.status === 406 && single) return null;   // no row (or more than one)
  if (!res.ok) {
    let msg = text; try { msg = JSON.parse(text).message || text; } catch {}
    // RLS refusals arrive as 401/403 or as Postgres 42501
    throw fail(res.status === 401 || res.status === 403 || /row-level security|42501/.test(text) ? 403 : 500, msg);
  }
  return text ? JSON.parse(text) : null;
}

// Access token -> { id, email, role }. GoTrue validates the token; the role comes from
// profiles (read with the same token, so RLS applies).
// ponytail: in-memory cache per serverless instance, 60 s; a banned user keeps access until
// their token's cache entry expires — fine for a handful of designers.
const cache = new Map();
export async function userFromToken(token) {
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const { url, anon } = supabaseEnv();
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json();
  const profile = await requestUser.run({ token }, () => rest(`profiles?id=eq.${u.id}&select=role,name`, { single: true }));
  if (!profile) return null;   // auth user without a profile row: schema.sql not run yet
  const user = { token, id: u.id, email: u.email, name: profile.name, role: profile.role };
  if (cache.size > 500) cache.clear();
  cache.set(token, { user, until: Date.now() + 60_000 });
  return user;
}
