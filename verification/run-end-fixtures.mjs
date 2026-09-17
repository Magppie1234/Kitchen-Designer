// Synthetic exact-fit room for the 20mm shared tall-panel rule.
export function runEndFixture() {
  return {project:'Run-end verification',height:'8ft',handle:'CJ',lockAnchors:true,lockZones:true,dishwasher:false,
    walls:[{id:'A',dir:'E',length:11970},{id:'B',dir:'S',length:3000},{id:'C',dir:'W',length:11970},{id:'D',dir:'N',length:3000}],
    anchors:[{item:'sink',wall:'A',at:1100,width:900},{item:'hob',wall:'A',at:4500,width:900},{item:'fridge',wall:'A',at:9620,width:600}],
    openings:[],columns:[],zones:{base:[{wall:'A',from:0,to:9000}],wall:[{wall:'A',from:0,to:9000}],tall:[{wall:'A',from:9000,to:11970}]}};
}
