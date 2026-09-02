/* Проверка съёма металла в эмуляторе CNC: точение, подрезка, сверление, расточка,
   канавка, резьба и черновые циклы. Модель — радиальное поле по Z, поэтому каждую
   операцию проверяем по фактическому профилю заготовки, а не по числу кадров. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class E{constructor(s=''){this.s=s;this.value='';this.innerHTML='';this.textContent='';this.checked=false;this.dataset={};this.style={};this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.parentElement=this;this.offsetWidth=400;this.clientWidth=400;this.width=900;this.height=260;}addEventListener(){}querySelector(){return null}querySelectorAll(){return[]}setAttribute(){}focus(){}click(){}appendChild(){}insertAdjacentHTML(){}remove(){}getBoundingClientRect(){return{width:400,height:220}}getContext(){return new Proxy({createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}},measureText(){return{width:10}}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)})}}
const els=new Map(),get=s=>{if(!els.has(s))els.set(s,new E(s));return els.get(s)};
const local=new Map(),localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
const document={querySelector:get,querySelectorAll:()=>[],createElement:t=>new E(t),head:new E('head'),body:new E('body'),addEventListener(){}};
const ctx=vm.createContext({console,document,localStorage,navigator:{},history:{pushState(){},back(){},replaceState(){}},location:{href:'',search:'',pathname:'/'},Event:function(){},Blob,URL:{createObjectURL(){return'blob:x'},revokeObjectURL(){}},URLSearchParams,confirm:()=>true,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},innerWidth:412,innerHeight:800,matchMedia:()=>({matches:false}),Date});
ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.scrollTo=()=>{};
const html=fs.readFileSync(path.join(root,'chpu.html'),'utf8');
const scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
vm.runInContext(scripts[scripts.length-1],ctx,{filename:'chpu-inline.js'});
['operator-tools.js','chpu-v99.js','lathe-sim-v99.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f}));
const CNC=ctx.RazryadCNC;

let checks=0;
const assert=(v,m)=>{checks++;if(!v)throw new Error(m)};
const near=(a,b,tol,m)=>{checks++;if(!(Math.abs(a-b)<=tol))throw new Error(m+': ожидалось '+b+'±'+tol+', получено '+a)};

const head='G21 G18 G40 G99\nG50 S2500\nG97 S800 M03\n';
/* профиль заготовки после всей программы */
const runNC=(code,over)=>{
 const cfg={...CNC.defaults(),stockD:60,length:100,grip:20,boreD:0,...(over||{})};
 const res=CNC.parseGcode(code,cfg);
 return{cfg,res,mat:CNC.stockProfile(res,cfg,res.segments.length,0)};
};
/* наружный и внутренний радиус в конкретной точке Z */
const at=(mat,z)=>{const k=Math.max(0,Math.min(mat.z.length-1,Math.round((z-mat.z[0])/mat.step)));return{outer:mat.outer[k],inner:mat.inner[k]};};
const tool=(station,over)=>({[station]:{station,kind:'cnmg',operation:'external',diameter:0,workingLength:40,bodyD:25,minBore:0,nose:.8,pointAngle:0,insertWidth:3,maxDepth:0,confirmed:true,...over}});

