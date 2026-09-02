/* Проверка съёма металла во фрезерном эмуляторе: паз, карман по контуру,
   торцевание, циклы сверления, сферическая фреза и проверки опасных кадров.
   Модель детали — карта высот по X/Y, поэтому каждую операцию проверяем по
   фактической поверхности, а не по числу кадров. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,JSON,Number,String,Array,Object,Float64Array,Set,Map,isNaN,parseFloat,parseInt,
 document:{querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),head:{},body:{},addEventListener(){}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1});
ctx.window=ctx;
vm.runInContext(fs.readFileSync(path.join(root,'mill-sim-v99.js'),'utf8'),ctx,{filename:'mill-sim-v99.js'});
const M=ctx.RazryadMill;

let checks=0;
const assert=(v,m)=>{checks++;if(!v)throw new Error(m)};
const near=(a,b,tol,m)=>{checks++;if(!(Math.abs(a-b)<=tol))throw new Error(m+': ожидалось '+b+'±'+tol+', получено '+a)};

const tool=(st,o)=>({[st]:{station:st,kind:'em10',operation:'mill',diameter:10,corner:0,flute:30,
 shankD:10,holderD:32,holderLen:70,pointAngle:0,teeth:4,bottom:'flat',confirmed:true,...o}});
const head='G21 G17 G90 G40 G49 G80\n';
const run=(code,over)=>{
 const cfg={...M.defaults(),stockX:120,stockY:80,stockZ:25,...(over||{})};
 const res=M.parseMillGcode(code,cfg);
 return{cfg,res,mat:M.blockProfile(res,cfg,res.segments.length,0)};
};
const at=(mat,x,y)=>{const i=Math.round((x-mat.x0)/mat.step),j=Math.round((y-mat.y0)/mat.step);
 return(i<0||j<0||i>=mat.nx||j>=mat.ny)?NaN:mat.z[j*mat.nx+i];};
/* ширина снятого следа поперёк паза */
const bandY=(mat,x,depth)=>{let w=0;for(let j=0;j<mat.ny;j++)if(mat.z[j*mat.nx+Math.round((x-mat.x0)/mat.step)]<depth)w+=mat.step;return w;};
const bandX=(mat,y,depth)=>{const j=Math.round((y-mat.y0)/mat.step);let w=0;
 for(let i=0;i<mat.nx;i++)if(mat.z[j*mat.nx+i]<depth)w+=mat.step;return w;};

/* ---------- 1. Форма дна инструмента задана точно ---------- */
{
 const flat=M.bottomProfile({diameter:10,bottom:'flat'});
 near(flat.R,5,1e-9,'Радиус плоской фрезы посчитан неверно');
 near(flat.f(0),0,1e-9,'У плоской фрезы дно должно быть ровным в центре');
 near(flat.f(4.9),0,1e-9,'У плоской фрезы дно должно быть ровным у края');

 const ball=M.bottomProfile({diameter:10,corner:5,bottom:'ball'});
 near(ball.f(0),0,1e-9,'Сферическая фреза должна касаться дна в центре');
 near(ball.f(5),5,1e-9,'На краю сферической фрезы высота равна радиусу');
 near(ball.f(3),5-Math.sqrt(25-9),1e-9,'Профиль сферической фрезы не по окружности');

 const bull=M.bottomProfile({diameter:12,corner:2,bottom:'bull'});
 near(bull.f(3),0,1e-9,'У фрезы с радиусом при вершине середина дна плоская');
 near(bull.f(6),2,1e-9,'Радиус при вершине не выходит на полную высоту у края');
 near(bull.f(5),2-Math.sqrt(4-1),1e-9,'Тор при вершине построен неверно');

 const drill=M.bottomProfile({diameter:8.5,pointAngle:118,bottom:'cone'});
 near(drill.f(4.25),4.25/Math.tan(59*Math.PI/180),1e-6,'Конус сверла 118° построен неверно');
}

