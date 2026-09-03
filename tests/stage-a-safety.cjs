/* Этап A — регрессии по дефектам, из-за которых опасная программа получала пустой отчёт.
   Каждый случай ниже воспроизводился на версии 0.999 и должен оставаться закрытым. */
const fs=require('fs'),vm=require('vm');

class E{constructor(s=''){this.s=s;this.value='';this.innerHTML='';this.textContent='';this.checked=false;this.dataset={};this.style={};this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.parentElement=this;this.offsetWidth=400;this.clientWidth=400;this.width=900;this.height=260;}addEventListener(){}querySelector(){return null}querySelectorAll(){return[]}setAttribute(){}focus(){}click(){}appendChild(){}insertAdjacentHTML(){}remove(){}getBoundingClientRect(){return{width:400,height:220}}getContext(){return new Proxy({createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}},measureText(){return{width:10}}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)})}}
const els=new Map(),get=s=>{if(!els.has(s))els.set(s,new E(s));return els.get(s)};
const local=new Map(),localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
const document={querySelector:get,querySelectorAll:()=>[],createElement:t=>new E(t),head:new E('head'),body:new E('body'),addEventListener(){}};
const ctx=vm.createContext({console,document,localStorage,navigator:{},history:{pushState(){},back(){}},location:{href:''},Event:function(){},Blob,URL:{createObjectURL(){return'blob:x'},revokeObjectURL(){}},confirm:()=>true,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},innerWidth:412,innerHeight:800});
ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.scrollTo=()=>{};

const html=fs.readFileSync('chpu.html','utf8');
const scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
vm.runInContext(scripts[scripts.length-1],ctx,{filename:'chpu-inline.js'});
vm.runInContext(fs.readFileSync('cnc-sim-core.js','utf8'),ctx,{filename:'cnc-sim-core.js'});
vm.runInContext(fs.readFileSync('operator-tools.js','utf8'),ctx,{filename:'operator-tools.js'});
vm.runInContext(fs.readFileSync('lathe-sim-v99.js','utf8'),ctx,{filename:'lathe-sim-v99.js'});
vm.runInContext(fs.readFileSync('mill-sim-v99.js','utf8'),ctx,{filename:'mill-sim-v99.js'});

const run=s=>vm.runInContext(s,ctx);
let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};

/* ── текстовый аудит программы (operator-tools) ─────────────────────────── */
function audit(code,limit='4000'){
 get('#qaCode').value=code;get('#qaMachine').value=limit;
 const checks=run('RazryadTools.analyzeProgram()');
 return{
  checks,
  bad:checks.filter(x=>x.type==='bad'),
  has:t=>checks.some(x=>(x.title+' '+x.text).includes(t)),
  clean:checks.some(x=>x.title.includes('Критические шаблонные ошибки не найдены'))
 };
}

/* C3 — незакрытая скобка съедала программу до следующей «)», после чего ни одна
   проверка не срабатывала и выдавался зелёный вердикт. */
{
 const r=audit('(PROGRAM O0100\nG50 S2500\nG96 S200 M03\n(T0101 ROUGH)\nG0 X50 Z2\nM30');
 assert(r.has('Незакрытая скобка'),'C3: незакрытая скобка комментария не отмечена');
 assert(!r.clean,'C3: программа с проглоченными кадрами всё ещё получает зелёный вердикт');
 assert(r.has('G50 S2500'),'C3: текст после незакрытой скобки потерян — G50 не найден');
}
/* Обычный закрытый комментарий вырезается и не поднимает ложную тревогу. */
{
 const r=audit('(ROUGH OD)\nG50 S2500\nG97 S800 M03\nG99\nG28 U0. W0.\nT0101\nG00 X50 Z2\nM30');
 assert(!r.has('Незакрытая скобка'),'C3: закрытый комментарий ошибочно принят за незакрытый');
 assert(!r.has('Обороты выше'),'C3: S800 при пределе 4000 не должно быть превышением');
}

/* H5 — G50 без адреса S это установка координат, а не ограничитель оборотов. */
{
 const r=audit('G50 X0 Z0\nG96 S200 M03\nG00 X50 Z2\nM30');
 assert(r.has('G96 без ограничения оборотов'),'H5: G50 без S принят за ограничитель');
 assert(r.has('это установка координат'),'H5: причина не объяснена оператору');
}
{
 const r=audit('G50 S2500\nG96 S200 M03\nG00 X50 Z2\nM30');
 assert(!r.has('G96 без ограничения'),'H5: настоящий ограничитель G50 S2500 не распознан');
 assert(r.has('G50 S2500'),'H5: значение ограничителя не показано');
}
/* Ограничитель выше паспорта станка защитой не является. */
{
 const r=audit('G50 S6000\nG96 S200 M03\nM30','4000');
 assert(r.has('Ограничение G50 выше профиля станка'),'H5: G50 S6000 при пределе 4000 не отмечен');
}

