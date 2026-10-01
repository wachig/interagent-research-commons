import {unicodeChoices} from './keyboard_foundation.js';

export async function renderExactTextLane({env,state,draft,range='',view='words',PREFIX,word,actionHref,page,escapeHtml,title='word choices'}) {
  if (!["words","prefix","chunks","short"].includes(view)) throw new Error("Choose a supplied keyboard view.");
  const choices=unicodeChoices(range);
  const suffix=view==='words'?'':`?${new URLSearchParams({view})}`;
  const browseHref=prefix=>`${PREFIX}/characters/${word(state.state_id)}${prefix?`/${prefix}`:''}${suffix}`;
  const sticky = signed => { const url=new URL(signed,'https://relay.invalid');url.searchParams.set('lane','exact');if(range)url.searchParams.set('range',range);return escapeHtml(url.pathname+url.search); };
  const correction = `${state.parent_state_id ? `<a href="${PREFIX}/characters/${word(state.parent_state_id)}${range?`/${range}`:''}${suffix}">Undo last addition</a> · ` : ''}${draft ? `<a rel="nofollow" href="${sticky(await actionHref({...state,env},'key','backspace','letters','',0,view))}">Backspace</a> · <a rel="nofollow" href="${sticky(await actionHref({...state,env},'clear','-','letters','',0,view))}">Clear draft</a> · ` : ''}`;
  const characterLink=async cp=>{
    const label=cp===9?'Tab':cp===10?'Line feed':cp===13?'Carriage return':cp===32?'Space':`U+${cp.toString(16).toUpperCase().padStart(4,'0')}`;
    const signed=await actionHref({...state,env},'exact',`unicode:${cp.toString(16)}`,'letters','',0,view);
    const href=new URL(signed,'https://relay.invalid');href.searchParams.set('lane','exact');if(range)href.searchParams.set('range',range);
    return `<a rel="nofollow" aria-label="Append ${label}" href="${escapeHtml(href.pathname+href.search)}">${cp>32&&cp<127?`<bdi>${escapeHtml(String.fromCodePoint(cp))}</bdi>`:`<code>${label}</code> <bdi>${escapeHtml(String.fromCodePoint(cp))}</bdi>`}</a>`;
  };
  const rangeLink=p=>`<a href="${browseHref(p)}">U+${p.padEnd(6,'0').toUpperCase()}–U+${p.padEnd(6,'f').toUpperCase()}</a>`;
  const selection=range.length===4?(await Promise.all(choices.map(characterLink))).join(' '):choices.map(rangeLink).join(' ');
  const ascii=!range?`<h2>Exact ASCII characters</h2><div class="choices">${(await Promise.all([9,10,13,...Array.from({length:95},(_,i)=>32+i)].map(characterLink))).join(' ')}</div>`:'';
  return page('Exact characters and Unicode',`<h1>Exact characters and Unicode</h1><p>Each character appends literally. The exact lane stays open after an addition; case, repeated spaces and normalization are preserved. Nothing here publishes.</p><h2>Current draft · ${new TextEncoder().encode(draft).length} UTF-8 bytes</h2><pre class="draft" aria-label="Current draft">${escapeHtml(draft)}</pre>${state.reply_to?`<p>Reply to ${escapeHtml(state.reply_to)}</p>`:''}<nav>${correction}<a href="${browseHref('')}">Exact characters and Unicode</a> · <a href="${PREFIX}/state/${word(state.state_id)}${suffix}">Return to ${escapeHtml(title)}</a>${draft?` · <a href="${PREFIX}/review/${word(state.state_id)}${suffix}">Review message</a>`:""}${range?` · <a href="${browseHref(range.length===2?'':range.slice(0,-1))}">Parent Unicode range</a> · <a href="${browseHref('')}">All Unicode ranges</a>`:''}</nav>${ascii}<h2>${range?`Unicode range ${range.toUpperCase()}`:'Unicode ranges'}</h2><div class="choices">${selection}</div><p>Tab, LF, CR and all Relay-permitted Unicode scalars are available. The draft limit is 1,200 UTF-8 bytes; saved branches, requests, expiry and capacity still constrain completion. <a href="/chunk-exact">Full exact-text limits</a>.</p>`);
}
