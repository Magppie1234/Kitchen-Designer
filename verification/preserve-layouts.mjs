import { existsSync } from 'node:fs';
import { getDb } from '../vendor/db.js';
import { createRevision } from '../vendor/designStore.js';

const db=getDb();
const backup='.audit-originals/detailed-plan-20260917/design.sqlite';
if(!existsSync(backup)) db.exec(`VACUUM INTO '${backup}'`);
let saved=0;
for(const room of db.prepare('SELECT id,state FROM rooms WHERE deleted_at IS NULL').all()) {
  const state=JSON.parse(room.state);
  if(!state.plan || db.prepare("SELECT 1 FROM revisions WHERE room_id=? AND reason='before-detailed-plan'").get(room.id)) continue;
  await createRevision(room.id,'before-detailed-plan',{...state,planStyle:'classic',planTier:state.planTier||'overlay'});
  saved++;
}
console.log(`Database backup preserved; ${saved} previous layouts added to version history.`);