/* H7 — под G96 адрес S задаёт м/мин, а не обороты. */
{
 const r=audit('G50 S2500\nG96 S200 M03\nG00 X50 Z2\nM30','150');
 assert(!r.has('Обороты выше профиля станка'),'H7: скорость резания G96 сравнена с пределом оборотов');
}
{
 const r=audit('G97 S5000 M03\nG00 X50 Z2\nM30','4000');
 assert(r.has('Обороты выше профиля станка'),'H7: настоящее превышение оборотов в G97 пропущено');
}
/* G97 после G96 возвращает трактовку S как оборотов. */
{
 const r=audit('G50 S2500\nG96 S200 M03\nG00 X50 Z2\nG97 S5000\nM30','4000');
 assert(r.has('Обороты выше профиля станка'),'H7: возврат в G97 не переключил трактовку S');
}

/* H6 — компенсация должна отслеживаться по ходу программы, а не «последняя против последней». */
{
 const r=audit('G28 U0. W0.\nT0101\nG42 G00 X50 Z2\nG01 Z-20 F0.2\nG28 U0. W0.\nT0202\nG41 G00 X40\nG01 Z-10\nG40 G00 X60\nM30');
 assert(r.has('Компенсация не отменена'),'H6: незакрытая компенсация на первом инструменте пропущена');
}
{
 const r=audit('T0101\nG42 G00 X50 Z2\nG01 Z-20 F0.2\nG40 G00 X60\nG28 U0. W0.\nM30');
 assert(!r.has('Компенсация не отменена'),'H6: корректно отменённая компенсация помечена как ошибка');
}
/* G41.1 и G410 — не команды компенсации. */
{
 const r=audit('T0101\nG00 X50 Z2\nG410\nM30');
 assert(!r.has('компенсации'),'H6: G410 ошибочно принят за G41');
}

/* ── токарный интерпретатор ─────────────────────────────────────────────── */
const LATHE='G21 G18 G99 G50 S2000\nG97 S800 M03\nG00 X62 Z2\n';
const contour='N100 G00 X50\nG01 Z-20\nN200 X60\n';

/* C2 — в диалекте Fanuc глубины цикла задаются в микронах. Раньше U2000 читалось
   как 2000 мм, шаг прохода становился 4000 мм и цикл не выполнялся ни разу. */
{
 const code=LATHE+'G71 U2000 R500\nG71 P100 Q200 U400 W200 F0.25\n'+contour+'M30';
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},{...RazryadCNC.defaults(),dialect:'fanuc'})`);
 const rough=r.segments.filter(s=>s.cycle==='G71'&&s.cutting).length;
 assert(rough>1,`C2: Fanuc G71 в микронах не развернулся в проходы (получено ${rough})`);
}
/* Та же программа с десятичными точками должна давать сопоставимый результат. */
{
 const a=run(`RazryadCNC.parseGcode(${JSON.stringify(LATHE+'G71 U2000 R500\nG71 P100 Q200 U400 W200 F0.25\n'+contour+'M30')},{...RazryadCNC.defaults(),dialect:'fanuc'})`).segments.filter(s=>s.cycle==='G71'&&s.cutting).length;
 const b=run(`RazryadCNC.parseGcode(${JSON.stringify(LATHE+'G71 U2. R0.5\nG71 P100 Q200 U0.4 W0.2 F0.25\n'+contour+'M30')},{...RazryadCNC.defaults(),dialect:'fanuc'})`).segments.filter(s=>s.cycle==='G71'&&s.cutting).length;
 assert(a===b,`C2: микроны и десятичные точки дают разное число проходов (${a} против ${b})`);
}
/* Haas читает те же адреса в миллиметрах — поведение не должно измениться. */
{
 const code=LATHE+'G71 P100 Q200 U0.4 W0.1 D2 F0.25\n'+contour+'M30';
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},RazryadCNC.defaults())`);
 assert(r.segments.filter(s=>s.cycle==='G71'&&s.cutting).length>1,'C2: обычный Haas G71 перестал разворачиваться');
 assert(!r.issues.some(x=>x.text.includes('без десятичной точки')),'C2: D2 на Haas не должно вызывать предупреждение о формате');
}

