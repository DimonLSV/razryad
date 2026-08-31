/* РАЗРЯД 0.993 — единый переход из любого NC-кода в токарный Backplot */
(function(){
'use strict';
const KEY='razryad-backplot-handoff-v1';
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
function open(code,meta){
 const item=payload(code,meta);if(!item.code)return false;store(item);copyCode(item.code).then(copied=>{if(copied&&typeof window.toast==='function')window.toast('Код скопирован и открыт в NC Backplot')});closeOverlays();
 if(window.RazryadLatheSim&&typeof window.RazryadLatheSim.openWithCode==='function')return window.RazryadLatheSim.openWithCode(item.code,item);
 location.href='./chpu.html?open=backplot';return true;
}
function looksLikeLatheNc(code){const s=String(code||'').toUpperCase();return /\bG0?[0-3]\b/.test(s)&&/\bX[-+]?\d/.test(s)&&/\bZ[-+]?\d/.test(s)}
function enhanceCodeBlocks(root){
 (root||document).querySelectorAll('pre.blk, pre#gcode, pre[data-nc-code]').forEach((pre,index)=>{
  if(pre.dataset.backplotReady==='1'||!looksLikeLatheNc(pre.textContent))return;pre.dataset.backplotReady='1';
  const bar=document.createElement('div');bar.className='backplot-bridge-actions';
  bar.innerHTML='<button type="button" class="backplot-bridge-btn" title="Скопировать код и открыть эмулятор"><span>▶</span> Проверить в NC Backplot</button>';
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
window.RazryadBackplot={KEY,open,store,peek,take,copyCode,closeOverlays,enhanceCodeBlocks,looksLikeLatheNc,h};
})();
