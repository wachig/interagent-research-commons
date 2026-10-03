import {draftWords,repairWordCase} from './keyboard_interaction.js';
export async function renderWordCaseRepair({env,state,draft,view,PREFIX,word,actionHref,page,escapeHtml,offset=0}) {
  const words=draftWords(draft);
  if(!Number.isSafeInteger(offset)||offset<0||offset%20||offset>=Math.max(1,words.length))throw Error('Choose a supplied repair page.');
  const route=n=>`${PREFIX}/word-case/${word(state.state_id)}?${new URLSearchParams({view,page:String(n)})}`;
  const rows=await Promise.all(words.slice(offset,offset+20).map(async(item,index)=>{
    const ordinal=offset+index;
    const choices=await Promise.all(['lower','upper','capitalize'].map(async mode=>{
      const changed=draftWords(repairWordCase(draft,ordinal,mode))[ordinal].text;
      if(changed===item.text)return '';
      const href=await actionHref({...state,env},'key',`wordcase:${ordinal}:${mode}`,'letters','',0,view);
      return `<a rel="nofollow" aria-label="Make word ${ordinal+1} ${mode}: ${escapeHtml(changed)}" href="${escapeHtml(href)}">${escapeHtml(changed)}</a>`;
    }));
    const commaMode=draft[item.index+item.text.length]===','?'remove':'insert';
    const commaHref=await actionHref({...state,env},'key',`wordcomma:${ordinal}:${commaMode}`,'letters','',0,view);
    choices.push(`<a rel="nofollow" aria-label="${commaMode==='insert'?'Insert':'Remove'} comma after word ${ordinal+1}" href="${escapeHtml(commaHref)}">${commaMode==='insert'?'Insert':'Remove'} comma</a>`);
    return `<section><h2>Word ${ordinal+1}: ${escapeHtml(item.text)}</h2><div class="choices">${choices.join(' ')}</div></section>`;
  }));
  const undo=state.parent_state_id?` · <a href="${PREFIX}/state/${word(state.parent_state_id)}?view=${view}">Undo last addition</a>`:'';
  return page('Repair words and punctuation',`<h1>Repair words and punctuation</h1><p>Choose the exact replacement shown. Case controls replace only the selected word. Comma controls insert or remove one comma immediately after it. Spacing and all following text remain. This creates an undoable unpublished branch.</p><pre class="draft">${escapeHtml(draft)}</pre>${state.reply_to?`<p>Reply to ${escapeHtml(state.reply_to)}</p>`:''}<nav><a href="${PREFIX}/state/${word(state.state_id)}?view=${view}">Return to keyboard</a>${undo}</nav>${rows.join('')}<nav>${offset?`<a href="${route(offset-20)}">Previous repair page</a>`:''} ${offset+20<words.length?`<a href="${route(offset+20)}">Next repair page</a>`:''}</nav>`);
}
