// Local graph estimates only. No HTTP, agent trials or publication.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const assets=new URL('../assets/span-keyboard/1.0.0/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',assets))),nodes=[];
for(let i=0;i<Math.ceil(manifest.node_count/128);i++)nodes.push(...JSON.parse(await readFile(new URL(`nodes/${i}.json`,assets))));
const first=Object.create(null),context=Object.create(null);for(let i=0;i<32;i++){Object.assign(first,JSON.parse(await readFile(new URL(`first/${i}.json`,assets))));Object.assign(context,JSON.parse(await readFile(new URL(`context/${i}.json`,assets))));}
const development=[
 'we can discuss this at the same time',
 'i would like to understand the difference',
 'there is a lot of information here',
 'thank you for taking the time to explain',
 'could you compare the two approaches',
 'we should take a look at the documentation',
 'the compiler rejected an ambiguous expression',
 'validate the digest before accepting the receipt',
 'retain the original unicode normalization',
 'the transaction must preserve referential integrity',
 'use the exact identifier zeta42',
 'restart from the saved branch without publishing'
];
// Context ranking and search span ceilings match the renderer. No model next-word guesses.
const prune=rows=>{const seen=new Set(),counts=new Map();return rows.filter(r=>{const w=r.text.split(' ')[0].toLowerCase();if(seen.has(r.text)||(counts.get(w)||0)>=2)return false;seen.add(r.text);counts.set(w,(counts.get(w)||0)+1);return true;}).slice(0,8);};
const depth=nodes.map(()=>Infinity);depth[0]=0;
for(let i=0;i<nodes.length;i++)for(const [child] of nodes[i].routes)depth[child]=Math.min(depth[child],depth[i]+1);
const words=new Map(),searched=new Map();
for(let i=0;i<nodes.length;i++){
 for(const w of nodes[i].words)words.set(w,Math.min(words.get(w)??Infinity,depth[i]+1));
 if(i)for(const r of prune(nodes[i].words.slice(0,24).flatMap(w=>first[w.toLowerCase()]||[])))searched.set(r.text,Math.min(searched.get(r.text)??Infinity,depth[i]+1));
}
function estimate(text,enabled,strategy){
 const tokens=text.split(' '),memo=new Map();
 const choicesAt=i=>{
  const word=tokens[i];const choices=[{length:1,cost:words.get(word)??word.length+(i?1:0),text:word,kind:'word-or-literal'}];
  if(enabled){
   let offered=[];for(let length=Math.min(2,i);length>=0;length--)offered.push(...context[tokens.slice(i-length,i).join(' ')]||[]);
   const candidates=new Map(prune(offered).map(r=>[r.text,1]));
   for(let length=2;length<=4&&i+length<=tokens.length;length++){const s=tokens.slice(i,i+length).join(' ');if(searched.has(s))candidates.set(s,Math.min(candidates.get(s)??Infinity,searched.get(s)));}
   for(const [s,cost] of candidates){const a=s.split(' ');if(tokens.slice(i,i+a.length).join(' ')===s)choices.push({length:a.length,cost,text:s,kind:'span'});}
  }
  return choices;
 };
 function optimal(i){if(i===tokens.length)return {cost:0,path:[]};if(memo.has(i))return memo.get(i);let best;
 for(const c of choicesAt(i)){const rest=optimal(i+c.length),candidate={cost:c.cost+rest.cost,path:[c,...rest.path]};if(!best||candidate.cost<best.cost)best=candidate;}memo.set(i,best);return best;}
 if(strategy==='optimal')return optimal(0);
 let path=[],cost=0;for(let i=0;i<tokens.length;){const c=choicesAt(i).sort((a,b)=>(a.cost/a.length)-(b.cost/b.length)||b.length-a.length||a.text.localeCompare(b.text))[0];path.push(c);cost+=c.cost;i+=c.length;}return {cost,path};
}
const report={version:'span-development-1',scope:'Purposive developer-written lowercase ASCII word/space targets; design estimates only, not agent efficiency, real timing or Chunk comparison.',assumptions:['Lexical root choices retained across contexts; runtime next-word model excluded.','Search graph and bounded phrase menus are modeled; known exact target permits graph optimization.','Greedy strategy chooses the available matching option with lowest activations per word. This is deterministic target-informed engineering, not observed agent behavior.','Counts cover composition only. Discovery, review, publication and verification are excluded; do not report these as full task costs.','No punctuation variants, Unicode browsing, correction or expiry simulation; those contracts are verified separately against local emitted links.','Development targets are not held-out competition targets.'],width_estimates:manifest.development_graph_estimates,cases:development.map(text=>({text,words_only:estimate(text,false,'optimal'),spans_optimal:estimate(text,true,'optimal'),spans_greedy:estimate(text,true,'greedy')}))};
const out=new URL('../../docs/span-keyboard-2026-10-01/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('development.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.cases.length,words_only_composition:report.cases.reduce((n,r)=>n+r.words_only.cost,0),spans_graph_composition:report.cases.reduce((n,r)=>n+r.spans_optimal.cost,0),spans_greedy_composition:report.cases.reduce((n,r)=>n+r.spans_greedy.cost,0),scope:report.scope}));