/* H1 — эвристика «больше 50 значит микроны» переворачивает трактовку молча.
   Значение оставлено прежним, но приложение обязано сказать, что оно угадало. */
const DRILL='G21 G18 G99 G50 S2000\nT0505\nG97 S800 M03\nG00 X0. Z2.\n';
{
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(DRILL+'G83 Z-40. R2. Q51 F0.1\nM30')},RazryadCNC.defaults())`);
 assert(r.issues.some(x=>x.text.includes('без десятичной точки')),'H1: молчаливое чтение Q51 как 0.051 мм не отмечено');
 assert(r.issues.some(x=>x.text.includes('0.051')&&x.text.includes('51')),'H1: не показаны оба возможных чтения');
}
{
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(DRILL+'G83 Z-40. R2. Q3. F0.1\nM30')},RazryadCNC.defaults())`);
 assert(!r.issues.some(x=>x.text.includes('без десятичной точки')),'H1: значение с точкой не должно вызывать предупреждение');
}
/* H1 (вторая половина) — цикл, оборванный защитным счётчиком, рисовал отвод из
   недостигнутой точки и не сообщал об этом ни ошибкой, ни предупреждением. */
{
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(DRILL+'G83 Z-40. R2. Q0.05 F0.1\nM30')},RazryadCNC.defaults())`);
 assert(r.issues.some(x=>x.text.includes('расчёт прерван')),'H1: тихий обрыв цикла по счётчику проходов не отмечен');
 assert(r.issues.some(x=>x.text.includes('не дошёл до заданной глубины')),'H1: не сказано, что глубина не достигнута');
}
{
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(DRILL+'G83 Z-40. R2. Q5. F0.1\nM30')},RazryadCNC.defaults())`);
 assert(!r.issues.some(x=>x.text.includes('расчёт прерван')),'H1: нормальный цикл ошибочно помечен как оборванный');
}

/* H2 — на токарных стойках Haas и Fanuc адреса I и K всегда радиусные. Умолчание
   «I в диаметрах» делило I пополам, дуга не строилась, и вместо неё снималась хорда. */
{
 const code=LATHE+'G01 X50. Z-5. F0.2\nG03 X60. Z-10. I5. K0. F0.2\nM30';
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},RazryadCNC.defaults())`);
 assert(!r.issues.some(x=>x.text.includes('Дуга G02/G03 не построена')),'H2: корректная дуга I/K отвергнута умолчанием');
 const arc=r.segments.find(s=>s.arc);
 assert(arc&&arc.points.length>8,`H2: дуга снята хордой вместо радиуса (точек ${arc?arc.points.length:0})`);
}
/* Переключатель диаметрального режима остаётся доступным для стоек с иным форматом. */
{
 const code=LATHE+'G01 X50. Z-5. F0.2\nG03 X60. Z-10. I5. K0. F0.2\nM30';
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},{...RazryadCNC.defaults(),arcCenterDiameter:true})`);
 assert(r.issues.some(x=>x.text.includes('Дуга G02/G03 не построена')),'H2: диаметральный режим перестал влиять на разбор дуги');
}

/* C1 — столкновение искалось только на быстрых ходах, поэтому рабочий кадр с
   радиальным съёмом 20 мм за проход давал совершенно пустой отчёт. */
{
 const code='G21 G18 G99 G50 S2000\nG97 S800 M03\nG00 X20. Z2.\nG01 Z-40. F0.25\nM30';
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},{...RazryadCNC.defaults(),stockD:60,length:120,grip:25})`);
 assert(r.issues.some(x=>x.text.includes('Съём за один проход')),'C1: съём 20 мм на радиус за один проход не отмечен');
 assert(r.issues.some(x=>x.text.includes('19.9')||x.text.includes('20.0')),'C1: фактическая величина врезания не названа');
 assert(r.stats.bad+r.stats.warn>0,'C1: отчёт по опасной программе снова пуст');
}
/* Нормальный черновой проход 5 мм на радиус тревоги не поднимает. */
{
 const code='G21 G18 G99 G50 S2000\nG97 S800 M03\nG00 X50. Z2.\nG01 Z-40. F0.25\nM30';
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},{...RazryadCNC.defaults(),stockD:60,length:120,grip:25})`);
 assert(!r.issues.some(x=>x.text.includes('Съём за один проход')),'C1: обычный проход 5 мм ошибочно помечен');
}
/* Учебный пример из поставки не должен зашумляться новой проверкой. */
{
 const code=fs.readFileSync('samples/turning-demo.nc','utf8');
 const base=run('RazryadCNC.defaults()');
 const fit=run(`RazryadCNC.inferStock(RazryadCNC.parseGcode(${JSON.stringify(code)},RazryadCNC.defaults()),RazryadCNC.defaults())`);
 const r=run(`RazryadCNC.parseGcode(${JSON.stringify(code)},{...RazryadCNC.defaults(),...${JSON.stringify(fit)}})`);
 assert(r.stats.bad===0,'C1: учебный пример получил ложные ошибки: '+r.issues.filter(i=>i.type==='bad').map(i=>i.line+': '+i.text).join('; '));
 const noise=r.issues.filter(i=>i.text.includes('Съём за один проход')).length;
 assert(noise===0,`C1: учебный пример зашумлён предупреждениями о съёме (${noise})`);
}

