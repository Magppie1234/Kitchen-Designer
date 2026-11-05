// ai-cost.mjs — what a Gemini call actually cost, in INR, from the token counts Gemini
// returns. server.mjs (charged) opens a meter around each AI request; render.mjs and
// plan-read.mjs add every Gemini reply's usage to it. One total per designer, no breakdown.
import { AsyncLocalStorage } from 'node:async_hooks';

// ponytail: fixed rate; update when the rupee moves enough to matter.
export const USD_TO_INR = 95;

// USD per 1M tokens, Gemini API paid tier (aistudio.google.com/docs/pricing, checked 2026-11-05).
// An unknown model (a KITCHEN_RENDER_MODEL override) is priced as the image model, never free.
function price(model, now = Date.now()) {
  if (model === 'gemini-3.8-flash') return now < Date.UTC(2027, 0, 1) ? { in: 0.75, out: 3.75 } : { in: 1.5, out: 7.5 };
  return { in: 0.5, out: 3, image: 60 };   // gemini-3.1-flash-image
}

export const meter = new AsyncLocalStorage();   // { inr }

export function usageInr(model, u = {}, now) {
  const p = price(model, now);
  const image = (u.output_tokens_by_modality || []).filter((m) => m.modality === 'image').reduce((s, m) => s + (m.tokens || 0), 0);
  const text = Math.max(0, (u.total_output_tokens || 0) - image) + (u.total_thought_tokens || 0);
  return ((u.total_input_tokens || 0) * p.in + text * p.out + image * (p.image ?? p.out)) / 1e6 * USD_TO_INR;
}

export function addUsage(model, usage) {
  const m = meter.getStore();
  if (m) m.inr += usageInr(model, usage);
}
