// Synthetic localhost measurements; no production credentials or publication.
import {fixture,parse} from './local-evaluation.mjs';
import {writeFile} from 'node:fs/promises';
import {extract} from '../benchmark/recorder.mjs';
const f=await fixture();const results=[];
async function measure(name,route){const times=[];let res,p;for(let i=0;i<5;i++){const start=performance.now();res=await f.request(route,{html:true});times.push(performance.now()-start);if(res.status!==200)throw Error(name+': '+res.status);p=parse(res.text,res.url);}const e=await extract(res.text);results.push({name,http_ms:times,html_bytes:Buffer.byteLength(res.text),links:p.links.length,extracted_utf8_bytes:Buffer.byteLength(e.text),extracted_tokens_proxy:Math.ceil(e.text.length/4)});return p;}
try{
 const root=await measure('chunk-empty','/predictive-keyboard/html/chunk-keyboard-3/');
 const con=root.links.find(l=>l['aria-label']==='Set START to co');if(!con)throw Error('missing co');
 const selected=await measure('chunk-co',con.url);const narrow=selected.links.find(l=>l.text==='con'&&l['aria-label']==='Set START to con');if(!narrow)throw Error('missing con');
 await measure('chunk-con',narrow.url);
 const typing=root.links.find(l=>l['aria-label']==='Type a into draft');await measure('chunk-typed-a',typing.url);
 const pred=await measure('predictive-empty','/predictive-keyboard/html/word-links/');const key=pred.links.find(l=>/\/key\/a\//.test(l.url));await measure('predictive-typed-a',key.url);
 let token=await measure('token-overview','/compose/token/o200k/');token=await measure('token-start',token.links.find(l=>l.text==='Start blank draft').url);
 await measure('token-byte-overview',token.links.find(l=>l.text==='Browse exact UTF-8 bytes').url);
 const output={scope:'local Wrangler; HTTP elapsed time is not Worker CPU or agent speed',measurements:results};
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(output));
}finally{await f.close();}