/* ---------- 1. Продольное точение: съём ровно на пройденном участке ---------- */
{
 const r=runNC(head+'T0101\nG00 X44. Z2.\nG01 Z-40. F0.2\nG00 X70.\nM30');
 near(at(r.mat,-20).outer,22,.05,'Продольное точение не вышло на Ø44');
 near(at(r.mat,-39).outer,22,.05,'Точение не дошло до конца участка');
 near(at(r.mat,-45).outer,30,.05,'Точение сняло металл за пределами хода');
}
/* ---------- 2. Подрезка торца: слой снимается от плоскости реза до торца ---------- */
{
 const r=runNC(head+'T0101\nG00 X64. Z-3.\nG01 X0. F0.15\nG00 X64.\nZ5.\nM30');
 assert(at(r.mat,-1).outer<1,'Подрезка торца не сняла слой перед плоскостью реза');
 near(at(r.mat,-6).outer,30,.05,'Подрезка съела металл глубже плоскости реза');
}
/* ---------- 3. Радиальный проход не стирает ступень большего диаметра ---------- */
{
 const r=runNC(head+'T0101\nG00 X40. Z-30.\nG01 X10. F0.15\nG00 X70.\nZ5.\nM30');
 near(at(r.mat,-10).outer,30,.05,'Радиальный проход стёр нетронутую ступень до самого торца');
}
/* ---------- 4. Сверление G81: диаметр, глубина и конус при вершине ---------- */
{
 const drill={toolConfigs:tool(3,{kind:'drill',operation:'drill',diameter:20,workingLength:120,bodyD:20,nose:0,pointAngle:118})};
 const r=runNC(head+'T0303\nG00 X0. Z5.\nG81 Z-40. F0.1\nG00 Z20.\nM30',drill);
 assert(r.res.stats.bad===0,'Корректный цикл сверления забракован: '+r.res.issues.filter(i=>i.type==='bad').map(i=>i.text).join('; '));
 near(at(r.mat,-5).inner,10,.05,'Сверление не дало полный радиус отверстия');
 near(at(r.mat,-33).inner,10,.05,'Отверстие не дошло до цилиндрической части');
 /* конус 118° даёт заборную часть 0,3⌀ = 6 мм, поэтому у самого дна радиус ещё не полный */
 assert(at(r.mat,-38).inner<9.5&&at(r.mat,-38).inner>0,'Дно отверстия нарисовано плоским: конуса при вершине нет');
 near(at(r.mat,-41).inner,0,.05,'Сверло сняло металл глубже заданной точки Z');
 near(at(r.mat,-20).outer,30,.05,'Сверление изменило наружный диаметр');
}
/* ---------- 5. G83 с клевками даёт тот же профиль, что и сплошное G81 ---------- */
{
 const drill={toolConfigs:tool(3,{kind:'drill',operation:'drill',diameter:12,workingLength:120,bodyD:12,nose:0,pointAngle:140})};
 const a=runNC(head+'T0303\nG00 X0. Z2.\nG81 Z-45. F0.1\nG00 Z20.\nM30',drill).mat;
 const b=runNC(head+'T0303\nG00 X0. Z2.\nG83 Z-45. Q6000 F0.1\nG00 Z20.\nM30',drill).mat;
 let worst=0;for(let i=0;i<a.inner.length;i++)worst=Math.max(worst,Math.abs(a.inner[i]-b.inner[i]));
 near(worst,0,.02,'Сверление с клевками G83 дало не тот профиль, что сплошное G81');
}
/* ---------- 6. Метчик режет резьбу, а не диаметр ---------- */
{
 const tap={stock:'tube',boreD:8.5,operation:'boring',toolConfigs:tool(4,{kind:'tap',operation:'tap',diameter:10,workingLength:60,bodyD:10,minBore:8.5,nose:0,pointAngle:0})};
 const r=runNC(head+'T0404\nG00 X0. Z5.\nG01 Z-20. F1.5\nG00 Z20.\nM30',tap);
 near(at(r.mat,-10).inner,4.25,.05,'Метчик рассверлил отверстие: он режет резьбу, а не диаметр');
}
/* ---------- 7. Расточка: растёт только отверстие и только на пройденном Z ---------- */
{
 const bore={operation:'boring',stock:'tube',boreD:20,targetD:26,toolConfigs:tool(2,{kind:'ccmt',operation:'boring',bodyD:16,workingLength:80,minBore:20,nose:.4})};
 const r=runNC(head+'T0202\nG00 X18. Z2.\nG01 X26. Z-1. F0.12\nZ-35.\nG00 X18.\nZ5.\nM30',bore);
 near(at(r.mat,-20).inner,13,.05,'Расточка не вышла на Ø26');
 near(at(r.mat,-40).inner,10,.05,'Расточка ушла за конечную точку Z');
 near(at(r.mat,-20).outer,30,.05,'Расточка изменила наружный диаметр');
}
/* ---------- 8. Канавка G75: ширина по пластине, глубина по X ---------- */
{
 const gr={toolConfigs:tool(6,{kind:'mgmn',operation:'groove',workingLength:30,bodyD:20,nose:.2,insertWidth:3,maxDepth:15})};
 const r=runNC(head+'T0606\nG00 X62. Z-25.\nG75 R0.5\nG75 X46. Z-25. P1500 F0.08\nG00 X70.\nM30',gr);
 near(at(r.mat,-25).outer,23,.2,'Канавка не прорезана на заданную глубину');
 near(at(r.mat,-30).outer,30,.05,'Канавка шире пластины: металл снят там, где резца не было');
 near(at(r.mat,-20).outer,30,.05,'Канавка шире пластины с другой стороны');
}
/* ---------- 9. Цикл G71 + G70: итоговый контур совпадает с деталью ---------- */
{
 const r=runNC(head+'T0101\nG00 X64. Z2.\nG71 U2. R0.5\nG71 P100 Q200 U0.4 W0.1 F0.25\nN100 G00 X30.\nG01 Z0. F0.2\nZ-30.\nX44.\nZ-60.\nN200 X64.\nG70 P100 Q200\nG00 X100. Z50.\nM30');
 assert(r.res.segments.some(s=>s.cycle==='G71'&&s.cutting),'G71 не раскрыт в черновые проходы');
 assert(r.res.segments.some(s=>s.cycle==='G70'&&s.cutting),'G70 не раскрыт в чистовой проход');
 near(at(r.mat,-15).outer,15,.25,'После G71+G70 первая ступень не вышла на Ø30');
 near(at(r.mat,-45).outer,22,.25,'После G71+G70 вторая ступень не вышла на Ø44');
 near(at(r.mat,-70).outer,30,.1,'G71 снял металл за пределами контура');
}
/* ---------- 10. Дуга G02 строится по радиусу, а не хордой ---------- */
{
 const r=runNC(head+'T0101\nG00 X30. Z2.\nG01 Z0. F0.2\nG02 X50. Z-10. R10. F0.15\nG00 X70.\nM30');
 const arc=r.res.segments.find(s=>s.arc&&s.cutting);
 assert(arc&&arc.points.length>8,'Дуга G02 не разбита на точки');
 const cz=arc.points[0].z,cx=arc.points[arc.points.length-1].x/2;
 arc.points.forEach(p=>near(Math.hypot(p.z-cz,p.x/2-cx),10,.15,'Точка дуги ушла с радиуса R10'));
}
/* ---------- 11. Резьба G76: проходы идут вглубь до заданного Ø ---------- */
{
 const thr={toolConfigs:tool(5,{kind:'thread',operation:'thread',workingLength:35,bodyD:20,nose:.1,pointAngle:60})};
 const r=runNC(head+'T0505\nG00 X32. Z5.\nG76 P010060 Q100 R0.05\nG76 X27.4 Z-25. P1300 Q300 F2.0\nG00 X70.\nM30',thr);
 const passes=r.res.segments.filter(s=>s.cycle==='G76'&&s.cutting);
 assert(passes.length>=3,'G76 не раскрыт в проходы резьбы');
 const depths=passes.map(s=>s.to.x);
 assert(depths.every((d,i)=>i===0||d<=depths[i-1]+1e-6),'Проходы G76 не идут вглубь монотонно');
 near(depths[depths.length-1],27.4,.02,'Последний проход G76 не вышел на заданный Ø');
}
/* ---------- 12. Инкрементальный резак совпадает с полным пересчётом ---------- */
{
 const cfg={...CNC.defaults(),stockD:80,length:150,grip:30,boreD:0};
 const res=CNC.parseGcode(head+'T0101\nG00 X84. Z2.\nG71 U1. R0.5\nG71 P100 Q200 U0.4 W0.1 F0.25\nN100 G00 X30.\nG01 Z0. F0.2\nX40. Z-6.\nZ-40.\nX60.\nN200 Z-100.\nG70 P100 Q200\nG00 X200. Z100.\nM30',cfg);
 const cutter=CNC.makeCutter(res,cfg);
 [0,.25,.5,.75,1].forEach(q=>{
  const idx=Math.floor(res.segments.length*q),inc=cutter.at(idx,.4),full=CNC.stockProfile(res,cfg,idx,.4);
  let worst=0;for(let i=0;i<full.outer.length;i++)worst=Math.max(worst,Math.abs(full.outer[i]-inc.outer[i]),Math.abs(full.inner[i]-inc.inner[i]));
  near(worst,0,1e-9,'Инкрементальный съём разошёлся с полным пересчётом на кадре '+idx);
 });
 /* и назад по программе — там резак откатывается на опорный снимок */
 const back=cutter.at(3,0),ref=CNC.stockProfile(res,cfg,3,0);
 let worst=0;for(let i=0;i<ref.outer.length;i++)worst=Math.max(worst,Math.abs(ref.outer[i]-back.outer[i]));
 near(worst,0,1e-9,'Перемотка назад дала не тот профиль');
}
/* ---------- 13. Пруток остаётся сплошным: поле «исходный Ø» его не сверлит ---------- */
{
 const r=runNC(head+'T0101\nG00 X50. Z2.\nG01 Z-20. F0.2\nG00 X70.\nM30',{boreD:25,stock:'solid',operation:'external'});
 near(at(r.mat,-10).inner,0,1e-9,'В сплошном прутке появилось отверстие, которого никто не сверлил');
}
/* ---------- 14. Каждая станция T режет своим инструментом ---------- */
{
 const cfg={...CNC.defaults(),stockD:60,length:100,grip:20,boreD:0,
  toolConfigs:{...tool(1),...tool(3,{kind:'drill',operation:'drill',diameter:16,workingLength:120,bodyD:16,nose:0,pointAngle:118})}};
 const res=CNC.parseGcode(head+'T0101\nG00 X50. Z2.\nG01 Z-30. F0.2\nG00 X100. Z50.\nT0303\nG00 X0. Z5.\nG81 Z-40. F0.1\nG00 Z20.\nM30',cfg);
 const mat=CNC.stockProfile(res,cfg,res.segments.length,0);
 near(at(mat,-15).outer,25,.05,'Первая станция не проточила наружный Ø');
 near(at(mat,-15).inner,8,.05,'Вторая станция не просверлила отверстие');
 assert(res.segments.filter(s=>s.cutting&&s.operation==='drill').length>0,'Кадры сверления не получили операцию станции T03');
}
/* ---------- 15. Быстрый ход G0 металл не снимает ---------- */
{
 const r=runNC(head+'T0101\nG00 X40. Z2.\nG00 Z-40.\nG00 X70.\nM30');
 near(at(r.mat,-20).outer,30,1e-9,'Быстрый ход G0 снял металл');
}
/* ---------- 16. Крайний столбец сетки у торца тоже срезается ---------- */
{
 /* Проход начинается выше торца: выборка по длине пути никогда не попадала ровно
    в Z0 и оставляла там кольцо в один шаг сетки — следующий отвод считался ударом. */
 const r=runNC(head+'T0101\nG00 X44. Z6.\nG01 Z-40. F0.2\nG00 X70.\nZ20.\nM30',{length:450,stockD:60,grip:25});
 near(at(r.mat,0).outer,22,.05,'Столбец сетки у самого торца остался нетронутым');
 assert(r.res.stats.bad===0,'Отвод после прохода ложно засчитан как удар: '+r.res.issues.filter(i=>i.type==='bad').map(i=>i.text).join('; '));
}
/* ---------- 16b. Удар ищется по всему силуэту кромки, а не по одному числу ---------- */
{
 /* Скалярный допуск «смещение кромки в плоскости программной точки» пропускал удар:
    при ходе вдоль Z самая низкая точка кромки лежит на rε дальше по Z, и там резец
    достаёт ровно до заданного радиуса. Зазор меньше радиуса при вершине — уже удар. */
 [59.2,59.4,59.6,59.8].forEach(d=>{
  const r=runNC(head+'G00 X'+d+' Z2.\nG00 Z-40.\nG00 X70.\nM30');
  assert(r.res.issues.some(i=>i.type==='bad'&&i.text.includes('пересекает')),
   'Быстрый ход вдоль Z в прутке Ø60 на Ø'+d+' не помечен ударом: зазор меньше радиуса при вершине');
 });
 /* но честные ходы тревоги не поднимают */
 const clean=runNC(head+'G00 X44. Z2.\nG01 Z-40. F0.2\nG00 X70.\nZ2.\nG00 X44.5\nZ-40.\nG00 X70.\nM30');
 assert(clean.res.stats.bad===0,'Быстрый ход над уже проточенной поверхностью ложно помечен: '
  +clean.res.issues.filter(i=>i.type==='bad').map(i=>i.text).join('; '));
}
/* ---------- 16c. Частичный проход не снимает больше полного ---------- */
{
 /* Перемотка не должна менять деталь: металл, снятый на середине кадра, обязан
    остаться подмножеством снятого этим же кадром целиком. Ломалось на конусах и
    дугах, когда сетка выборки считалась от пройденной длины и точки частичного
    прохода ложились между точками полного. */
 const cfg={...CNC.defaults(),stockD:60,length:120,grip:25,boreD:0};
 const res=CNC.parseGcode(head+'G00 X64. Z2.\nG01 X46. Z0. F0.2\nZ-30.\nX52. Z-40.\nZ-60.\n'
  +'G02 X58. Z-66. R6.\nG01 X62.\nG00 X70.\nZ5.\nM30',cfg);
 let worst=0;
 for(let i=0;i<res.segments.length;i++){
  const full=CNC.stockProfile(res,cfg,i+1,0);
  [0,.15,.35,.5,.75,.95].forEach(q=>{
   const part=CNC.stockProfile(res,cfg,i,q);
   for(let k=0;k<full.outer.length;k++){
    worst=Math.max(worst,full.outer[k]-part.outer[k],part.inner[k]-full.inner[k]);
   }
  });
 }
 /* остаток — сама точка, где инструмент стоит: она в полный проход попадает между
    узлами сетки. Держим его на уровне единиц микрон. */
 assert(worst<=.005,'Частичный проход снял больше полного на '+(worst*1000).toFixed(1)+' мкм');
}
/* ---------- 17. Реальная программа с постпроцессора проходит без ложных ударов ---------- */
{
 const code=fs.readFileSync(path.join(root,'samples','turning-demo.nc'),'utf8');
 const base={...CNC.defaults()};
 const fit=CNC.inferStock(CNC.parseGcode(code,base),base);
 const cfg={...base,...fit};
 const res=CNC.parseGcode(code,cfg);
 near(fit.stockD,495,.01,'Заготовка для учебного примера подобрана неверно');
 assert(res.stats.bad===0,'Учебный пример точения выдал ложные ошибки: '+res.issues.filter(i=>i.type==='bad').map(i=>i.line+': '+i.text).join('; '));
}
/* ---------- 18. Внутренняя канавка режет отверстие, а не наружный Ø ---------- */
{
 const gr={stock:'tube',boreD:26,operation:'boring',
  toolConfigs:tool(7,{kind:'mgivr',operation:'groove',workingLength:60,bodyD:16,minBore:22,nose:.2,insertWidth:2,maxDepth:8})};
 const r=runNC(head+'T0707\nG00 X24. Z-15.\nG01 X32. F0.06\nG01 X24. F0.3\nG00 Z10.\nM30',gr);
 near(at(r.mat,-15).inner,16,.1,'Внутренний канавочный резец не расширил отверстие');
 near(at(r.mat,-15).outer,30,.05,'Внутренний канавочный резец срезал наружный диаметр');
 near(at(r.mat,-25).inner,13,.05,'Внутренняя канавка вышла за ширину пластины');
}
/* ---------- 19. Подрезка торца через центр — штатный кадр, а не ошибка ---------- */
{
 /* На станке торец подрезают до X-0,5…X-2, чтобы не осталась пуговка по центру.
    Такой кадр должен и срезать металл, и не блокировать проверку программы. */
 const r=runNC(head+'T0101\nG00 X64. Z0.\nG01 X-1. F0.15\nG00 X64.\nZ5.\nM30');
 assert(r.res.stats.bad===0,'Штатная подрезка торца через центр забракована: '+r.res.issues.filter(i=>i.type==='bad').map(i=>i.text).join('; '));
 assert(r.res.issues.some(i=>i.type==='warn'&&i.text.includes('через ось')),'Переход через ось должен оставаться замечанием');
 /* явная описка в знаке металл не снимает и остаётся ошибкой */
 const bad=runNC(head+'T0101\nG00 X64. Z2.\nG01 X-10. Z-20. F0.2\nM30');
 near(Math.min(...bad.mat.outer),30,1e-9,'Кадр с явно ошибочным знаком X снял металл зеркально');
 assert(bad.res.stats.bad>0,'Явная описка в знаке X не помечена ошибкой');
}
/* ---------- 20. Подвод в плоскости торца — не удар ---------- */
{
 /* Материал занимает Z<0: ход ровно по Z0 его не пересекает, а это стандартный
    подвод перед подрезкой. Раньше он попадал в «G00 пересекает поверхность». */
 const r=runNC(head+'T0101\nG00 X40. Z0.\nG01 X-1. F0.15\nG00 X70.\nZ5.\nM30');
 assert(!r.res.issues.some(i=>i.type==='bad'&&i.text.includes('пересекает')),'Подвод в плоскости торца засчитан как удар');
 /* но реальный въезд в металл на Z<0 по-прежнему ловится */
 const hit=runNC(head+'T0101\nG00 X20. Z-10.\nG01 Z-30. F0.2\nM30');
 assert(hit.res.issues.some(i=>i.type==='bad'&&i.text.includes('пересекает')),'Быстрый ход внутрь металла перестал определяться');
}
/* ---------- 21. Поля учебного контура не блокируют разбор NC ---------- */
{
 /* Подобранная по программе заготовка легко становится меньше «второго Ø ступени»
    из учебной формы. Раньше это молча останавливало проверку загруженной NC. */
 const cfg={...CNC.defaults(),operation:'external',contour:'step',stockD:50,targetD:45,stepD:54,stepLen:42};
 assert(CNC.validate(cfg).errors.length>0,'Учебная модель должна ругаться на ступень шире заготовки');
 assert(CNC.validate(cfg,true).errors.length===0,'Поля учебного контура заблокировали разбор загруженной программы');
}
/* ---------- 22. Подсветка G-кода: адреса получают цвета CIMCO ---------- */
if(CNC.highlightGcode){
 const html=CNC.highlightGcode('N10 G01 X25. Z-3.5 F0.2 (ЧИСТОВОЙ)');
 assert(/gk-G/.test(html)&&/gk-X/.test(html)&&/gk-Z/.test(html),'Адреса G/X/Z не размечены для подсветки');
 assert(/gk-comment/.test(html),'Комментарий в скобках не размечен');
 assert(!/<script/i.test(CNC.highlightGcode('<script>alert(1)</script>')),'Подсветка не экранирует разметку');
}

