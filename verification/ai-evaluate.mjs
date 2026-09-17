// Offline by default. --live explicitly enables billed provider calls.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fitKitchen} from '../fitting.mjs';
import {storageMetrics} from '../planner.mjs';
import {loadCatalog} from '../loadCatalog.mjs';
import {improveFittedKitchen} from '../ai-planner.mjs';
import {configuredProposer} from '../ai-provider.mjs';
const args=process.argv.slice(2),live=args.includes('--live');
const pick=name=>args.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const selected=pick('cases')?.split(','),model=pick('model');
const repeat=Math.max(1,Math.min(5,Number(pick('repeat'))||1));
const catalog=loadCatalog().ok,root=new URL('./ai-baseline/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root)));
const propose=live?configuredProposer({env:{...process.env,...(model?{KITCHEN_PLANNER_MODEL:model}:{})}}):undefined;
if(live&&!propose)throw Error('Set OPENROUTER_API_KEY locally before running a live evaluation.');
const cases=manifest.cases.filter(c=>!selected||selected.includes(c.name));
if(!cases.length)throw Error('No matching baseline cases');
const outDir=new URL(`./ai-evaluations/${Date.now()}/`,import.meta.url);await mkdir(outDir,{recursive:true});
const rows=[];
for(const entry of cases){
  const saved=JSON.parse(await readFile(new URL(`${entry.name}.json`,root)));
  for(let repetition=1;repetition<=repeat;repetition++){
    const start=performance.now();let current=await fitKitchen(saved.input,catalog);
    const deterministic=current;
    if(live)current=await improveFittedKitchen(current,catalog,{propose});
    const target=current.proposal??current,old=saved.fitted.proposal??saved.fitted;
    const row={name:entry.name,repetition,live,model:propose?.model??null,
      before:storageMetrics(old.result,catalog),after:storageMetrics(target.result,catalog),
      previousProblems:old.result.problems,currentProblems:target.result.problems,
      regression:old.result.problems.length===0&&target.result.problems.length>0,
      elapsedMs:Math.round(performance.now()-start),ai:target.result.planning?.ai};
    rows.push(row);
    await writeFile(new URL(`${entry.name}-${repetition}.json`,outDir),JSON.stringify({row,input:saved.input,deterministic,current},null,2));
    await writeFile(new URL('summary.json',outDir),JSON.stringify(rows,null,2));
    console.log(`${row.name}: ${row.currentProblems.length} problems; ${row.before.avoidableFillerMm} -> ${row.after.avoidableFillerMm} mm avoidable filler; ${row.ai?.status??'offline'}`);
  }
}
if(rows.some(r=>r.regression))process.exitCode=1;
