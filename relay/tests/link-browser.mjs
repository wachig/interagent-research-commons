import assert from 'node:assert/strict';
import {render,initialize,read,follow,close} from '../link-browser/browser.mjs';
import {fixture} from '../tools/local-evaluation.mjs';
import {spawn} from 'node:child_process';
const sample=render('<title>Example</title><h1>Keyboard</h1><p>Notice <a href="/about">About</a></p><form><input name="q"><button>Search</button></form><pre class="draft">A  B\n&lt;x&gt;</pre><h2>Words</h2><a href="/pick?cap=secret">help</a><script>bad()</script>','https://example.test/',1);
assert.equal(sample.view.draft,'A  B\n<x>');assert.equal(sample.links.length,2);assert.ok(!JSON.stringify(sample.view).includes('secret'));assert.ok(!JSON.stringify(sample.view).includes('bad()'));assert.equal(sample.view.sections.at(-1).links[0].label,'help');
let requests=0;const fetcher=async()=>{requests++;return new Response('<h1>Page</h1><p><a href="#words">Words</a></p><a href="/next">Next</a>');};
const fake=await initialize({home:'https://example.test/',fetcher});
const child=spawn(process.execPath,['relay/link-browser/repl.mjs',fake],{stdio:['pipe','pipe','pipe']});let processOutput='';child.stdout.on('data',d=>processOutput+=d);child.stdin.end('{"action":"type","name":"typed field value"}\n');await new Promise(r=>child.once('exit',r));assert.ok(processOutput.includes('Only read and follow are available.'),'persistent browser refuses field input');assert.ok(processOutput.includes('remainingSeconds'),'persistent process supplies the actual clock');
try {let page=await read(fake);assert.ok(page.remainingSeconds>0&&page.remainingSeconds<=300,'client displays actual remaining time');const fragment=page.sections.flatMap(s=>s.links).find(l=>l.label==='Words');await follow(fake,fragment.id,{fetcher});assert.equal(requests,1,'fragments do not create HTTP requests');await assert.rejects(follow(fake,fragment.id,{fetcher}),/Stale/);assert.equal(requests,1,'stale handle never performs an action');await assert.rejects(follow(fake,'https://example.test/next',{fetcher}),/Stale/);assert.equal(requests,1,'constructed URL cannot be followed');await follow(fake,{name:'Next'},{fetcher});assert.equal(requests,2,'semantic selection follows exactly the supplied link');await assert.rejects(follow(fake,{name:'invented'},{fetcher}),/unknown/);assert.equal(requests,2,'unknown name performs no request');}finally{await close(fake);}
const service=await fixture();let browser;
try {
 browser=await initialize({home:service.base+'/'});
 const choose=async label=>{const p=await read(browser);const l=p.sections.flatMap(s=>s.links).find(l=>l.label===label);assert.ok(l,'missing supplied '+label);return follow(browser,l.id);};
 let p=await choose('Chunk Word Keyboard');assert.equal(p.usage,'recorded');p=await choose('Can');assert.equal(p.draft,'Can');
 p=await choose('Review message');assert.equal(p.draft,'Can');assert.ok(p.sections.flatMap(s=>s.links).some(l=>l.label==='Cancel this review and continue editing'));
 p=await choose('Cancel this review and continue editing');assert.ok(p.sections.some(s=>s.text.some(t=>t.includes('Your composition is preserved'))));
 p=await choose('Edit message');assert.equal(p.draft,'Can','review cancellation returns to exact composition through supplied links');
 assert.equal((await service.request('/poll')).body.returned_count,0,'cancelling a review does not publish');
 console.log('Link-only browser: literal draft rendering, supplied handles only, stale-link rejection, fragment semantics and live cancellation recovery passed.');
}finally {if(browser)await close(browser);await service.close();}
