import test from 'node:test';
import assert from 'node:assert/strict';
import {requestUser} from '../../vendor/supabase.js';
import * as store from '../../vendor/designStore.js';

try{process.loadEnvFile();}catch{}
// Runs against the real Supabase project as a designer: set SUPABASE_TEST_TOKEN to a test
// designer's access token (signed in, from the browser's session). Skipped otherwise.
const token=process.env.SUPABASE_TEST_TOKEN;

test('layout history survives edits, reloads and restoration, including unsaved browser changes',{skip:!token&&'SUPABASE_TEST_TOKEN not set'},()=>requestUser.run({token},async()=>{
  let p;
  try{
    p=await store.createProject({name:'History test'});
    const initial={walls:[],plan:{runs:[{key:'W0',segments:[{width:900}]}]},planStyle:'classic'};
    const room=await store.createRoom(p.id,{name:'Kitchen',state:initial});
    const baseline=await store.createRevision(room.id,'save',initial);
    const edited=structuredClone(initial);edited.plan.runs[0].segments[0].width=600;edited.planStyle='detailed';
    await store.saveRoomState(room.id,edited);
    let versions=await store.listRevisions(room.id);
    assert.equal(versions.length,2);
    assert.deepEqual((await store.getRevision(versions[0].id)).state,initial);
    await store.saveRoomState(room.id,{...edited,modules:[{transient:true}]});
    assert.equal((await store.listRevisions(room.id)).length,2,'render metadata does not create redundant versions');
    const unsaved=structuredClone(edited);unsaved.plan.runs[0].segments[0].width=450;
    const restored=await store.restoreRevision(baseline.id,{roomId:room.id,currentState:unsaved});
    assert.deepEqual(restored.state,initial);
    assert.deepEqual((await store.getProject(p.id)).rooms.find(r=>r.id===room.id).state,initial,'restored state persists');
    versions=await store.listRevisions(room.id);
    const checkpoint=versions.find(v=>v.reason==='before-restore');
    assert.deepEqual((await store.getRevision(checkpoint.id)).state,unsaved);
    await store.restoreRevision(checkpoint.id);
    assert.deepEqual((await store.getProject(p.id)).rooms.find(r=>r.id===room.id).state,unsaved,'can return to the layout replaced by Restore');
    const count=(await store.listRevisions(room.id)).length;
    await assert.rejects(store.restoreRevision(baseline.id,{roomId:'00000000-0000-4000-8000-000000000000',currentState:{}}),/different room/);
    assert.equal((await store.listRevisions(room.id)).length,count);
  }finally{
    if(p) await store.deleteProject(p.id);
  }
}));
