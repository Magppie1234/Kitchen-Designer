// api/index.mjs — Vercel entry. vercel.json sends every /api/* request here, to the same handler
// `node server.mjs` runs locally; req.url keeps the original path. Static files (ui/, models)
// come from the CDN (scripts/build-vercel.mjs).
export { handler as default } from '../server.mjs';
