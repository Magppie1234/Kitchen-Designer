// share.test.mjs — client share links: the designer's expiry is checked, and the live 3D
// viewer's payload never carries prices unless the share includes the estimate.
import test from 'node:test';
import assert from 'node:assert';
import { shareExpiry, viewerPayload } from '../../vendor/shareApi.js';

test('shareExpiry: future dates within a year pass, everything else is a 400', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  assert.equal(shareExpiry(undefined, now), null);
  assert.equal(shareExpiry('2026-10-24T23:59:59Z', now), '2026-10-24T23:59:59.000Z');
  for (const bad of ['2026-10-16T00:00:00Z', '2028-01-01T00:00:00Z', 'next week'])
    assert.throws(() => shareExpiry(bad, now), (e) => e.status === 400, bad);
});

test('viewerPayload: prices leave unless the estimate is shared', () => {
  const sh = { roomName: 'Kitchen', revisionNumber: 3, latestRevision: 3, newerExists: false, expiresAt: 'x',
    state: { plan: { price: 1 }, shareScene: { plan: { runs: [], price: { total: 9 } }, walls: [] } } };
  const hidden = viewerPayload({ ...sh, includeEstimate: false });
  assert.equal(hidden.scene.plan.price, undefined);
  assert.deepEqual(hidden.scene.plan.runs, []);
  assert.equal(sh.state.shareScene.plan.price.total, 9, 'the stored revision is not mutated');
  assert.equal(viewerPayload({ ...sh, includeEstimate: true }).scene.plan.price.total, 9);
  assert.equal(viewerPayload({ ...sh, state: {} }).scene, null, 'an old share has no scene');
  assert.equal('state' in hidden, false, 'the full room state is not sent');
});