/* ---------- 2. Паз концевой фрезой: ширина по диаметру, глубина по Z ---------- */
{
 const r=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-5. F150\nX110. F500\nG00 Z50.\nM30',
  {toolConfigs:tool(1)});
 near(bandY(r.mat,60,-.5),10,.5,'Паз фрезой ⌀10 вышел не своей ширины');
 near(at(r.mat,60,40),-5,.01,'Глубина паза не совпадает с заданной Z');
 near(at(r.mat,60,48),0,.01,'Металл снят там, где фрезы не было');
 /* торцы паза скруглены радиусом фрезы: металл снят на R за конечной точкой и не дальше */
 near(at(r.mat,3,40),0,.01,'Паз начался раньше, чем позволяет радиус фрезы');
 near(at(r.mat,7,40),-5,.01,'Врезание не сняло металл в пределах радиуса фрезы');
 near(at(r.mat,114,40),-5,.01,'Скругление торца паза не доходит до радиуса фрезы');
 near(at(r.mat,116,40),0,.01,'Паз ушёл дальше конечной точки на радиус фрезы');
}

/* ---------- 3. Ширина паза следует за диаметром фрезы ---------- */
{
 [[6,'em6'],[10,'em10'],[16,'em16']].forEach(([d,kind])=>{
  const r=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X20. Y40. Z5.\nG01 Z-3. F150\nX100. F500\nG00 Z50.\nM30',
   {toolConfigs:tool(1,{kind,diameter:d})});
  near(bandY(r.mat,60,-.5),d,.6,'Фреза ⌀'+d+' прорезала паз не своей ширины');
 });
}

/* ---------- 4. Торцевание снимает ровно припуск ---------- */
{
 const r=run(head+'T01 M06\nG43 H01\nS1800 M03\nG00 X-30. Y40. Z5.\nG01 Z-1.5 F300\nX150. F900\nG00 Z50.\nM30',
  {toolConfigs:tool(1,{kind:'face50',diameter:50,corner:.8,flute:6,bottom:'flat'})});
 near(at(r.mat,60,40),-1.5,.01,'Торцевание сняло не заданный припуск');
 near(at(r.mat,60,60),-1.5,.01,'Торцевая фреза ⌀50 не покрыла свою ширину');
 near(at(r.mat,60,70),0,.01,'Торцевание задело металл за пределами фрезы');
 near(bandY(r.mat,60,-.5),50,.6,'Ширина торцевания не равна диаметру фрезы');
}

/* ---------- 5. Цикл G81: глубина и конус при вершине ---------- */
{
 const drill={toolConfigs:tool(2,{kind:'drill8',operation:'drill',diameter:8.5,flute:60,bottom:'cone',pointAngle:118})};
 const r=run(head+'T02 M06\nG43 H02\nS1200 M03\nG00 X40. Y40. Z5.\nG81 Z-18. R2. F120\nG80\nG00 Z50.\nM30',drill);
 assert(r.res.stats.bad===0,'Корректный цикл сверления забракован: '+r.res.issues.filter(i=>i.type==='bad').map(i=>i.text).join('; '));
 near(at(r.mat,40,40),-18,.01,'Сверло не дошло до заданной глубины Z');
 /* конус 118° поднимает дно у стенки на r/tan(59°) */
 const rise=4.25/Math.tan(59*Math.PI/180);
 near(at(r.mat,44,40),-18+rise,.35,'Конус при вершине сверла построен неверно');
 near(at(r.mat,46,40),0,.01,'Отверстие шире диаметра сверла');
 near(bandX(r.mat,40,-.5),8.5,.6,'Диаметр отверстия не равен диаметру сверла');
}

