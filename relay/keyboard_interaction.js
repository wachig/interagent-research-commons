import lowercaseEvidence from './automatic-lowercase-1.json' with {type:'json'};
const ordinary=new Set(lowercaseEvidence.words);
export function ordinaryAutomaticCase(token) {
  // Preserve acronyms, mixed-case names, and unknown names. This is an accelerator;
  // explicit case controls and literal entry remain authoritative.
  const lower=token.toLocaleLowerCase('en-US');
  return /^[A-Z][a-z]+$/u.test(token)&&ordinary.has(lower)?lower:token;
}
export function draftWords(draft) {
  return [...draft.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu)].map(match=>({text:match[0],index:match.index}));
}
export function repairWordCase(draft,ordinal,mode) {
  if(!Number.isSafeInteger(ordinal)||ordinal<0||!['lower','upper','capitalize'].includes(mode))throw Error('Choose a supplied word-case repair.');
  const item=draftWords(draft)[ordinal];if(!item)throw Error('The selected word is unavailable.');
  const lower=item.text.toLocaleLowerCase('en-US');
  const changed=mode==='lower'?lower:mode==='upper'?item.text.toLocaleUpperCase('en-US'):[...lower][0].toLocaleUpperCase('en-US')+lower.slice([...lower][0].length);
  return draft.slice(0,item.index)+changed+draft.slice(item.index+item.text.length);
}
export function repairWordComma(draft,ordinal,mode) {
  if(!Number.isSafeInteger(ordinal)||ordinal<0||!['insert','remove'].includes(mode))throw Error('Choose a supplied comma repair.');
  const item=draftWords(draft)[ordinal];if(!item)throw Error('The selected word is unavailable.');
  const end=item.index+item.text.length;
  if(mode==='remove'&&draft[end]!==',')throw Error('There is no comma after that word.');
  if(mode==='insert'&&draft[end]===',')throw Error('A comma already follows that word.');
  return draft.slice(0,end)+(mode==='insert'?',':'')+draft.slice(end+(mode==='remove'?1:0));
}
export function keyboardActionNames(html) {
  let heading='Keyboard';const names=new Map();
  return html.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi,(whole,title,attrs,label)=>{
    if(title!==undefined){heading=title.replace(/<[^>]*>/g,'').trim();return whole;}
    if(/\baria-label=/i.test(attrs))return whole;
    const visible=label.replace(/<[^>]*>/g,'').trim();const href=attrs.match(/\bhref="([^"]*)"/i)?.[1];
    if(!visible||!href)return whole;
    let name=`${heading}: ${visible}`;
    try{const url=new URL(href.replaceAll('&amp;','&'),'https://relay.invalid');
      if(url.pathname.includes('/state/')&&url.searchParams.has('prefix')){const prefix=url.searchParams.get('prefix');name=/^[0-9]+$/.test(prefix)?`Browse dictionary branch ${visible}`:`Find word prefix ${prefix||'all'}`;}
    }catch{}
    const existing=names.get(name)||[];if(!existing.includes(href))existing.push(href);names.set(name,existing);
    if(existing.length>1)name+=` · choice ${existing.indexOf(href)+1}`;
    const safe=name.replaceAll('"','&quot;');return `<a${attrs} aria-label="${safe}">${label}</a>`;
  });
}