/* ── фрезерный эмулятор ─────────────────────────────────────────────────── */
const MILL=(body,cfg)=>run(`RazryadMill.parseMillGcode(${JSON.stringify('%\nO1000\nG21 G17 G90 G40 G49 G80\n'+body+'\nM30\n%')},${cfg||'RazryadMill.defaults()'})`);
const blk=t=>`{...RazryadMill.defaults(),stockX:120,stockY:80,stockZ:25,tool:'${t}'}`;

/* C4 — проверки опрашивали только осевую линию, поэтому фреза Ø50, проходящая осью
   мимо заготовки, врезалась периферией в стенку без единого замечания. */
{
 const r=MILL('T01 M06\nG43 H01\nS1200 M03\nG00 X100. Y-20. Z-5.\nG00 X20.',blk('face50'));
 assert(r.issues.some(x=>x.type==='bad'&&x.text.includes('периферия фрезы')),'C4: врезание периферией фрезы не отмечено');
}
/* Отвод из собственного паза ложную тревогу поднимать не должен. */
{
 const r=MILL('T02 M06\nG43 H02\nS3000 M03\nG00 X30. Y30. Z5.\nG01 Z-4. F120\nX80. F500\nG00 Z50.',blk('em10'));
 assert(!r.issues.some(x=>x.text.includes('периферия фрезы')),'C4: отвод из прорезанного паза принят за столкновение');
}

/* C5 — в G91 адреса R и Z сверлильного цикла читались как абсолютные, хотя X/Y
   того же кадра инкремент учитывали. Отверстие рисовалось не там и не той глубины. */
{
 const abs=MILL('T03 M06\nG43 H03\nS1200 M03\nG00 X20. Y20. Z50.\nG90 G81 Z35. R47. F120\nG80',blk('drill8'));
 const inc=MILL('T03 M06\nG43 H03\nS1200 M03\nG00 X20. Y20. Z50.\nG91 G81 Z-12. R-3. F120\nG80',blk('drill8'));
 const depth=res=>{const s=res.segments.filter(x=>x.cycle).map(x=>Math.min(x.from.z,x.to.z));return s.length?Math.min(...s):NaN;};
 assert(Number.isFinite(depth(inc)),'C5: инкрементальный цикл не построен');
 assert(Math.abs(depth(inc)-depth(abs))<.01,`C5: G91 и эквивалентный G90 дают разную глубину (${depth(inc)} против ${depth(abs)})`);
}

/* H3 — коды группы 09 вне списка распознанных проваливались в разбор перемещения
   и исполнялись модальным G-кодом, снимая металл и портя карту высот. */
{
 const r=MILL('T02 M06\nG43 H02\nS3000 M03\nG00 X30. Y30. Z5.\nG01 Z-2. F120\nG76 X60. Y30. Z-20. R2. Q.15 F80',blk('em10'));
 assert(r.issues.some(x=>x.type==='bad'&&x.text.includes('G76')&&x.text.includes('не моделируется')),'H3: нераспознанный цикл G76 не заблокирован');
 assert(!r.segments.some(x=>x.line===9&&x.cutting),'H3: кадр нераспознанного цикла всё ещё снимает металл');
}
{
 const r=MILL('T03 M06\nG43 H03\nS1200 M03\nG00 X20. Y20. Z5.\nG81 Z-10. R2. F120\nG80',blk('drill8'));
 assert(!r.issues.some(x=>x.text.includes('не моделируется')),'H3: поддержанный цикл G81 ошибочно заблокирован');
}

console.log(`этап A — регрессии безопасности: OK (${n} проверок)`);
