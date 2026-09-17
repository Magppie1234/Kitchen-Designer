import {writeFileSync} from 'node:fs';
import {fixtures,uiRequest,measuredVolumes} from './fixtures.mjs';
import {toEngineInput} from '../server.mjs';
import {layout} from '../engine.mjs';
import {loadCatalog} from '../loadCatalog.mjs';
const cat=loadCatalog().ok,out={};
for(const [name,j] of Object.entries(fixtures())){
  const request=uiRequest(j),{input}=toEngineInput(request.anchors,request.options),result=layout(input,cat);
  out[name]={request,expected:measuredVolumes(input,result.placed).filter(p=>p.code),problems:result.problems};
}
writeFileSync(new URL('../ui/verification-fixtures.json',import.meta.url),JSON.stringify(out,null,2));