/* ============================================================
   Геометрия режущей части: рисунок и рез берутся из одного силуэта
   ============================================================ */

/* ---------- 23. Радиус при вершине оставляет галтель во внутреннем углу ---------- */
{
 /* Уступ на Z-30 у резца с радиусом вершины не может выйти острым: в углу
    остаётся галтель, и она тем больше, чем больше rε. Ради этого и включают G41/G42. */
 const fillet=nose=>{
  const r=runNC(head+'T0101\nG00 X44. Z2.\nG01 X40. Z0. F0.2\nZ-30.\nX64.\nG00 X70. Z5.\nM30',
   {toolConfigs:tool(1,{nose})});
  return at(r.mat,-30).outer-20;
 };
 const f04=fillet(.4),f08=fillet(.8),f12=fillet(1.2);
 assert(f04>.05,'Радиус вершины 0,4 не оставил галтели в углу уступа');
 assert(f08>f04&&f12>f08,'Галтель в углу не растёт вместе с радиусом вершины: '+[f04,f08,f12].join(' / '));
 assert(f12<1.3,'Галтель больше самого радиуса вершины: '+f12);
 near(at(runNC(head+'T0101\nG00 X44. Z2.\nG01 X40. Z0. F0.2\nZ-30.\nX64.\nG00 X70. Z5.\nM30',
  {toolConfigs:tool(1,{nose:.8})}).mat,-25).outer,20,.02,'Цилиндр должен выходить ровно на заданный Ø');
}
/* ---------- 24. G42 выводит конус на чертёж, без компенсации остаётся припуск ---------- */
{
 const prog=(comp)=>head+'T0101\nG00 X44. Z2.\n'+(comp?'G42 ':'')+'G01 X40. Z0. F0.2\nX50. Z-10.\n'+(comp?'G40 ':'')+'G00 X70.\nM30';
 const on=runNC(prog(true),{toolConfigs:tool(1,{nose:.8})}),off=runNC(prog(false),{toolConfigs:tool(1,{nose:.8})});
 [-8,-6,-4].forEach(z=>{
  const want=40+Math.abs(z); /* конус 1:1 от Ø40 на Z0 */
  near(at(on.mat,z).outer*2,want,.15,'С G42 конус не вышел на чертёж на Z'+z);
  assert(at(off.mat,z).outer*2>want+.2,'Без компенсации на конусе должен оставаться припуск по радиусу вершины, Z'+z);
 });
}
/* ---------- 25. Канавочный резец режет канавку ровно своей ширины ---------- */
{
 const groove=w=>{
  const r=runNC(head+'T0606\nG00 X62. Z-25.\nG75 R0.5\nG75 X46. Z-25. P1500 F0.08\nG00 X70.\nM30',
   {toolConfigs:tool(6,{kind:'mgmn',operation:'groove',nose:.2,insertWidth:w,maxDepth:15,workingLength:30,bodyD:20})});
  let cut=0;for(let i=0;i<r.mat.z.length;i++)if(r.mat.outer[i]<29)cut+=r.mat.step;
  return{r,width:cut};
 };
 const g2=groove(2),g3=groove(3),g6=groove(6);
 near(g2.width,2,.6,'Пластина 2 мм прорезала канавку не своей ширины');
 near(g3.width,3,.6,'Пластина 3 мм прорезала канавку не своей ширины');
 near(g6.width,6,.6,'Пластина 6 мм прорезала канавку не своей ширины');
 /* программная точка — левый угол пластины: канавка уходит от Z-25 в плюс */
 near(at(g3.r.mat,-24).outer,23,.15,'Канавка не легла от программной точки в сторону +Z');
 near(at(g3.r.mat,-26).outer,30,.05,'Канавка ушла левее программной точки');
}
/* ---------- 26. Резьба оставляет профиль, а не гладкую проточку ---------- */
{
 const r=runNC(head+'T0101\nG00 X64. Z2.\nG01 X30. Z0. F0.2\nZ-30.\nG00 X70. Z5.\n'+
  'T0505\nG00 X32. Z2.\nG76 P010060 Q100 R0.05\nG76 X27.4 Z-20. P1300 Q300 F2.0\nG00 X70.\nM30',
  {toolConfigs:{...tool(1,{nose:.8}),...tool(5,{kind:'thread',operation:'thread',nose:.1,pointAngle:60,workingLength:35,bodyD:20})}});
 const seg=r.res.segments.find(s=>s.cycle==='G76'&&s.cutting);
 near(seg&&seg.threadPitch,2,1e-9,'Шаг резьбы не передан в кадр из адреса F');
 /* впадины стоят через шаг, между ними остаётся вершина профиля */
 const root=Math.min(...[-10,-8,-6].map(z=>at(r.mat,z).outer*2));
 const crest=Math.max(...[-9,-7,-5].map(z=>at(r.mat,z).outer*2));
 near(root,27.4,.2,'Впадина резьбы не вышла на заданный внутренний Ø');
 assert(crest>root+.8,'Резьба срезана в гладкий цилиндр: профиля между витками нет ('+root.toFixed(2)+' / '+crest.toFixed(2)+')');
 near(crest,30,.25,'Вершина профиля должна остаться на наружном Ø детали');
}
/* ---------- 27. Конус при вершине сверла равен 0,3⌀ для угла 118° ---------- */
{
 const drill={toolConfigs:tool(3,{kind:'drill',operation:'drill',diameter:20,workingLength:120,bodyD:20,nose:0,pointAngle:118})};
 const r=runNC(head+'T0303\nG00 X0. Z5.\nG81 Z-40. F0.1\nG00 Z20.\nM30',drill);
 /* полный диаметр начинается на 0,3⌀ = 6 мм выше точки Z */
 near(at(r.mat,-34).inner*2,20,.3,'Отверстие не вышло на полный Ø там, где кончается заборный конус');
 assert(at(r.mat,-37).inner*2<18,'Дно отверстия нарисовано плоским: конуса нет');
 near(at(r.mat,-40.5).inner,0,.3,'Сверло сняло металл глубже заданной точки Z');
}
/* ---------- 28. Силуэт для рисунка и огибающая для реза — из одной геометрии ---------- */
if(CNC.insertGeometry&&CNC.toolEnvelope&&CNC.envAt){
 const specs=[
  ['проходной',{kind:'cnmg',nose:.8},'external'],
  ['расточной',{kind:'ccmt',nose:.4},'boring'],
  ['канавочный',{kind:'mgmn',nose:.2,insertWidth:3,maxDepth:15},'groove'],
  ['резьбовой',{kind:'thread',nose:.1,pointAngle:60},'thread'],
  ['сверло',{kind:'drill',diameter:12,pointAngle:118,workingLength:60},'drill']];
 specs.forEach(([name,spec,op])=>{
  const g=CNC.insertGeometry(spec,op),t=CNC.toolEnvelope(spec,op);
  assert(g.edge.length>2,name+': режущая кромка пустая');
  assert(g.cut.length>2&&g.holder.length>2,name+': нет силуэта пластины или державки');
  assert(t.geom.edge.length===g.edge.length,name+': рисунок и рез строятся по разным кромкам');
  /* каждая точка кромки должна лежать не глубже огибающей: они из одного контура */
  g.edge.forEach(p=>{
   const e=CNC.envAt(t.env,p[0]);
   if(!Number.isFinite(e))return;
   const slack=t.geom.mode==='outer'?p[1]-e:e-p[1];
   assert(slack>-0.06,name+': огибающая расходится с кромкой на '+slack.toFixed(3)+' мм');
  });
  /* программная точка лежит на кромке: у резца это касание дуги при вершине,
     у осевого инструмента — само остриё */
  if(t.geom.mode==='axis')near(CNC.envAt(t.env,0),0,.3,name+': остриё не совпадает с программной точкой');
  else near(t.env.extreme,0,.02,name+': крайняя точка кромки должна совпадать с программной точкой');
 });
}

