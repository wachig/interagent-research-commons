import {validateMessageText,MAX_BODY_BYTES} from './keyboard_foundation.js';
import {isPresentableSpan} from './phrase_safety.js';
export const SPAN_PICK_VERSION='span-pick-1';
const WORD=/^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const encoder=new TextEncoder();
export function resolvedPick({kind,text,draft,effect='next',partial='',reference,autoCase,suffix=''}) {
  if(!['next','complete','exact'].includes(effect)|| !['','.','?','!',',',':',';'].includes(suffix))throw Error('Choose a supplied insertion effect.');
  if(kind==='span'?!isPresentableSpan(text):!WORD.test(text))throw Error('This word or span is not displayable.');
  if(effect==='complete'&&(kind!=='word'||!partial))throw Error('Choose a typed word to complete.');
  const n=effect==='complete'?[...partial].length:0;
  const prefix=n?[...draft].slice(0,-n).join(''):draft;
  const separator=effect==='next'&&prefix&&!/\s$/u.test(prefix)?' ':'';
  const casing=effect==='exact'||/[A-Z]/u.test(text)?text:autoCase(text,prefix+separator);
  const choice={v:SPAN_PICK_VERSION,k:kind,e:effect,a:separator+casing+suffix,n,r:reference};
  consumeResolvedPick(JSON.stringify(choice),draft,partial);
  return choice;
}
export function consumeResolvedPick(argument,draft,partial='') {
  let p;try{p=JSON.parse(argument);}catch{throw Error('Malformed Span insertion.');}
  if(!p||p.v!==SPAN_PICK_VERSION||Object.keys(p).sort().join(',')!=='a,e,k,n,r,v'||!['word','span'].includes(p.k)||!['next','complete','exact'].includes(p.e)||typeof p.a!=='string'||!Number.isSafeInteger(p.n)||p.n<0||typeof p.r!=='string'||! /^(?:sp1:\d{1,6}|lx1|model1)$/u.test(p.r))throw Error('Unsupported Span insertion contract.');
  if(argument!==JSON.stringify({v:p.v,k:p.k,e:p.e,a:p.a,n:p.n,r:p.r}))throw Error('Noncanonical Span insertion.');
  if(encoder.encode(p.a).length>100)throw Error('Span insertion exceeds its byte bound.');
  validateMessageText(p.a);
  const lexical=p.a.replace(/^ /u,'').replace(/[.,?!:;]$/u,'');
  if(encoder.encode(lexical).length>96||(p.k==='span'?!isPresentableSpan(lexical):!WORD.test(lexical)))throw Error('Invalid Span text.');
  if(p.e==='complete'){
    if(p.k!=='word'||!partial||p.n!==[...partial].length||!draft.endsWith(partial))throw Error('This completion does not match the typed ending.');
  }else if(p.n!==0)throw Error('Next/exact insertion cannot remove text.');
  const removed=p.n?[...draft].slice(-p.n).join(''):'';
  const body=[...draft].slice(0,[...draft].length-p.n).join('')+p.a;
  if(encoder.encode(body).length>MAX_BODY_BYTES)throw Error(`Message limit reached (${MAX_BODY_BYTES} UTF-8 bytes).`);
  return {removed,added:p.a,payload:p};
}
export function completedPick(state){
  if(state.operation!=='pick')return false;
  try{const p=JSON.parse(state.value);return p.v===SPAN_PICK_VERSION?p.e!=='exact':true;}catch{return true;}
}
