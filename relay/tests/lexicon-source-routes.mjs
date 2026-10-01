import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from '../tools/local-evaluation.mjs';
const f=await fixture();try{
const routes=['/semantic-lexicon/manifest.json','/semantic-lexicon/start-pairs.json','/semantic-lexicon/chunk-order/é.json','/semantic-lexicon-hunspell-base-1/manifest.json','/lexicon-source/relay-policy-1.json','/lexicon-source/relay-additions-1.json','/lexicon-source/esdb-export-1.json','/lexicon-source/ESDB-Copyright.txt','/lexicon-source/esdb-1e5b7d3a.tar.gz'];
for(const route of routes){const r=await fetch(f.base+route);assert.equal(r.status,200,route);assert.deepEqual(Buffer.from(await r.arrayBuffer()),await readFile(new URL('../assets'+route,import.meta.url)),route+' byte-exact');assert.equal((await fetch(f.base+route,{method:'HEAD'})).status,200);assert.equal((await f.request(route+'?x=1')).status,400);assert.equal((await f.request(route,{method:'POST'})).status,405);}
console.log('Lexicon source routes passed:',routes.length,'public artifacts byte-exact; HEAD read-only; POST/query rejected.');
}finally{await f.close();}