/* ---------- 6. G83 с клевками даёт тот же профиль, что и сплошное G81 ---------- */
{
 const drill={toolConfigs:tool(2,{kind:'drill8',operation:'drill',diameter:8.5,flute:60,bottom:'cone',pointAngle:118})};
 const a=run(head+'T02 M06\nG43 H02\nS1200 M03\nG00 X40. Y40. Z5.\nG81 Z-20. R2. F120\nG80\nG00 Z50.\nM30',drill).mat;
 const b=run(head+'T02 M06\nG43 H02\nS1200 M03\nG00 X40. Y40. Z5.\nG83 Z-20. R2. Q4. F120\nG80\nG00 Z50.\nM30',drill).mat;
 let worst=0;for(let i=0;i<a.z.length;i++)worst=Math.max(worst,Math.abs(a.z[i]-b.z[i]));
 near(worst,0,.02,'Сверление с клевками G83 дало не тот профиль, что сплошное G81');
}

/* ---------- 7. Повтор цикла кадром с координатами ---------- */
{
 const drill={toolConfigs:tool(2,{kind:'drill5',operation:'drill',diameter:5,flute:52,bottom:'cone',pointAngle:118})};
 const r=run(head+'T02 M06\nG43 H02\nS1500 M03\nG00 X20. Y20. Z5.\nG81 Z-10. R2. F120\nX60.\nX100.\nG80\nG00 Z50.\nM30',drill);
 [20,60,100].forEach(x=>near(at(r.mat,x,20),-10,.01,'Повтор цикла не просверлил отверстие в X'+x));
 near(at(r.mat,80,20),0,.01,'Между отверстиями снят металл');
}

/* ---------- 8. Метчик резьбу режет, отверстие не растит ---------- */
{
 const cfg={toolConfigs:tool(4,{kind:'tapm10',operation:'tap',diameter:10,flute:30,bottom:'flat'})};
 const r=run(head+'T04 M06\nG43 H04\nS300 M03\nG00 X40. Y40. Z5.\nG84 Z-15. R2. F450\nG80\nG00 Z50.\nM30',cfg);
 near(at(r.mat,40,40),0,.01,'Метчик выбрал металл: он режет резьбу, а не диаметр');
}

/* ---------- 9. Компенсация G41 разводит контур на радиус фрезы ---------- */
{
 const cfg={toolConfigs:tool(1,{diameter:10})};
 /* прямой проход по Y=40 с компенсацией слева уводит фрезу на 5 мм */
 const off=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-4. F150\nG41 D01 X110. F500\nG40 G00 Z50.\nM30',cfg);
 const on=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-4. F150\nX110. F500\nG00 Z50.\nM30',cfg);
 const centreOff=(()=>{let sum=0,cnt=0;for(let j=0;j<off.mat.ny;j++){const z=off.mat.z[j*off.mat.nx+Math.round((60-off.mat.x0)/off.mat.step)];
  if(z<-.5){sum+=off.mat.y0+j*off.mat.step;cnt++;}}return cnt?sum/cnt:NaN;})();
 const centreOn=(()=>{let sum=0,cnt=0;for(let j=0;j<on.mat.ny;j++){const z=on.mat.z[j*on.mat.nx+Math.round((60-on.mat.x0)/on.mat.step)];
  if(z<-.5){sum+=on.mat.y0+j*on.mat.step;cnt++;}}return cnt?sum/cnt:NaN;})();
 near(centreOn,40,.3,'Без компенсации фреза должна идти по программной линии');
 near(Math.abs(centreOff-centreOn),5,.5,'G41 не сместил фрезу на радиус инструмента');
}

