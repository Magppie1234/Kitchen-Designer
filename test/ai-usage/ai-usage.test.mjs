// Per-designer AI limit (server.mjs: charged) against a fake Supabase: a designer over their
// monthly limit is refused before Gemini is called, a failed call is not charged, and only
// the admin can change a limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
const { handler } = await import('../../server.mjs');

const PEOPLE = { tokD: { id: '11111111-1111-1111-1111-111111111111', role: 'designer' },
                 tokA: { id: '22222222-2222-2222-2222-222222222222', role: 'admin' } };
let usage, inserts, patches;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), token = opts.headers?.authorization?.replace('Bearer ', '');
  const ok = (b) => new Response(JSON.stringify(b), { status: 200 });
  if (u.includes('/auth/v1/user')) return PEOPLE[token] ? ok({ id: PEOPLE[token].id, email: token + '@x' }) : new Response('{}', { status: 401 });
  if (u.includes('/rest/v1/profiles?id=eq.') && opts.method === 'PATCH') { patches.push(JSON.parse(opts.body)); return ok([{}]); }
  if (u.includes('/rest/v1/profiles')) return ok(Object.values(PEOPLE).find((p) => u.includes(p.id)) ? { role: Object.values(PEOPLE).find((p) => u.includes(p.id)).role, name: 'n' } : null);
  if (u.includes('/rest/v1/ai_usage_month')) return ok(usage);
  if (u.includes('/rest/v1/ai_usage')) { inserts.push(JSON.parse(opts.body)); return ok([{}]); }
  throw new Error('unexpected fetch ' + u);
};

async function call(path, token, body = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  Object.assign(req, { url: path, method: 'POST', headers: { authorization: 'Bearer ' + token } });
  let status, out = '';
  const res = { setHeader() {}, headersSent: false, writeHead(s) { status = s; this.headersSent = true; }, end(b) { out = b; } };
  await handler(req, res);
  return { status, body: JSON.parse(out || '{}') };
}

test('over the monthly limit: refused before Gemini, nothing logged', async () => {
  usage = { spent: 500.2, ai_monthly_limit: 500 }; inserts = [];
  const r = await call('/api/render', 'tokD', { image: 'data:image/png;base64,AA' });
  assert.equal(r.status, 402);
  assert.match(r.body.error, /limit for this month \(₹500\)/);
  assert.equal(inserts.length, 0);
});

test('under the limit but the AI call fails: not charged', async () => {
  usage = { spent: 10, ai_monthly_limit: 500 }; inserts = [];
  const key = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  const r = await call('/api/render', 'tokD', { image: 'data:image/png;base64,AA' });
  if (key !== undefined) process.env.GEMINI_API_KEY = key;
  assert.equal(r.status, 503);   // reached the renderer (no key here), past the limit check
  assert.equal(inserts.length, 0);
});

test('cost comes from Gemini token counts: image output at the image rate, plan model by date', async () => {
  const { usageInr, USD_TO_INR } = await import('../../ai-cost.mjs');
  // render: 1000 input, 1120 image output -> (1000*0.5 + 1120*60) / 1e6 USD
  const r = usageInr('gemini-3.1-flash-image', { total_input_tokens: 1000, total_output_tokens: 1120, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] });
  assert.ok(Math.abs(r - 0.0677 * USD_TO_INR) < 1e-9);
  // plan read: 2000 in, 300 out + 200 thinking; price doubles from 1 Jan 2027
  const u = { total_input_tokens: 2000, total_output_tokens: 300, total_thought_tokens: 200 };
  assert.ok(Math.abs(usageInr('gemini-3.8-flash', u, Date.UTC(2026, 10, 5)) - 0.003375 * USD_TO_INR) < 1e-9);
  assert.ok(Math.abs(usageInr('gemini-3.8-flash', u, Date.UTC(2027, 0, 2)) - 0.00675 * USD_TO_INR) < 1e-9);
});

test('only the admin changes a limit', async () => {
  patches = [];
  assert.equal((await call('/api/ai-limit', 'tokD', { designerId: PEOPLE.tokD.id, limit: 900 })).status, 403);
  assert.equal((await call('/api/ai-limit', 'tokA', { designerId: PEOPLE.tokD.id, limit: -1 })).status, 400);
  assert.equal((await call('/api/ai-limit', 'tokA', { designerId: PEOPLE.tokD.id, limit: 900 })).status, 200);
  assert.deepEqual(patches, [{ ai_monthly_limit: 900 }]);
});
