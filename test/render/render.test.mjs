import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSnapshot, composePrompt } from '../../render.mjs';

test('render refuses without a key, and refuses non-image payloads', async () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(renderSnapshot({ image: 'data:image/png;base64,AA' }), { status: 503 });
  process.env.GEMINI_API_KEY = 'x';
  await assert.rejects(renderSnapshot({ image: 'data:text/html;base64,AA' }), { status: 400 });
  if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
});

test('each finish swatch is named with its surfaces in the prompt', () => {
  const p = composePrompt(['"Magppie Art" applies to the cabinet shutters']);
  assert.match(p, /Reference image 1: "Magppie Art" applies to the cabinet shutters/);
  assert.match(p, /Preserve the underlying geometry EXACTLY/);
});
