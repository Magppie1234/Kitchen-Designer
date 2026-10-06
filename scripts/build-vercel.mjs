// scripts/build-vercel.mjs — Vercel build step (vercel.json buildCommand). Lays out the static
// site the CDN serves, so the /api function stays small:
//   public/                  <- ui/
//   public/models/           <- ui/models + Models (Models wins, as in core/models.mjs)
//   public/accessory-media/  <- data/accessories-master/media
// and writes data/models-manifest.json, which /api/models serves where Models/ is absent.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { loadCatalog } from '../core/loadCatalog.mjs';
import { modelManifest } from '../core/models.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
rmSync(at('public'), { recursive: true, force: true });
cpSync(at('ui'), at('public'), { recursive: true });
cpSync(at('Models'), at('public/models'), { recursive: true });
cpSync(at('data/accessories-master/media'), at('public/accessory-media'), { recursive: true });
const manifest = modelManifest(loadCatalog().ok);
writeFileSync(at('data/models-manifest.json'), JSON.stringify(manifest));
console.log(`public/ ready · ${manifest.models?.length ?? Object.keys(manifest).length} model entries in data/models-manifest.json`);
