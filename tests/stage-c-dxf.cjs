/* Этап C, пункт 17 — импорт DXF. До этого на разбор чертежа не было ни одного теста,
   а сам разбор молча читал дюймы как миллиметры, брал линии рамки за контур детали
   и подставлял выдуманную деталь, когда контур не находился. */
const fs=require('fs'),vm=require('vm');

class E{constructor(){this.value='';this.innerHTML='';this.textContent='';this.checked=false;this.disabled=false;this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.files=[];}addEventListener(){}querySelectorAll(){return[]}querySelector(){return null}appendChild(){}remove(){}click(){}focus(){}setAttribute(){}insertAdjacentHTML(){}getContext(){return new Proxy({},{get:()=>()=>{}})}}
const els=new Map(),get=s=>{if(!els.has(s))els.set(s,new E());return els.get(s)};
const store=new Map();
const document={querySelector:get,querySelectorAll:()=>[],createElement:()=>new E(),head:new E(),body:new E(),addEventListener(){}};
const ctx=vm.createContext({console,document,navigator:{},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 location:{reload(){},href:''},URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},Blob,TextDecoder,
 setTimeout:fn=>{if(typeof fn==='function')fn();return 1},clearTimeout(){},requestAnimationFrame:()=>1,
 cancelAnimationFrame(){},performance:{now:()=>0},alert(){},confirm:()=>true});
ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.scrollTo=()=>{};

const html=fs.readFileSync('generator.html','utf8');
const scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
vm.runInContext(scripts[scripts.length-1],ctx,{filename:'generator-inline.js'});

let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};
const parse=t=>vm.runInContext('parseDxf('+JSON.stringify(t)+')',ctx);
const segs=p=>vm.runInContext('pointsToSegments('+JSON.stringify(p)+')',ctx);
const fails=(t,frag,msg)=>{
 n++;
 let err=null;
 try{parse(t)}catch(e){err=e.message}
 if(!err)throw new Error(msg+' — файл принят вместо отказа');
 if(frag&&!err.includes(frag))throw new Error(msg+' — отказ по другой причине: '+err);
};

/* Сборка минимального ASCII DXF. */
const NL='\n';
const dxf=(insunits,entities,extra)=>[
 '0','SECTION','2','HEADER',
 ...(insunits==null?[]:['9','$INSUNITS','70',String(insunits)]),
 ...(extra||[]),
 '0','ENDSEC','0','SECTION','2','ENTITIES',
 ...entities,
 '0','ENDSEC','0','EOF'
].join(NL);
/* Ступенчатый вал: Ø30 на 40 мм, затем Ø50 на 30 мм, ось по Y=0. */
const line=(layer,x1,y1,x2,y2)=>['0','LINE','8',layer,'10',String(x1),'20',String(y1),'11',String(x2),'21',String(y2)];
const SHAFT=[].concat(
 line('КОНТУР',0,15,40,15),
 line('КОНТУР',40,15,40,25),
 line('КОНТУР',40,25,70,25));

/* --- единицы --- */
{
 const r=parse(dxf(4,SHAFT));
 assert(r.unitsName==='миллиметры','единицы миллиметров не распознаны');
 assert(r.points.length>=3,'контур в миллиметрах не разобран');
 const d=r.points.map(p=>Math.round(p.x));
 assert(d.includes(30)&&d.includes(50),'диаметры прочитаны неверно: '+d.join(','));
}
{
 /* Тот же чертёж в дюймах должен дать те же числа после перевода. */
 const inch=[].concat(
  line('КОНТУР',0,15/25.4,40/25.4,15/25.4),
  line('КОНТУР',40/25.4,15/25.4,40/25.4,25/25.4),
  line('КОНТУР',40/25.4,25/25.4,70/25.4,25/25.4));
 const r=parse(dxf(1,inch));
 assert(r.unitsName==='дюймы','дюймы не распознаны');
 const d=r.points.map(p=>Math.round(p.x));
 assert(d.includes(30)&&d.includes(50),'дюймовый чертёж не переведён в миллиметры: '+d.join(','));
}
fails(dxf(null,SHAFT),'не объявлены единицы','DXF без $INSUNITS');
fails(dxf(0,SHAFT),'безразмерным','DXF с $INSUNITS = 0');
fails(dxf(99,SHAFT),'не распознаны','DXF с неизвестным кодом единиц');