/* ---------- 10. Сферическая фреза оставляет гребешок между строчками ---------- */
{
 const cfg={toolConfigs:tool(3,{kind:'ball10',operation:'mill',diameter:10,corner:5,flute:25,bottom:'ball'})};
 const r=run(head+'T03 M06\nG43 H03\nS6000 M03\nG00 X10. Y30. Z5.\nG01 Z-2. F300\nX110. F600\nY32.\nX10.\nY34.\nX110.\nG00 Z50.\nM30',cfg);
 const trough=at(r.mat,60,32),ridge=at(r.mat,60,31.2);
 near(trough,-2,.01,'Дно строчки сферической фрезы не вышло на заданную Z');
 assert(ridge>trough+.02,'Между строчками сферической фрезы нет гребешка');
 /* при шаге 2 и R5 гребешок не может превышать 5 − √(25−1) */
 const max=5-Math.sqrt(25-1);
 assert(ridge-trough<=max+.02,'Гребешок больше расчётного для шага 2 мм: '+(ridge-trough).toFixed(3));
}

/* ---------- 11. Попутное и встречное дают одинаковую геометрию ---------- */
{
 const cfg={toolConfigs:tool(1)};
 const a=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-4. F150\nX110. F500\nG00 Z50.\nM30',cfg).mat;
 const b=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X110. Y40. Z5.\nG01 Z-4. F150\nX10. F500\nG00 Z50.\nM30',cfg).mat;
 let worst=0;for(let i=0;i<a.z.length;i++)worst=Math.max(worst,Math.abs(a.z[i]-b.z[i]));
 near(worst,0,.01,'Направление прохода изменило геометрию: в модели съёма его быть не должно');
}

/* ---------- 12. Дуга G02 строится по радиусу ---------- */
{
 const cfg={toolConfigs:tool(1,{diameter:6})};
 const r=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X30. Y40. Z5.\nG01 Z-3. F150\nG02 X70. Y40. I20. J0. F400\nG00 Z50.\nM30',cfg);
 const seg=r.res.segments.find(s=>s.arc&&s.cutting);
 assert(seg&&seg.points.length>8,'Дуга G02 не разбита на точки');
 seg.points.forEach(p=>near(Math.hypot(p.x-50,p.y-40),20,.15,'Точка дуги ушла с радиуса R20'));
}

/* ---------- 13. Инкрементальный съём совпадает с полным пересчётом ---------- */
{
 const cfg={...M.defaults(),stockX:120,stockY:80,stockZ:25,toolConfigs:tool(1)};
 const res=M.parseMillGcode(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y20. Z5.\nG01 Z-4. F150\nX110. F600\nY30.\nX10.\nY40.\nX110.\nY50.\nX10.\nG00 Z50.\nM30',cfg);
 const cutter=M.makeMillCutter(res,cfg);
 [0,.3,.6,1].forEach(q=>{
  const idx=Math.floor(res.segments.length*q);
  const inc=cutter.at(idx,.4),full=M.blockProfile(res,cfg,idx,.4);
  let worst=0;for(let i=0;i<full.z.length;i++)worst=Math.max(worst,Math.abs(full.z[i]-inc.z[i]));
  near(worst,0,1e-9,'Инкрементальный съём разошёлся с полным пересчётом на кадре '+idx);
 });
 /* и перемотка назад */
 const back=cutter.at(2,0),ref=M.blockProfile(res,cfg,2,0);
 let worst=0;for(let i=0;i<ref.z.length;i++)worst=Math.max(worst,Math.abs(ref.z[i]-back.z[i]));
 near(worst,0,1e-9,'Перемотка назад дала не тот профиль');
}

/* ---------- 14. Быстрый ход металл не снимает ---------- */
{
 const r=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z-5.\nG00 X110.\nG00 Z50.\nM30',{toolConfigs:tool(1)});
 near(at(r.mat,60,40),0,1e-9,'Быстрый ход снял металл');
 assert(r.res.issues.some(i=>i.type==='bad'&&i.text.includes('сквозь неснятый металл')),
  'Быстрый ход внутри заготовки не помечен ошибкой');
}

/* ---------- 15. Опасные кадры находятся ---------- */
{
 /* глубина больше режущей части */
 const deep=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X40. Y40. Z5.\nG01 Z-24. F100\nX80. F400\nG00 Z50.\nM30',
  {stockZ:40,toolConfigs:tool(1,{flute:20})});
 assert(deep.res.issues.some(i=>i.type==='bad'&&i.text.includes('режущей части')),
  'Глубина больше длины режущей части не помечена');
 /* уход ниже дна заготовки */
 const thru=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X40. Y40. Z5.\nG01 Z-40. F100\nG00 Z50.\nM30',
  {stockZ:25,toolConfigs:tool(1,{flute:60})});
 assert(thru.res.issues.some(i=>i.type==='bad'&&i.text.includes('ниже дна заготовки')),
  'Уход ниже дна заготовки не помечен');
 /* вертикальное врезание на рабочей подаче */
 const plunge=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X40. Y40. Z5.\nG01 Z-5. F150\nX80. F400\nG00 Z50.\nM30',
  {toolConfigs:tool(1)});
 assert(plunge.res.issues.some(i=>i.type==='warn'&&i.text.includes('вертикально вниз')),
  'Вертикальное врезание на рабочей подаче не помечено');
 /* незакрытая компенсация */
 const comp=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-3. F150\nG41 D01 X110. F500\nG00 Z50.\nM30',
  {toolConfigs:tool(1)});
 assert(comp.res.issues.some(i=>i.type==='bad'&&i.text.includes('G40')),'Незакрытая компенсация G41 не помечена');
 /* отсутствие G43 */
 const noComp=run('G21 G17 G90 G40 G80\nT01 M06\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-3. F150\nX110.\nG00 Z50.\nM30',
  {toolConfigs:tool(1)});
 assert(noComp.res.issues.some(i=>i.type==='warn'&&i.text.includes('G43')),'Работа без G43 не помечена');
}