/* ---------- 29. Каталог: каждая позиция даёт физичный силуэт ---------- */
{
 const L=CNC.TOOL_LIBRARY,keys=Object.keys(L);
 assert(keys.length>=60,'Каталог инструмента не расширен: позиций '+keys.length);
 const groups={};keys.forEach(k=>{groups[L[k].group]=(groups[L[k].group]||0)+1;});
 ['ext','bore','groove','thr','brazed','axial'].forEach(g=>assert(groups[g]>=5,'В группе '+g+' слишком мало позиций: '+(groups[g]||0)));
 keys.forEach(k=>{
  const v=L[k],spec={...v,kind:k},g=CNC.insertGeometry(spec,v.operation),e=CNC.toolEnvelope(spec,v.operation);
  assert(g.edge.length>2,k+': пустая режущая кромка');
  assert(g.cut.length>2&&g.holder.length>2,k+': нет силуэта пластины или державки');
  g.edge.concat(g.cut,g.holder).forEach(p=>assert(Number.isFinite(p[0])&&Number.isFinite(p[1]),k+': NaN в силуэте'));
  assert(e.env.first>=0,k+': огибающая пуста');
  assert(Number.isFinite(e.env.extreme),k+': огибающая не считается');
  /* физичность каталожных размеров */
  if(v.operation==='external'||v.operation==='boring'){
   assert(v.lead>=30&&v.lead<=120,k+': главный угол в плане вне 30–120°');
   if(v.insert!=='round')assert(v.nose>0&&v.nose<=2,k+': радиус вершины вне ряда 0,2–1,6');
  }
  if(v.operation==='groove')assert(v.insertWidth>0&&v.maxDepth>=v.insertWidth,k+': ширина пластины и глубина канавки не согласованы');
  if(['drill','centerdrill','tap'].includes(v.operation))assert(v.diameter>0,k+': осевому инструменту не задан диаметр');
 });
 /* правое и левое исполнение зеркальны по Z */
 const rr=CNC.insertGeometry({...L.cnmg,kind:'cnmg'},'external'),ll=CNC.insertGeometry({...L.cnmg_l,kind:'cnmg_l'},'external');
 assert(rr.hand==='R'&&ll.hand==='L','Левое исполнение не помечено');
 const uR=Math.max(...rr.edge.map(p=>p[0])),uL=Math.min(...ll.edge.map(p=>p[0]));
 assert(uR>0&&uL<0,'Левый резец не зеркален правому по Z: '+uR.toFixed(2)+' / '+uL.toFixed(2));
}
/* ---------- 30. Отбор по каталогу ---------- */
if(CNC.toolOptions){
 const found=CNC.toolOptions('cnmg','MGEHR');
 assert(found.includes('MGEHR'),'Поиск по обозначению державки ничего не нашёл');
 assert(!found.includes('PDJNR'),'Поиск не отсеял лишние позиции');
 assert(found.includes('value="cnmg"'),'Выбранная позиция должна оставаться в списке при любом запросе');
 assert(CNC.toolOptions('cnmg','').split('<option').length-1>=60,'Без запроса должен показываться весь каталог');
}

console.log('lathe machining tests: OK ('+checks+' проверок)');
