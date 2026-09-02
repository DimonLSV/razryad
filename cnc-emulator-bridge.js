/* РАЗРЯД 0.999 — единый переход из любого NC-кода в нужный эмулятор:
   токарный (X/Z, плоскость G18) или фрезерный (X/Y/Z, плоскость G17) */
(function(){
'use strict';
const KEY='razryad-cnc-emulator-handoff-v1';
const h=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function payload(code,meta){
 return{code:String(code||'').trim(),title:String(meta&&meta.title||'NC-программа'),source:String(meta&&meta.source||location.pathname),created:Date.now()};
}
function store(item){try{localStorage.setItem(KEY,JSON.stringify(item));return true}catch(_){return false}}
function peek(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
function take(){const item=peek();try{localStorage.removeItem(KEY)}catch(_){}return item}
function fallbackCopy(code){try{const area=document.createElement('textarea');area.value=String(code||'');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok!==false}catch(_){return false}}
function copyCode(code){const value=String(code||'');try{if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(value).then(()=>true).catch(()=>fallbackCopy(value))}catch(_){}return Promise.resolve(fallbackCopy(value))}
function closeOverlays(){try{document.querySelectorAll('#sheet.open,#navSearch.open,#workEditor.open').forEach(node=>node.classList.remove('open'))}catch(_){}}
/* Куда вести программу. Решает не «есть ли Y», а рабочая плоскость: G18 — токарная,
   G17 с осью Y — фрезерная. Когда плоскость не задана, а Y есть, признак слабый:
   ведём в токарный (он строже проверяет) и говорим об этом вслух — молча угадывать
   нельзя, оператор должен знать, что выбор сделан за него. */
function detectDialect(code){
 const s=String(code||'').toUpperCase().replace(/\([^)]*\)/g,' ').replace(/;[^\n]*/g,' ');
 const g17=/\bG0?17\b/.test(s),g18=/\bG0?18\b/.test(s),g19=/\bG0?19\b/.test(s);
 const hasY=/\bY[-+]?[\d.]/.test(s),hasZ=/\bZ[-+]?[\d.]/.test(s);
 const lathe=/\bG7[0-6]\b|\bG9[024]\b|\bG50\b|\bG9[67]\b/.test(s); /* токарные циклы и режимы */
 const mill=/\bG8[1-9]\b|\bG43\b|\bM0?6\b/.test(s);               /* циклы сверления, коррекция длины, смена */
 if(g18||g19)return{kind:'lathe',sure:true,why:'плоскость G18'};
 if(g17&&hasY)return{kind:'mill',sure:true,why:'плоскость G17 и ось Y'};
 if(lathe&&!hasY)return{kind:'lathe',sure:true,why:'токарные циклы, оси Y нет'};
 if(g17||(mill&&hasY))return{kind:'mill',sure:true,why:g17?'плоскость G17':'фрезерные циклы и ось Y'};
 if(hasY&&hasZ)return{kind:'lathe',sure:false,why:'плоскость не задана, а ось Y есть'};
 return{kind:'lathe',sure:true,why:'оси X и Z без Y'};
}
function open(code,meta){
 const item=payload(code,meta);if(!item.code)return false;
 const d=detectDialect(item.code);item.kind=d.kind;item.dialectSure=d.sure;item.dialectWhy=d.why;
 store(item);
 const name=d.kind==='mill'?'фрезерном эмуляторе':'эмуляторе CNC';
 copyCode(item.code).then(copied=>{if(copied&&typeof window.toast==='function')window.toast('Код скопирован и открыт в '+name)});
 closeOverlays();
 const api=d.kind==='mill'?window.RazryadMill:window.RazryadCNC;
 if(api&&typeof api.openWithCode==='function')return api.openWithCode(item.code,item);
 location.href=d.kind==='mill'?'./chpu.html?open=mill':'./chpu.html?open=emulator';return true;
}
/* Годится ли текст в качестве NC-программы — для обоих эмуляторов. */
function looksLikeNc(code){
 const s=String(code||'').toUpperCase();
 if(!/\bG0?[0-3]\b/.test(s))return false;
 const x=/\bX[-+]?[\d.]/.test(s),y=/\bY[-+]?[\d.]/.test(s),z=/\bZ[-+]?[\d.]/.test(s);
 return(x&&z)||(x&&y)||(y&&z);
}
/* прежнее имя: на него могли ссылаться сторонние вызовы */
function looksLikeLatheNc(code){return looksLikeNc(code)}
function enhanceCodeBlocks(root){
 (root||document).querySelectorAll('pre.blk, pre#gcode, pre[data-nc-code]').forEach((pre,index)=>{
  if(pre.dataset.emulatorReady==='1'||!looksLikeNc(pre.textContent))return;pre.dataset.emulatorReady='1';
  const kind=detectDialect(pre.textContent).kind;
  const bar=document.createElement('div');bar.className='cnc-emu-actions';
  bar.innerHTML='<button type="button" class="cnc-emu-btn" title="Скопировать код и открыть эмулятор"><span>▶</span> Проверить в '+(kind==='mill'?'фрезерном эмуляторе':'эмуляторе CNC')+'</button>';
  bar.querySelector('button').onclick=e=>{e.preventDefault();e.stopPropagation();open(pre.textContent,{title:pre.id==='gcode'?'Сгенерированная программа':`Пример NC ${index+1}`,source:location.pathname});};
  pre.insertAdjacentElement('afterend',bar);
 });
}
function observe(){
 enhanceCodeBlocks(document);
 if(!window.MutationObserver)return;
 new MutationObserver(list=>{for(const m of list){const target=m.target&&m.target.nodeType===1?m.target:m.target&&m.target.parentElement;if(target)enhanceCodeBlocks(target.matches&&target.matches('pre')?target.parentElement:target);for(const node of m.addedNodes)if(node.nodeType===1)enhanceCodeBlocks(node.matches&&node.matches('pre')?node.parentElement:node)}}).observe(document.body,{childList:true,characterData:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe);else observe();
window.RazryadEmulator={KEY,open,store,peek,take,copyCode,closeOverlays,enhanceCodeBlocks,detectDialect,looksLikeNc,looksLikeLatheNc,h};
})();