/* ---------- 16. Каталог фрез: у каждой позиции физичные размеры ---------- */
{
 const L=M.MILL_TOOLS,keys=Object.keys(L);
 assert(keys.length>=20,'Каталог фрез слишком мал: '+keys.length);
 keys.forEach(k=>{
  const v=L[k];
  assert(v.diameter>0,k+': не задан диаметр');
  assert(v.flute>0,k+': не задана длина режущей части');
  assert(v.corner<=v.diameter/2+1e-9,k+': радиус при вершине больше радиуса фрезы');
  if(v.bottom==='ball')near(v.corner,v.diameter/2,1e-9,k+': у сферической фрезы радиус равен половине ⌀');
  if(v.bottom==='cone')assert(v.pointAngle>0,k+': конусному инструменту нужен угол при вершине');
  const p=M.bottomProfile(v);
  assert(Number.isFinite(p.f(0))&&Number.isFinite(p.f(p.R)),k+': профиль дна не считается');
 });
 assert(M.millToolOptions('em10','сверло').includes('option'),'Поиск по каталогу фрез ничего не нашёл');
 assert(M.millToolOptions('em10','сверло').includes('value="em10"'),'Выбранная фреза должна оставаться в списке');
}

/* ---------- 17. Подбор заготовки по программе ---------- */
{
 const cfg={...M.defaults(),toolConfigs:tool(1)};
 const res=M.parseMillGcode(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y10. Z5.\nG01 Z-6. F150\nX90. F500\nY60.\nX10.\nG00 Z50.\nM30',cfg);
 const fit=M.inferBlock(res,cfg);
 assert(fit.stockX>=90&&fit.stockX<=120,'Длина заготовки подобрана неверно: '+fit.stockX);
 assert(fit.stockY>=60&&fit.stockY<=90,'Ширина заготовки подобрана неверно: '+fit.stockY);
 assert(fit.stockZ>=10,'Высота заготовки должна покрывать глубину обработки: '+fit.stockZ);
}

/* ---------- 18. Учебный пример проходит без ошибок ---------- */
{
 const cfg={...M.defaults()};
 const first=M.parseMillGcode(M.DEMO,cfg);
 const fit=M.inferBlock(first,cfg);
 const res=M.parseMillGcode(M.DEMO,{...cfg,...fit});
 assert(res.stats.bad===0,'Учебный пример выдал ошибки: '+res.issues.filter(i=>i.type==='bad').map(i=>i.line+': '+i.text).join('; '));
 assert(res.tools.length===3,'В учебном примере должно найтись три станции T, найдено '+res.tools.length);
 const mat=M.blockProfile(res,{...cfg,...fit},res.segments.length,0);
 const g=M.summarizeBlock(mat,{...cfg,...fit});
 assert(g.removedCm3>1,'Учебный пример не снял металла');
 assert(g.deepest<-20,'Отверстия в учебном примере не просверлены на глубину: '+g.deepest);
}

/* ---------- 19. G91: инкрементальная программа даёт ту же деталь ---------- */
{
 const cfg={toolConfigs:tool(1)};
 const abs=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X20. Y40. Z5.\nG01 Z-4. F150\nX80. F500\nG00 Z50.\nM30',cfg).mat;
 const inc=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X20. Y40. Z5.\nG91\nG01 Z-9. F150\nX60. F500\nG90\nG00 Z50.\nM30',cfg).mat;
 let worst=0;for(let i=0;i<abs.z.length;i++)worst=Math.max(worst,Math.abs(abs.z[i]-inc.z[i]));
 near(worst,0,1e-9,'G91 дал не ту же деталь, что эквивалентная программа в G90');
}
/* ---------- 20. G98 и G99: плоскость отвода в цикле ---------- */
{
 const drill={toolConfigs:tool(2,{kind:'drill5',operation:'drill',diameter:5,flute:52,bottom:'cone',pointAngle:118})};
 const prog=mode=>head+'T02 M06\nG43 H02\nS1500 M03\nG00 X20. Y20. Z20.\n'+mode+' G81 Z-10. R2. F120\nX60.\nG80\nG00 Z50.\nM30';
 const a=run(prog('G98'),drill),b=run(prog('G99'),drill);
 [20,60].forEach(x=>{
  near(at(a.mat,x,20),-10,.01,'G98: отверстие в X'+x+' не просверлено');
  near(at(b.mat,x,20),-10,.01,'G99: отверстие в X'+x+' не просверлено');
 });
 const up=r=>Math.max(...r.res.segments.filter(s=>s.cycle&&s.rapid).map(s=>s.to.z));
 near(up(a),20,.01,'G98 должен отводить на исходную высоту');
 near(up(b),2,.01,'G99 должен отводить на плоскость R');
}
/* ---------- 21. Смена единиц внутри программы ---------- */
{
 const r=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X20. Y40. Z5.\nG01 Z-4. F150\nG20\nX2. F20\nG21\nG00 Z50.\nM30',
  {toolConfigs:tool(1)});
 const last=r.res.segments.filter(s=>s.cutting).pop();
 near(last.to.x,50.8,.01,'G20 не перевёл дюймы в миллиметры');
}
/* ---------- 22. После G80 кадр с координатами не сверлит ---------- */
{
 const drill={toolConfigs:tool(2,{kind:'drill5',operation:'drill',diameter:5,flute:52,bottom:'cone',pointAngle:118})};
 const r=run(head+'T02 M06\nG43 H02\nS1500 M03\nG00 X20. Y20. Z5.\nG81 Z-8. R2. F120\nG80\nX60.\nG00 Z50.\nM30',drill);
 near(at(r.mat,20,20),-8,.01,'Первое отверстие не просверлено');
 near(at(r.mat,60,20),0,.01,'Цикл продолжил работать после G80');
}

