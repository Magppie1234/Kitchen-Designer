// Capture once before changing the planner. Refuses to overwrite the baseline.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fixtures} from './fixtures.mjs';
import {loadCatalog} from '../loadCatalog.mjs';
import {fitKitchen} from '../fitting.mjs';
import {storageMetrics} from '../planner.mjs';

const catalog=loadCatalog().ok;
const cases=Object.entries(fixtures()).map(([name,input])=>({name,input}));
for(const delta of [-75,-25,25,75])for(const item of ['hob','sink']){
  const input=structuredClone(cases[0].input),a=input.anchors.find(a=>a.item===item);
  a.at+=delta;if(a.center!=null)a.center+=delta;
  cases.push({name:`u-${item}-${delta}`,input});
}
const directory=new URL('./ai-baseline/',import.meta.url);
await mkdir(directory,{recursive:true});
const manifest=[];
for(const {name,input} of cases){
  const start=performance.now();
  const fitted=await fitKitchen(input,catalog);
  const row={name,input,fitted,metrics:storageMetrics(fitted.result,catalog),elapsedMs:Math.round(performance.now()-start)};
  await writeFile(new URL(`${name}.json`,directory),JSON.stringify(row,null,2),{flag:'wx'});
  manifest.push({name,problems:fitted.result.problems.length,...row.metrics,elapsedMs:row.elapsedMs});
  console.log(`${name}: ${row.metrics.cabinets} cabinets, ${fitted.result.problems.length} problems (${row.elapsedMs}ms)`);
}
await writeFile(new URL('manifest.json',directory),JSON.stringify({created:new Date().toISOString(),cases:manifest},null,2),{flag:'wx'});
