import inventory from './short_words-1.0.0.json' with {type:'json'};
export {inventory as SHORT_WORD_INVENTORY};
export const SHORT_WORD_SET=new Set(inventory.words);
export const withoutShortWords=rows=>rows.filter(row=>!SHORT_WORD_SET.has((typeof row==='string'?row:row.text).toLocaleLowerCase('en-US')));

// A renderer over the existing signed text-state backend; no new session store.
export async function renderShortWordKeyboard({env,request,state,draft,layout,shifted,offset,predictions,keyboard,controls,PREFIX,word,stateHref,actionHref,page,escapeHtml,autoCase,keyArgument,dictionaryWords}) {
  const tail=draft.match(/[\p{L}\p{N}'’\-]+$/u)?.[0]||'';
  const typed=state.operation==='key' && (state.value==='backspace'||/^[\p{L}\p{N}'’\-]$/u.test(keyArgument(state.value)||''));
  const partial=typed?tail:'';
  const wordLink=async(text,effect,role)=>{
    const preceding=effect==='complete'?draft.slice(0,-partial.length):draft;
    const label=/[@/_=\-]$/u.test(preceding)?text:autoCase(text,preceding);
    const choice=JSON.stringify({text,case:'auto',wrapper:'none',suffix:'',effect});
    const href=await actionHref({...state,env},'pick',choice,'letters','',0,'short');
    return `<a rel="nofollow" href="${escapeHtml(href)}" aria-label="${role} ${escapeHtml(label)}">${escapeHtml(label)}</a>`;
  };
  const shortEffect=partial?'complete':'next';
  const shortGroups=await Promise.all([2,3].map(async length=>`<section><h3>${length} letters</h3><div class="choices" aria-label="Permanent ${length}-letter words">${(await Promise.all(inventory.words.filter(text=>text.length===length).map(text=>wordLink(text,shortEffect,partial?'Complete short word':'Add short word')))).join(' ')}</div></section>`));
  const top=(await Promise.all(withoutShortWords(predictions).slice(0,18).map(row=>wordLink(row.text,'next','Add top word')))).join(' ');
  let candidates='<p>Type the beginning of a word to show matching candidates. Typing begins or continues the current word; candidate selections complete the typed ending.</p>';
  if(partial){
    const prefix=partial.toLocaleLowerCase('en-US');
    const dictionary=withoutShortWords(await dictionaryWords(env,request,prefix));
    let order=[];
    if(/^[a-z]+$/u.test(prefix)){
      const response=await env.ASSETS.fetch(new Request(new URL(`/semantic-lexicon/chunk-order/${prefix.slice(0,2)}.json`,request.url)));
      if(response.ok)order=await response.json();
    }
    const rank=new Map();order.forEach((text,index)=>{const key=text.toLocaleLowerCase("en-US");if(!rank.has(key))rank.set(key,index);});
    dictionary.sort((a,b)=>(rank.get(a.toLocaleLowerCase("en-US"))??Infinity)-(rank.get(b.toLocaleLowerCase("en-US"))??Infinity)||a.localeCompare(b,'en-US'));
    const shown=dictionary.slice(offset,offset+20);
    const href=next=>stateHref(state.state_id,layout,shifted,'',next,'short');
    const pager=`${offset?`<a href="${escapeHtml(href(Math.max(0,offset-20)))}">Previous candidate page</a>`:''} ${offset+20<dictionary.length?`<a href="${escapeHtml(href(offset+20))}">Next candidate page</a>`:''}`;
    candidates=`<p>${dictionary.length.toLocaleString('en-US')} matches for <strong>${escapeHtml(partial)}</strong>; ${dictionary.length?offset+1:0}–${Math.min(offset+20,dictionary.length)} shown. These replace the typed ending, without changing earlier text. Permanent short words are excluded.</p><div class="choices" aria-label="Matching candidate words">${(await Promise.all(shown.map(text=>wordLink(text,'complete','Complete candidate')))).join(' ')||'<span>No matching words. Continue typing exactly, or use the Unicode lane.</span>'}</div><nav>${pager}</nav>`;
  }
  return page('Short Word Keyboard',`<style>main{max-width:1100px}.short-top{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.short-workspace{display:grid;grid-template-columns:minmax(300px,1fr) minmax(300px,1fr);gap:1.2rem}.short-workspace .choices{gap:.25rem}.short-workspace .choices a{padding:.24rem .4rem;min-width:2rem}.short-workspace h3{font-size:.85rem;margin:.4rem 0}.short-workspace .controls{margin:.7rem 0}.short-top details{font-size:.82rem}.candidate-panel{padding:.7rem;border:1px solid #d4dbe4;border-radius:6px}.hint{color:#536176;font-size:.82rem}@media(max-width:720px){.short-top,.short-workspace{grid-template-columns:1fr}}</style><header class="short-top"><div><h1>Short Word Keyboard</h1><p><a href="/">Return to Relay home</a> · <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p><details><summary>About this keyboard</summary><p>A permanent English short-word palette, contextual next words, and typed-prefix candidates. It uses the shared Relay keyboard backend. Temporary branches stay unpublished until separate review and publication. URLs may be logged. Do not send secrets. <a href="/keyboards/short-words/1.0.0.json">Word inventory, selection rules and provenance</a>.</p></details><details><summary>Instructions</summary><p>After selecting a word, the next letter starts a new word automatically. Punctuation attaches without an extra space. Backspace edits the selected word; subsequent letters continue that edit. Otherwise keys append literally. The exact-character lane always appends literally. Typing narrows Candidates. Short words and candidates complete the typed ending when one exists; otherwise short words add a next word. Top Words starts from the shared starter list, then predicts the next word; it always adds the next word. Space commits a word boundary. Backspace removes one Unicode character; Undo reverses the last addition or deletion; Clear draft keeps your session and reply target. The permanent short words are excluded from Top Words and Candidates. Missing words remain spellable with the keys or exact Unicode lane.</p></details></div><section><h2>Current draft</h2><pre class="draft" aria-label="Current draft">${escapeHtml(draft)}</pre><p class="hint">${new TextEncoder().encode(draft).length} UTF-8 bytes · 1200 max</p>${state.reply_to?`<p>Reply to ${escapeHtml(state.reply_to)}</p>`:''}</section></header><div class="short-workspace"><div><section id="keyboard"><h2>Keyboard</h2><nav class="key-grid" aria-label="${layout==='symbols'?'Symbols':'Letters'} keyboard">${keyboard}</nav></section><nav class="controls" aria-label="Draft controls">${controls}</nav><p><a href="${PREFIX}/characters/${word(state.state_id)}?view=short">Exact characters and Unicode</a></p><section id="short-words"><h2>Short words · ${inventory.words.length}</h2><p class="hint">${partial?`Complete the typed ending ${escapeHtml(partial)}.`:'Add the next word.'} A bounded common-use panel; other short words remain available in Candidates.</p>${shortGroups.join('')}</section></div><div><section id="top-words"><h2>Top Words</h2><p class="hint">Add next word · preserves typed text. Suggestions are not verified facts.</p><div class="choices" aria-label="Top word choices">${top||'<span>No additional predictions available.</span>'}</div></section><section id="candidates" class="candidate-panel"><h2>Candidates</h2>${candidates}</section></div></div>`);
}