/* ---------- 23. Рампа снимает металл по всей ширине фрезы ---------- */
{
 /* Инструмент накрывает ячейку на целом отрезке хода, и на спуске самое низкое
    положение — на выходе из-под фрезы, а не в точке наибольшего сближения.
    Если считать только сближение, на дне рампы остаётся гребень «уклон × полухорда»:
    на входе 45° фрезой ⌀10 это 5 мм несрезанного металла. */
 const cfg={toolConfigs:tool(1,{diameter:10})};
 const steep=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X30. Y40. Z1.\nG01 Z0. F150\nX40. Z-10. F300\nG00 Z50.\nM30',cfg);
 near(at(steep.mat,32,40),-7,.05,'Рампа 45° оставила гребень: минимум по капсуле не найден');
 near(at(steep.mat,36,40),-10,.05,'Дно крутой рампы не вышло на полную глубину');
 /* пологая рампа: пол ровно на R×уклон ниже осевой линии — так и режет реальная фреза */
 const easy=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z0.\nG01 X110. Z-10. F300\nG00 Z50.\nM30',cfg);
 [20,40,60,80,100].forEach(x=>{
  const axis=-10*(x-10)/100; /* высота осевой линии */
  near(at(easy.mat,x,40),axis-.5,.06,'Пологая рампа в X'+x+' срезана не на полную хорду фрезы');
 });
}
/* ---------- 24. Паз прорезан сплошь, без пропусков на краю фрезы ---------- */
{
 const r=run(head+'T01 M06\nG43 H01\nS3000 M03\nG00 X10. Y40. Z5.\nG01 Z-5. F150\nX110. F500\nG00 Z50.\nM30',
  {toolConfigs:tool(1)});
 const i=Math.round((60-r.mat.x0)/r.mat.step);
 let cut=0,gaps=0,started=false,ended=false;
 for(let j=0;j<r.mat.ny;j++){
  const inCut=r.mat.z[j*r.mat.nx+i]<-.5;
  if(inCut){if(ended)gaps++;cut++;started=true;}else if(started)ended=true;
 }
 near(cut*r.mat.step,10,.5,'Ширина паза изменилась');
 assert(gaps===0,'В пазу есть пропуски: ячейки на самом краю фрезы выпали из реза');
}
/* ---------- 25. Полная окружность G02/G03 через I/J ---------- */
{
 const cfg={toolConfigs:tool(1)};
 const prog=end=>head+'T01 M06\nG43 H01\nS3000 M03\nG00 X80. Y40. Z5.\nG01 Z-4. F150\n'
  +(end?'G02 X80. Y40. I-20. J0. F400\n':'G02 I-20. J0. F400\n')+'G00 Z50.\nM30';
 [true,false].forEach(end=>{
  const r=run(prog(end),cfg),tag=end?'с конечной точкой':'без конечной точки';
  const seg=r.res.segments.find(s=>s.arc&&s.cutting);
  assert(seg,'Полная окружность '+tag+' не дала режущего хода');
  assert(seg.points.length>40,'Полная окружность '+tag+' выродилась в точку');
  seg.points.forEach(p=>near(Math.hypot(p.x-60,p.y-40),20,.15,'Точка полной окружности '+tag+' ушла с радиуса'));
  /* кольцо прорезано во всех четвертях, середина осталась нетронутой */
  [[80,40],[60,60],[40,40],[60,20]].forEach(p=>
   near(at(r.mat,p[0],p[1]),-4,.01,'Полная окружность '+tag+' не прорезана в X'+p[0]+' Y'+p[1]));
  near(at(r.mat,60,40),0,.01,'Полная окружность '+tag+' съела середину: это кольцо, а не карман');
 });
 /* G03 идёт в другую сторону, но кольцо то же */
 const cw=run(prog(true),cfg).mat,ccw=run(prog(true).replace('G02','G03'),cfg).mat;
 let worst=0;for(let i=0;i<cw.z.length;i++)worst=Math.max(worst,Math.abs(cw.z[i]-ccw.z[i]));
 near(worst,0,.01,'G02 и G03 по полной окружности дали разные кольца');
}

console.log('mill machining tests: OK ('+checks+' проверок)');