/* --- слои оформления --- */
{
 /* Рамка и размерные линии не должны попадать в профиль. */
 const withFrame=[].concat(
  line('РАМКА',-200,-200,200,-200),
  line('DIM',0,80,70,80),
  SHAFT);
 const r=parse(dxf(4,withFrame));
 assert(!r.layers.includes('РАМКА')&&!r.layers.includes('DIM'),'слои оформления попали в контур: '+r.layers.join(','));
 assert(r.layers.includes('КОНТУР'),'слой детали потерян');
 const d=r.points.map(p=>Math.round(p.x));
 assert(!d.includes(400)&&!d.includes(160),'линии рамки и размеров вошли в профиль: '+d.join(','));
}
fails(dxf(4,[].concat(line('РАМКА',0,15,40,15),line('DIM',40,15,40,25))),'слоях оформления','чертёж только из оформления');

/* --- ось детали --- */
/* Проверить положение оси вычислением нельзя: полупрофиль на Y 15…25 и контур на
   Y 115…125 — одинаково законные детали Ø30…50 и Ø230…250. Поэтому приложение обязано
   не угадывать, а показать оператору получившиеся диаметры и длину. */
{
 const r=parse(dxf(4,SHAFT));
 assert(Math.round(r.dMin)===30&&Math.round(r.dMax)===50,`границы диаметров не сообщаются: ${r.dMin}…${r.dMax}`);
 assert(Math.round(r.length)===70,'длина контура не сообщается: '+r.length);
 const far=parse(dxf(4,[].concat(
  line('КОНТУР',0,115,40,115),
  line('КОНТУР',40,115,40,125),
  line('КОНТУР',40,125,70,125))));
 assert(Math.round(far.dMin)===230,'контур в стороне от оси должен честно дать Ø230, а не быть отвергнут наугад');
}

/* --- устойчивость разбора пар --- */
{
 /* Комментарий 999 в начале файла раньше сдвигал все пары и ломал разбор целиком. */
 const withComment='999'+NL+'Экспорт из CAD'+NL+dxf(4,SHAFT);
 const r=parse(withComment);
 assert(r.points.length>=3,'комментарий 999 в начале файла ломает разбор');
}
{
 const withBlank=NL+NL+dxf(4,SHAFT);
 const r=parse(withBlank);
 assert(r.points.length>=3,'пустые строки в начале файла ломают разбор');
}
fails('это просто текст, а не DXF','не похоже на текстовый DXF','произвольный текст');

/* --- отказ вместо выдуманной детали --- */
{
 n++;
 let err=null;
 try{segs([{z:0,x:30},{z:0,x:45}])}catch(e){err=e.message}
 if(!err)throw new Error('pointsToSegments вернул ступени там, где их нет');
 if(!err.includes('одной координате Z'))throw new Error('отказ по другой причине: '+err);
}
{
 const out=segs([{z:0,x:30},{z:-40,x:30},{z:-40,x:50},{z:-70,x:50}]);
 assert(out.length>=2,'нормальный контур не разобран в ступени');
 assert(out.every(s=>s.d>0&&s.l>0),'в ступенях появились нулевые размеры');
}
{
 /* Ø30×40 + Ø45×60 остаётся законным пресетом шаблона «вал», который оператор выбирает
    сам. Недопустим был именно молчаливый откат к нему при неудачном разборе DXF. */
 const src=fs.readFileSync('generator.html','utf8');
 assert(!/a\.slice\(0,8\)\.length\?a\.slice\(0,8\):/.test(src),'в pointsToSegments остался молчаливый откат к выдуманной детали');
 assert(/function pointsToSegments[\s\S]{0,600}throw new Error/.test(src),'pointsToSegments должен отказывать, а не возвращать заглушку');
}
{
 /* Неудачный импорт не должен трогать уже введённые оператором ступени. */
 vm.runInContext("state.segments=[{d:11,l:22}];state.template='shaft';",ctx);
 try{parse(dxf(null,SHAFT))}catch(_){}
 const after=vm.runInContext('JSON.stringify(state.segments)+"|"+state.template',ctx);
 assert(after==='[{"d":11,"l":22}]|shaft','отклонённый DXF затёр введённые размеры: '+after);
}

console.log(`этап C — импорт DXF: OK (${n} проверок)`);
