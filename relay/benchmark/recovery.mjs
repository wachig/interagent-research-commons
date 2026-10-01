// Separate deterministic engineering probes: never included in observed Luna scores.
import {readFile,writeFile} from 'node:fs/promises';
import {initRun,act,ROOT,ORIGIN} from './recorder.mjs';
const freeze=JSON.parse(await readFile('docs/relay-benchmark-2026-10-01/freeze.json'));
const registry=JSON.parse(await readFile('docs/relay-benchmark-2026-10-01/methods.json'));
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
const id=args.run,method=registry.methods.find(m=>m.id===args.method);
if(!method||!id)throw Error('Supply --run ID --method ID --case lost-addition-response|lost-publication-response|return-to-earlier-branch|expired-review');
const fault=args.case;
const state=async()=>JSON.parse(await readFile(ROOT+'/'+id+'/state.json'));
const follow=async(pattern,extra={})=>{const s=await state();const l=s.current.links.find(l=>pattern.test(l.label||l.text));if(!l)throw Error('No supplied choice matching '+pattern);return act(id,{op:'follow',page:s.page,link:l.id,...extra});};
if(!args.op||args.op==='start'){
  await initRun(id,{benchmark:freeze.benchmark,release:freeze.release,method_id:method.id,method_href:method.href,task_id:'recovery-'+fault,scored:false,expected_body:'I',reply_to:null,start_url:ORIGIN+'/',activation_budget:100,wall_budget_ms:1200000,profile:'deterministic-engineering-recovery',model:null});
  await act(id,{op:'start'});
  await follow(new RegExp('^'+method.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'));
}else if(args.op==='follow'){
  const s=await state();const l=s.current.links.find(l=>(l.label||l.text)===args.label);
  if(!l)throw Error('Exact supplied label absent');
  await act(id,{op:'follow',page:s.page,link:l.id,...(args.drop==='true'?{drop:true}:{}),...(args.intent?{intent:args.intent}:{})});
}else if(args.op==='retry'||args.op==='back'){
  await act(id,{op:args.op,...(args.page?{page:Number(args.page)}:{}),...(args.intent?{intent:args.intent}:{})});
}else if(args.op==='finish'){
  console.log(await act(id,{op:'finish',outcome:args.outcome||'completed',note:args.note||'Separate deterministic engineering recovery probe.'}));
}else if(args.op!=='view')throw Error('Unknown recovery operator action');
const s=await state();console.log(JSON.stringify({run:id,page:s.page,title:s.current.title,drafts:s.current.drafts,links:s.current.links.map(l=>({id:l.id,label:l.label||l.text})),fault}));
