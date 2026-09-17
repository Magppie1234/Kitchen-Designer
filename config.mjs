// config.mjs — executable configuration backed by rules.json.
// The browser build injects the same object before inlining the engine.
import { readFileSync } from 'node:fs';

export const RULES = JSON.parse(readFileSync(new URL('./rules.json', import.meta.url), 'utf8'));
export const RULE_PARAMS = RULES.params;

