/* РАЗРЯД 0.999 — общее ядро обоих эмуляторов ЧПУ.
   Здесь лежит то, что нужно и токарному, и фрезерному: подсветка G-кода,
   мелкие помощники разметки и работы с холстом. Файл подключается ПЕРВЫМ,
   до самих эмуляторов, чтобы ни один из них не зависел от того, загрузился ли
   другой: раньше фрезерный брал подсветку у токарного через window.RazryadCNC
   и молча оставался без неё, если порядок тегов менялся. */
(function(){
'use strict';

/* экранирование текста, попадающего в разметку */
function h(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/* число или ноль: поля ввода отдают строки, и NaN ломал бы геометрию */
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
/* шаг сетки, кратный ряду 1-2-5, чтобы подписи не сливались */
function niceStep(px,k){const list=[.5,1,2,5,10,20,25,50,100,200,500];for(const s of list)if(s*k>=px)return s;return 1000;}
/* прямоугольник со скруглением — рамки подписей на сценах */
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

const GK_THEMES={
 cimco:{bg:'#ffffff',fg:'#000000',gutter:'#f0f0f0',gutterText:'#8a8a8a',current:'#ffffa0',bad:'#ffdcd8',caret:'#c03000',line:'#dcdcdc',
  comment:'#000080',percent:'#800080',skip:'#808080',macro:'#c000c0',
  A:'#ff8040',B:'#ff8040',C:'#ff8000',D:'#000080',E:'#0000ff',F:'#800000',G:'#408080',H:'#0000a0',I:'#0000ff',
  J:'#0080c0',K:'#ff0000',L:'#008080',M:'#008000',N:'#000000',O:'#0000ff',P:'#0000ff',Q:'#00b000',R:'#0000ff',
  S:'#800000',T:'#800000',U:'#0000ff',V:'#0080c0',W:'#ff0000',X:'#0000ff',Y:'#0080c0',Z:'#ff0000'},
 night:{bg:'#0a0e12',fg:'#c9d3da',gutter:'#111820',gutterText:'#5c6b77',current:'#2a1d0c',bad:'#3a1512',caret:'#ff8a34',line:'#22303a',
  comment:'#8896c8',percent:'#d18ad1',skip:'#7c8b96',macro:'#e08ae0',
  A:'#ffa06a',B:'#ffa06a',C:'#ffa63d',D:'#8f9bff',E:'#7c96ff',F:'#ff8f7a',G:'#5fc7c7',H:'#8fa6ff',I:'#7c96ff',
  J:'#4fc0ee',K:'#ff6b5e',L:'#4fd0c8',M:'#5fd07a',N:'#c9d3da',O:'#7c96ff',P:'#7c96ff',Q:'#63e08a',R:'#7c96ff',
  S:'#ff8f7a',T:'#ff8f7a',U:'#7c96ff',V:'#4fc0ee',W:'#ff6b5e',X:'#7c96ff',Y:'#4fc0ee',Z:'#ff6b5e'}
};
/* адреса, которые CIMCO печатает полужирным (в Iso.mac у них старший байт 2 или 3) */
const GK_BOLD='ABCDFGLMNSTZ';
const GK_LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* Стили подсветки собираем из палитры, чтобы цвет адреса задавался в одном месте. */
function gkStyleSheet(){
 const rule=(sel,body)=>sel+'{'+body+'}';
 let css='';
 Object.entries(GK_THEMES).forEach(([name,t])=>{
  const p='.gk[data-gk-theme="'+name+'"] ';
  css+=rule(p.trim(),'background:'+t.bg+';color:'+t.fg);
  css+=rule(p+'.gk-gutter','background:'+t.gutter+';color:'+t.gutterText+';border-right:1px solid '+t.line);
  css+=rule(p+'.gk-line.current','background:'+t.current);
  css+=rule(p+'.gk-line.bad','background:'+t.bad);
  css+=rule(p+'textarea','caret-color:'+t.caret);
  css+=rule(p+'.gk-comment','color:'+t.comment+';font-style:italic');
  css+=rule(p+'.gk-percent','color:'+t.percent+';font-weight:700');
  css+=rule(p+'.gk-skip','color:'+t.skip);
  css+=rule(p+'.gk-macro','color:'+t.macro);
  GK_LETTERS.split('').forEach(L=>{
   css+=rule(p+'.gk-'+L,'color:'+t[L]+(GK_BOLD.includes(L)?';font-weight:700':''));
  });
 });
 return css;
}
function ensureGkStyles(){
 if(document.getElementById('gkSyntaxStyles'))return;
 const el=document.createElement('style');el.id='gkSyntaxStyles';el.textContent=gkStyleSheet();
 (document.head||document.body).appendChild(el);
}

/* Разбор одной строки кадра на цветные лексемы: адрес забирает и своё число,
   как в CIMCO — там значение печатается цветом своей буквы. */
function highlightGcode(text){
 const src=String(text==null?'':text);let out='',i=0;
 const digit=c=>c>='0'&&c<='9';
 while(i<src.length){
  const ch=src[i];
  if(ch==='\n'){out+='\n';i++;continue;}
  if(ch==='('){ /* комментарий в скобках не переходит на следующую строку */
   let j=i+1;while(j<src.length&&src[j]!==')'&&src[j]!=='\n')j++;
   const cut=src[j]===')'?j+1:j;
   out+='<span class="gk-comment">'+h(src.slice(i,cut))+'</span>';i=cut;continue;}
  if(ch===';'){let j=i;while(j<src.length&&src[j]!=='\n')j++;
   out+='<span class="gk-comment">'+h(src.slice(i,j))+'</span>';i=j;continue;}
  if(ch==='%'){out+='<span class="gk-percent">%</span>';i++;continue;}
  if(ch==='/'&&(i===0||src[i-1]==='\n')){out+='<span class="gk-skip">/</span>';i++;continue;}
  if(ch==='#'){let j=i+1;while(j<src.length&&(digit(src[j])||src[j]==='['||src[j]===']'))j++;
   out+='<span class="gk-macro">'+h(src.slice(i,j))+'</span>';i=j;continue;}
  const up=ch.toUpperCase();
  if(up>='A'&&up<='Z'){
   let j=i+1;while(j<src.length&&(src[j]===' '||src[j]==='\t'))j++;
   let k=j;if(src[k]==='+'||src[k]==='-')k++;
   let seen=0;while(k<src.length&&(digit(src[k])||src[k]==='.')){if(digit(src[k]))seen++;k++;}
   const end=seen?k:i+1;
   out+='<span class="gk-'+up+'">'+h(src.slice(i,end))+'</span>';i=end;continue;}
  out+=h(ch);i++;
 }
 return out;
}
/* Построчная разметка: нужна и для номеров кадров, и для подсветки текущей строки и ошибок. */
function highlightGcodeLines(text,opts){
 const o=opts||{},lines=String(text==null?'':text).split(/\r?\n/);
 return lines.map((line,idx)=>{
  const no=idx+1,cls=['gk-line'];
  if(o.active===no)cls.push('current');
  if(o.badLines&&o.badLines.has(no))cls.push('bad');
  return '<span class="'+cls.join(' ')+'">'+(highlightGcode(line)||'&nbsp;')+'</span>';
 }).join('');
}
function gcodeGutter(text,opts){
 const o=opts||{},count=String(text==null?'':text).split(/\r?\n/).length;let out='';
 for(let i=1;i<=count;i++){
  const cls=['gk-num'];if(o.active===i)cls.push('current');if(o.badLines&&o.badLines.has(i))cls.push('bad');
  out+='<span class="'+cls.join(' ')+'">'+i+'</span>';
 }
 return out;
}

window.RazryadSimCore={GK_THEMES,gkStyleSheet,ensureGkStyles,highlightGcode,highlightGcodeLines,gcodeGutter,h,n,niceStep,rounded};
})();
