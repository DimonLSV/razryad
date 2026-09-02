/* РАЗРЯД 0.998 — Эмулятор ЧПУ, фрезерный режим X/Y/Z.

   Модель детали — карта высот по (X, Y): в каждой ячейке хранится оставшаяся
   верхняя поверхность Z. Это прямой аналог радиального поля токарного эмулятора,
   и работает он так же: инструмент вычитается из поля своим настоящим силуэтом,
   а не программной точкой, поэтому шаровая фреза оставляет гребешок, фреза с
   радиусом при вершине — галтель в углу паза, а сверло — конус на дне.

   Подсветка G-кода, цвета траектории и стили редактора берутся у токарного
   модуля через window.RazryadCNC — они общие для обоих эмуляторов. */
(function(){
const STORE='razryad-mill-sim-v99';
const VIEW_STORE='razryad-mill-view-v1';
const TOOL_STORE='razryad-mill-tools-v99';
const CNC=window.RazryadCNC||{};
let millState=null,millFrame=0,millLast=0,millResult=null,millResize=null,viewState=loadView();
const root=document.querySelector('.device');

/* ============================================================
   Наладка и вид
   ============================================================ */
function defaults(){return{stockX:120,stockY:80,stockZ:25,zeroX:'corner',zeroY:'corner',
 hold:'vice',jaw:12,speed:2,tool:'em10',feed:400,rpm:3000,coolant:true,showCycles:true,toolConfigs:{}};}
function load(){try{return{...defaults(),...(JSON.parse(localStorage.getItem(STORE)||'null')||{})}}catch(_){return defaults()}}
function save(v){try{localStorage.setItem(STORE,JSON.stringify(v))}catch(_){}}
function loadView(){const base={showRapid:true,showPath:true,showDots:false,showTool:true,showStock:true,
 showGrid:true,showSection:true,sectionAxis:'x',sectionAt:0,codeTheme:'cimco',autoStock:true,zoom:1,panX:0,panY:0};
 try{return{...base,...(JSON.parse(localStorage.getItem(VIEW_STORE)||'null')||{})}}catch(_){return base}}
function saveView(){try{localStorage.setItem(VIEW_STORE,JSON.stringify(viewState))}catch(_){}}
function loadToolStore(){try{return JSON.parse(localStorage.getItem(TOOL_STORE)||'{}')||{}}catch(_){return{}}}
function saveToolStore(v){try{localStorage.setItem(TOOL_STORE,JSON.stringify(v||{}))}catch(_){}}
function h(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}

/* ============================================================
   Каталог фрезерного инструмента.
   Размеры каталожные: диаметр, длина режущей части, радиус при вершине,
   диаметр хвостовика и оправки. Ими же считается съём и проверка вылета.
   ============================================================ */
const MILL_GROUPS=[['end','Концевые фрезы'],['face','Торцевые и фасочные'],['axial','Осевой инструмент']];
const MILL_TOOLS={
 em6:{name:'Концевая ⌀6 Z3 · твердосплав',group:'end',operation:'mill',bottom:'flat',
  diameter:6,corner:0,flute:20,shankD:6,holderD:25,holderLen:60,teeth:3,
  note:'Паз в один проход шириной 6 мм. Глубже 1⌀ за проход — только с полной подачей СОЖ.'},
 em8:{name:'Концевая ⌀8 Z4 · твердосплав',group:'end',operation:'mill',bottom:'flat',
  diameter:8,corner:0,flute:25,shankD:8,holderD:25,holderLen:60,teeth:4,note:'Четыре зуба: чистовой контур и уступы.'},
 em10:{name:'Концевая ⌀10 Z4 · твердосплав',group:'end',operation:'mill',bottom:'flat',
  diameter:10,corner:0,flute:30,shankD:10,holderD:32,holderLen:70,teeth:4,note:'Рабочая лошадка: контур, карман, уступ.'},
 em12:{name:'Концевая ⌀12 Z4 · твердосплав',group:'end',operation:'mill',bottom:'flat',
  diameter:12,corner:0,flute:35,shankD:12,holderD:32,holderLen:70,teeth:4,note:'Черновой карман и широкий уступ.'},
 em16:{name:'Концевая ⌀16 Z4 · твердосплав',group:'end',operation:'mill',bottom:'flat',
  diameter:16,corner:0,flute:40,shankD:16,holderD:40,holderLen:80,teeth:4,note:'Съём большой, но нужна жёсткость станка.'},
 em20hss:{name:'Концевая ⌀20 Z4 · быстрорез Р6М5',group:'end',operation:'mill',bottom:'flat',
  diameter:20,corner:0,flute:45,shankD:20,holderD:40,holderLen:80,teeth:4,
  note:'Быстрорез: скорость резания втрое ниже твердосплава, зато прощает вибрацию.'},
 bull10:{name:'Концевая ⌀10 R1 · с радиусом при вершине',group:'end',operation:'mill',bottom:'bull',
  diameter:10,corner:1,flute:30,shankD:10,holderD:32,holderLen:70,teeth:4,
  note:'Радиус при вершине бережёт угол зуба: черновая с большей подачей, в углу дна остаётся R1.'},
 bull12:{name:'Концевая ⌀12 R2 · с радиусом при вершине',group:'end',operation:'mill',bottom:'bull',
  diameter:12,corner:2,flute:35,shankD:12,holderD:32,holderLen:70,teeth:4,note:'Черновая по объёмному контуру.'},
 ball6:{name:'Сферическая ⌀6 · Z2',group:'end',operation:'mill',bottom:'ball',
  diameter:6,corner:3,flute:18,shankD:6,holderD:25,holderLen:60,teeth:2,
  note:'Объёмная чистовая. Гребешок между строчками считается по шагу и радиусу.'},
 ball10:{name:'Сферическая ⌀10 · Z2',group:'end',operation:'mill',bottom:'ball',
  diameter:10,corner:5,flute:25,shankD:10,holderD:32,holderLen:70,teeth:2,note:'Объёмная получистовая по 3D-контуру.'},
 em10long:{name:'Концевая ⌀10 длинной серии · вылет 60',group:'end',operation:'mill',bottom:'flat',
  diameter:10,corner:0,flute:60,shankD:10,holderD:32,holderLen:90,teeth:4,
  note:'Глубокий карман. Вылет больше 4⌀ — режимы вдвое ниже, иначе увод и дробление.'},
 tslot:{name:'Т-образная ⌀16 под паз 8 мм',group:'end',operation:'mill',bottom:'flat',
  diameter:16,corner:0,flute:8,shankD:8,holderD:25,holderLen:60,teeth:6,
  note:'Работает только в готовом прямом пазу. Врезание строго боковое.'},
 face50:{name:'Торцевая ⌀50 · 5 пластин SEKT',group:'face',operation:'mill',bottom:'flat',
  diameter:50,corner:.8,flute:6,shankD:22,holderD:60,holderLen:50,teeth:5,
  note:'Торцевание плоскости. Ширина фрезерования 0,7⌀, фреза смещена от оси заготовки.'},
 face63:{name:'Торцевая ⌀63 · 6 пластин',group:'face',operation:'mill',bottom:'flat',
  diameter:63,corner:1.2,flute:6,shankD:27,holderD:70,holderLen:50,teeth:6,note:'Плоскость за один проход до 63 мм.'},
 chamfer90:{name:'Фасочная 90° ⌀12',group:'face',operation:'mill',bottom:'cone',
  diameter:12,corner:0,pointAngle:90,flute:8,shankD:12,holderD:32,holderLen:60,teeth:2,
  note:'Фаска 45° по контуру. Глубину задаёт величина фаски, а не длина фрезы.'},
 chamfer60:{name:'Фасочная 60° ⌀16',group:'face',operation:'mill',bottom:'cone',
  diameter:16,corner:0,pointAngle:60,flute:10,shankD:12,holderD:32,holderLen:60,teeth:3,
  note:'Фаска 30° и снятие заусенца.'},
 spot90:{name:'Центровочная ⌀10 · 90°',group:'axial',operation:'drill',bottom:'cone',
  diameter:10,corner:0,pointAngle:90,flute:8,shankD:10,holderD:32,holderLen:60,teeth:2,
  note:'Намечает отверстие и снимает фаску. Глубина по формуле ⌀сверла/2 + фаска.'},
 spot120:{name:'Центровочная ⌀12 · 120°',group:'axial',operation:'drill',bottom:'cone',
  diameter:12,corner:0,pointAngle:120,flute:8,shankD:12,holderD:32,holderLen:60,teeth:2,
  note:'Под свёрла с углом 118–140°: намеченный конус должен быть тупее сверла.'},
 drill5:{name:'Сверло ⌀5 HSS 118°',group:'axial',operation:'drill',bottom:'cone',
  diameter:5,corner:0,pointAngle:118,flute:52,shankD:5,holderD:25,holderLen:60,teeth:2,
  note:'Глубже 3⌀ — цикл G83 с полным выводом стружки.'},
 drill8:{name:'Сверло ⌀8,5 HSS 118° (под M10)',group:'axial',operation:'drill',bottom:'cone',
  diameter:8.5,corner:0,pointAngle:118,flute:60,shankD:8.5,holderD:25,holderLen:60,teeth:2,
  note:'Отверстие под метрическую резьбу M10×1,5.'},
 drill10c:{name:'Сверло ⌀10 твердосплав 140°',group:'axial',operation:'drill',bottom:'cone',
  diameter:10,corner:0,pointAngle:140,flute:45,shankD:10,holderD:32,holderLen:60,teeth:2,
  note:'Самоцентрирующееся, подача втрое выше HSS. Нужна жёсткость и СОЖ через тело.'},
 drill20:{name:'Сверло ⌀20 со сменными пластинами',group:'axial',operation:'drill',bottom:'flat',
  diameter:20,corner:0,pointAngle:178,flute:60,shankD:20,holderD:40,holderLen:70,teeth:2,
  note:'Плоское дно, большой съём. Обязателен подвод СОЖ через тело и жёсткое крепление.'},
 tapm10:{name:'Метчик машинный M10×1,5',group:'axial',operation:'tap',bottom:'flat',
  diameter:10,corner:0,pointAngle:0,flute:30,shankD:8,holderD:32,holderLen:70,teeth:3,
  note:'Отверстие ⌀8,5. Подача строго равна шагу, обороты постоянные (G84).'},
 ream8:{name:'Развёртка машинная ⌀8 H7',group:'axial',operation:'drill',bottom:'cone',
  diameter:8,corner:0,pointAngle:170,flute:40,shankD:8,holderD:25,holderLen:60,teeth:6,
  note:'Снимает 0,1–0,2 мм. Отверстие сверлится ⌀7,8, подача постоянная, без реверса.'}
};

function millToolOptions(selected,query){
 const q=String(query||'').trim().toLowerCase();
 const match=(k,v)=>!q||k.toLowerCase().includes(q)||String(v.name).toLowerCase().includes(q);
 let html=MILL_GROUPS.map(([g,label])=>{
  const list=Object.entries(MILL_TOOLS).filter(([k,v])=>v.group===g&&(k===selected||match(k,v)));
  if(!list.length)return'';
  return '<optgroup label="'+h(label)+'">'+list.map(([k,v])=>
   '<option value="'+k+'" '+(k===selected?'selected':'')+'>'+h(v.name)+'</option>').join('')+'</optgroup>';
 }).join('');
 if(!html)html='<option value="'+h(selected||'em10')+'" selected>— по запросу ничего не найдено —</option>';
 return html;
}
function millStation(v){const t=Math.abs(Math.round(Number(v)||0));return t>=100?Math.floor(t/100):t;}
function defaultMillTool(station,cfg,hint){
 const fallback={...(cfg||defaults())},stored=loadToolStore()[station]||{};
 const kind=stored.kind||hint&&hint.kind||fallback.tool||'em10',base=MILL_TOOLS[kind]||MILL_TOOLS.em10;
 return{station:Number(station)||0,code:hint&&hint.code||'',kind,
  operation:stored.operation||hint&&hint.operation||base.operation,
  diameter:Number(stored.diameter??base.diameter)||0,
  corner:Number(stored.corner??base.corner)||0,
  flute:Number(stored.flute??base.flute)||0,
  shankD:Number(stored.shankD??base.shankD)||0,
  holderD:Number(stored.holderD??base.holderD)||0,
  holderLen:Number(stored.holderLen??base.holderLen)||0,
  pointAngle:Number(stored.pointAngle??base.pointAngle)||0,
  teeth:Number(stored.teeth??base.teeth)||2,
  bottom:stored.bottom||base.bottom||'flat',
  confirmed:stored.confirmed===true};
}
function millHint(text){
 const t=String(text||'').toUpperCase();
 if(/\bTAP\b|МЕТЧИК/.test(t))return{operation:'tap',kind:'tapm10'};
 if(/REAM|РАЗВ[ЁЕ]РТ/.test(t))return{operation:'drill',kind:'ream8'};
 if(/SPOT|ЦЕНТРОВ/.test(t))return{operation:'drill',kind:'spot90'};
 if(/\bDRILL\b|СВЕРЛ/.test(t))return{operation:'drill',kind:'drill8'};
 if(/CHAMFER|ФАСК/.test(t))return{operation:'mill',kind:'chamfer90'};
 if(/BALL|СФЕРИЧ/.test(t))return{operation:'mill',kind:'ball10'};
 if(/FACE\s*MILL|ТОРЦЕВ/.test(t))return{operation:'mill',kind:'face50'};
 if(/END\s*MILL|КОНЦЕВ|ФРЕЗ/.test(t))return{operation:'mill',kind:'em10'};
 return null;
}

/* ------------------------------------------------------------
   Силуэт дна инструмента: высота режущей поверхности над остриём
   на расстоянии d от оси. Отсюда и берётся форма дна паза.
   ------------------------------------------------------------ */
function bottomProfile(spec){
 const R=Math.max(.05,(Number(spec.diameter)||0)/2);
 const kind=spec.bottom||'flat';
 if(kind==='ball'){const r=Math.min(R,Number(spec.corner)||R);
  return{R,f:d=>d>=r?r:r-Math.sqrt(Math.max(0,r*r-d*d)),flat:false};}
 if(kind==='bull'){const rc=Math.max(0,Math.min(Number(spec.corner)||0,R)),flat=R-rc;
  return{R,f:d=>d<=flat?0:(rc-Math.sqrt(Math.max(0,rc*rc-(d-flat)*(d-flat)))),flat:rc<=1e-9};}
 if(kind==='cone'){const ang=Math.max(20,Math.min(178,Number(spec.pointAngle)||118))*Math.PI/180,tan=Math.tan(ang/2);
  return{R,f:d=>d/tan,flat:false};}
 return{R,f:()=>0,flat:true};
}

/* ============================================================
   Заготовка как карта высот
   ============================================================ */
function blankBlock(cfg){
 const sx=Math.max(5,n(cfg.stockX)||120),sy=Math.max(5,n(cfg.stockY)||80),sz=Math.max(1,n(cfg.stockZ)||25);
 /* шаг подбираем под габарит, но держим сетку в разумном размере */
 let step=.4;
 while((sx/step)*(sy/step)>140000&&step<3)step+=.1;
 const nx=Math.max(8,Math.round(sx/step))+1,ny=Math.max(8,Math.round(sy/step))+1;
 /* ноль детали: угол заготовки или её центр */
 const x0=cfg.zeroX==='center'?-sx/2:0,y0=cfg.zeroY==='center'?-sy/2:0;
 const z=new Float64Array(nx*ny).fill(0); /* Z0 — верхняя плоскость заготовки */
 return{nx,ny,step,x0,y0,sx,sy,sz,zTop:0,zBottom:-sz,z};
}
function cloneBlock(m){return{...m,z:Float64Array.from(m.z)};}
const cellX=(m,i)=>m.x0+i*m.step;
const cellY=(m,j)=>m.y0+j*m.step;

/* Съём одним кадром: развёртка дна инструмента вдоль отрезка.
   Считаем не выборкой по траектории, а прямо по ячейкам: для каждой ячейки
   в габарите хода берём расстояние до отрезка — так нет ни пропусков, ни
   лишней работы, и стенка паза выходит ровной. */
function applyMillCut(mat,seg,cfg,portion=1){
 if(!seg||!seg.cutting||portion<=0)return mat;
 const spec=seg.toolSpec||defaultMillTool(seg.toolStation||0,cfg);
 if(seg.operation==='tap')return mat; /* метчик режет резьбу, отверстие не растит */
 const prof=bottomProfile(spec),R=prof.R;
 const pts=seg.points&&seg.points.length>1?seg.points:[seg.from,seg.to];
 const limit=Math.max(0,Math.min(1,portion));
 const spans=[];let total=0;
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];
  const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);spans.push(d);total+=d;}
 let remain=total*limit;
 for(let i=1;i<pts.length&&remain>1e-9;i++){
  const a=pts[i-1],b=pts[i],d=spans[i-1],take=Math.min(1,d?remain/d:1);
  const ex=a.x+(b.x-a.x)*take,ey=a.y+(b.y-a.y)*take,ez=a.z+(b.z-a.z)*take;
  sweepCapsule(mat,a.x,a.y,a.z,ex,ey,ez,R,prof.f,prof.flat);
  remain-=d*take;
 }
 return mat;
}
/* развёртка круглого дна вдоль отрезка — «капсула» на карте высот */
function sweepCapsule(mat,ax,ay,az,bx,by,bz,R,f,flatBottom){
 const lo=Math.max(mat.zBottom,Math.min(az,bz));
 if(lo>mat.zTop+1e-9&&Math.min(az,bz)>mat.zTop)return; /* инструмент выше заготовки */
 const minX=Math.min(ax,bx)-R,maxX=Math.max(ax,bx)+R;
 const minY=Math.min(ay,by)-R,maxY=Math.max(ay,by)+R;
 const i0=Math.max(0,Math.floor((minX-mat.x0)/mat.step)),i1=Math.min(mat.nx-1,Math.ceil((maxX-mat.x0)/mat.step));
 const j0=Math.max(0,Math.floor((minY-mat.y0)/mat.step)),j1=Math.min(mat.ny-1,Math.ceil((maxY-mat.y0)/mat.step));
 const dx=bx-ax,dy=by-ay,dz=bz-az,len2=dx*dx+dy*dy,len=Math.sqrt(len2);
 /* Ячейку инструмент накрывает не в одной точке хода, а на целом отрезке: от входа
    в круг ⌀ фрезы до выхода из него. Если за это время он ещё и опускается — рампа,
    спираль, врезание — самое низкое положение приходится на выход, а не на точку
    наибольшего сближения. Считать только сближение значило бы оставлять на дне
    рампы гребень высотой «уклон × половина хорды»: на 45° входе фрезой ⌀10 это
    целых 5 мм несрезанного металла. Поэтому находим отрезок перекрытия точно и
    берём минимум по нему.
    У плоского дна высота вдоль отрезка линейна, и хватает двух концов; у сферы,
    радиуса при вершине и конуса сверла она выпуклая — там берём и середину. */
 const curved=!flatBottom;
 for(let j=j0;j<=j1;j++){
  const y=cellY(mat,j),row=j*mat.nx;
  for(let i=i0;i<=i1;i++){
   const x=cellX(mat,i);
   const tn=len2?((x-ax)*dx+(y-ay)*dy)/len2:0;
   /* расстояние от ячейки до бесконечной прямой хода */
   const cx=ax+dx*tn,cy=ay+dy*tn,perp2=(x-cx)*(x-cx)+(y-cy)*(y-cy);
   const rem=R*R-perp2;
   if(rem<0)continue; /* дальше радиуса фрезы — капсула ячейку не задевает */
   const half=len>1e-9?Math.sqrt(rem)/len:Infinity;
   const tLo=Math.max(0,tn-half),tHi=Math.min(1,tn+half);
   if(tLo>tHi)continue; /* перекрытие пришлось за пределы отрезка */
   let z=Infinity;
   const steps=curved?8:1;
   for(let s=0;s<=steps;s++){
    const t=tLo+(tHi-tLo)*(s/steps);
    const px=ax+dx*t,py=ay+dy*t,raw=Math.hypot(x-px,y-py);
    /* на концах отрезка расстояние равно радиусу с точностью до округления:
       без допуска ячейка на самом краю фрезы то попадала бы в рез, то нет,
       и в пазу появлялись бы пропуски */
    if(raw>R+1e-9)continue;
    const zz=az+dz*t+f(raw<R?raw:R);
    if(zz<z)z=zz;
   }
   if(z===Infinity)continue;
   const k=row+i;
   if(z<mat.z[k])mat.z[k]=Math.max(mat.zBottom,z);
  }
 }
}
/* полный пересчёт — для проверок и опорных снимков */
function blockProfile(result,cfg,upto,partial){
 const mat=blankBlock(cfg),segs=result&&result.segments||[];
 const end=Math.max(0,Math.min(segs.length,Number.isFinite(upto)?upto:segs.length));
 for(let i=0;i<end;i++)applyMillCut(mat,segs[i],cfg,1);
 if(segs[end]&&partial>0)applyMillCut(mat,segs[end],cfg,partial);
 return mat;
}
/* инкрементальный съём с опорными снимками — тот же приём, что в токарном */
function makeMillCutter(result,cfg){
 const segs=result&&result.segments||[],stride=Math.max(24,Math.ceil(segs.length/30));
 const marks=[{index:0,mat:blankBlock(cfg)}];
 let cur=cloneBlock(marks[0].mat),curIndex=0;
 const advanceTo=index=>{
  let best=marks[0];
  for(let i=marks.length-1;i>=0;i--)if(marks[i].index<=index){best=marks[i];break;}
  if(curIndex>index||curIndex<best.index){cur=cloneBlock(best.mat);curIndex=best.index;}
  while(curIndex<index&&segs[curIndex]){
   applyMillCut(cur,segs[curIndex],cfg,1);curIndex++;
   if(curIndex%stride===0&&marks[marks.length-1].index<curIndex)marks.push({index:curIndex,mat:cloneBlock(cur)});
  }
  return cur;
 };
 return{segments:segs.length,
  at(index,partial){
   const end=Math.max(0,Math.min(segs.length,Number.isFinite(index)?index:segs.length)),base=advanceTo(end);
   if(!(partial>0)||!segs[end])return base;
   const view=cloneBlock(base);applyMillCut(view,segs[end],cfg,partial);return view;
  }};
}

/* ============================================================
   Разбор фрезерной программы. Координаты радиусные, плоскость G17.
   ============================================================ */
const stripComments=s=>String(s||'').replace(/\([^)]*\)/g,' ').replace(/;.*$/,' ').trim().toUpperCase();
function words(line){const out={},all=[];
 String(line||'').replace(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g,(m,k,v)=>{
  all.push({key:k,raw:v,value:Number(v),hasDecimal:v.includes('.')});out[k]=Number(v);return m;});
 return{out,all};}

/* дуга в плоскости XY по I/J или R */
function arcXY(from,to,w,cw,unit){
 const a={x:from.x,y:from.y},b={x:to.x,y:to.y};
 const chord=Math.hypot(b.x-a.x,b.y-a.y);
 let centres=[];
 if(Number.isFinite(w.I)||Number.isFinite(w.J)){
  centres=[{x:a.x+(Number.isFinite(w.I)?w.I*unit:0),y:a.y+(Number.isFinite(w.J)?w.J*unit:0)}];
 }else if(Number.isFinite(w.R)){
  const rad=Math.abs(w.R*unit);
  if(chord<1e-9||rad<chord/2-1e-6)return null;
  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,hgt=Math.sqrt(Math.max(0,rad*rad-chord*chord/4));
  const px=-(b.y-a.y)/chord,py=(b.x-a.x)/chord;
  centres=[{x:mx+px*hgt,y:my+py*hgt},{x:mx-px*hgt,y:my-py*hgt}];
 }else return null;
 const wantLong=Number.isFinite(w.R)&&w.R<0;
 /* Полная окружность: центр задан через I/J, а конечная точка совпадает с начальной.
    Разность углов при этом равна нулю, и без отдельной ветки дуга выродилась бы
    в точку — кадр не снял бы ни грамма. Через R полный круг задать нельзя. */
 const full=!Number.isFinite(w.R)&&Math.hypot(b.x-a.x,b.y-a.y)<1e-6;
 let pick=null;
 centres.forEach(c=>{
  const r=Math.hypot(a.x-c.x,a.y-c.y),sa=Math.atan2(a.y-c.y,a.x-c.x),ea=Math.atan2(b.y-c.y,b.x-c.x);
  let sweep=ea-sa;
  while(sweep<=-Math.PI)sweep+=Math.PI*2;while(sweep>Math.PI)sweep-=Math.PI*2;
  if(full)sweep=cw?-Math.PI*2:Math.PI*2;
  else{if(cw&&sweep>0)sweep-=Math.PI*2;if(!cw&&sweep<0)sweep+=Math.PI*2;}
  const long=Math.abs(sweep)>Math.PI+1e-6;
  if(centres.length===1||long===wantLong)pick={c,sa,sweep,r};
 });
 if(!pick)return null;
 const endR=Math.hypot(b.x-pick.c.x,b.y-pick.c.y);
 if(Math.abs(endR-pick.r)>Math.max(.02,pick.r*.002))return null;
 const count=Math.max(8,Math.min(240,Math.ceil(Math.abs(pick.sweep)*pick.r/.8))),out=[];
 for(let i=0;i<=count;i++){const q=i/count,ang=pick.sa+pick.sweep*q;
  out.push({x:pick.c.x+Math.cos(ang)*pick.r,y:pick.c.y+Math.sin(ang)*pick.r,z:from.z+(to.z-from.z)*q});}
 out[0]={...from};out[out.length-1]={...to};
 return out;
}

function detectMillTools(code,cfg){
 const map=new Map(),lines=String(code||'').split(/\r?\n/);let active=0;
 lines.forEach((src,idx)=>{
  const hint=millHint(src),clean=stripComments(src),{out,all}=words(clean);
  if(Number.isFinite(out.T)){
   active=millStation(out.T);
   if(active){const codeText=String(Math.abs(Math.round(out.T))).padStart(2,'0');
    if(!map.has(active))map.set(active,{station:active,code:codeText,firstLine:idx+1,hints:[]});}
  }
  if(!active)return;
  const gs=all.filter(w=>w.key==='G').map(w=>Math.round(w.value)),e=map.get(active);
  if(hint)e.hints.push(hint);
  if(gs.some(g=>[81,82,83,73,85].includes(g)))e.hints.push({operation:'drill',kind:'drill8'});
  if(gs.includes(84))e.hints.push({operation:'tap',kind:'tapm10'});
 });
 return[...map.values()].map(e=>{const c=defaultMillTool(e.station,cfg,{...(e.hints[0]||{}),code:e.code});
  c.firstLine=e.firstLine;return c;});
}
function normalizeMillTools(cfg,catalog){
 const supplied=cfg&&cfg.toolConfigs||{},out={};
 (catalog||[]).forEach(item=>{
  const saved=supplied[item.station]||supplied[String(item.station)]||{},base=defaultMillTool(item.station,cfg,item);
  const kind=saved.kind||base.kind,lib=MILL_TOOLS[kind]||MILL_TOOLS.em10;
  out[item.station]={...base,...saved,station:item.station,code:item.code||base.code,kind,
   operation:saved.operation||base.operation||lib.operation,
   diameter:Number(saved.diameter??base.diameter),corner:Number(saved.corner??base.corner),
   flute:Number(saved.flute??base.flute),shankD:Number(saved.shankD??base.shankD),
   holderD:Number(saved.holderD??base.holderD),holderLen:Number(saved.holderLen??base.holderLen),
   pointAngle:Number(saved.pointAngle??base.pointAngle),teeth:Number(saved.teeth??base.teeth)||2,
   bottom:saved.bottom||base.bottom||lib.bottom||'flat',
   confirmed:saved.confirmed==null?base.confirmed:saved.confirmed===true};
 });
 return out;
}

function parseMillGcode(code,rawCfg){
 const cfg={...defaults(),...(rawCfg||{})},issues=[],segments=[],seen=new Set();
 const lines=String(code||'').split(/\r?\n/);
 const catalog=detectMillTools(code,cfg),toolConfigs=normalizeMillTools({...cfg,toolConfigs:cfg.toolConfigs||{}},catalog);
 cfg.toolConfigs=toolConfigs;
 const add=(type,text,line,seg)=>{const key=type+':'+text+':'+(line||0);
  if(seen.has(key))return;seen.add(key);issues.push({type,text,line:line||0});
  if(seg){seg.suspicious=true;(seg.reasons||(seg.reasons=[])).push(text);}};
 const stationSpec=st=>toolConfigs[st]||defaultMillTool(st,cfg,{code:String(st).padStart(2,'0')});

 let pos={x:0,y:0,z:50},motion='G00',unit=1,abs=true,plane=17,comp=0,compD=0,lengthComp=false;
 let spindleOn=false,spindleStarted=false,ended=false,rpm=cfg.rpm,feed=cfg.feed,station=0,toolCode='';
 let retract=5,planeG98=true,cycle=null;
 const mat=blankBlock(cfg);
 const surfaceAt=(x,y)=>{
  const i=Math.round((x-mat.x0)/mat.step),j=Math.round((y-mat.y0)/mat.step);
  if(i<0||j<0||i>=mat.nx||j>=mat.ny)return -Infinity; /* вне заготовки металла нет */
  return mat.z[j*mat.nx+i];
 };
 const toPoint=(from,out,u)=>{const to={...from};
  if(abs){if(Number.isFinite(out.X))to.x=out.X*u;if(Number.isFinite(out.Y))to.y=out.Y*u;if(Number.isFinite(out.Z))to.z=out.Z*u;}
  else{if(Number.isFinite(out.X))to.x=from.x+out.X*u;if(Number.isFinite(out.Y))to.y=from.y+out.Y*u;if(Number.isFinite(out.Z))to.z=from.z+out.Z*u;}
  return to;};

 const makeSeg=(from,to,opt={})=>{
  const spec=opt.toolSpec||stationSpec(opt.station==null?station:opt.station);
  const m=opt.motion||motion,arc=m==='G02'||m==='G03';
  const rapid=opt.rapid==null?m==='G00':!!opt.rapid;
  const pts=opt.points||[{...from},{...to}];
  return{from:{...pts[0]},to:{...pts[pts.length-1]},points:pts,motion:m,arc,cw:m==='G02',rapid,
   cutting:opt.cutting==null?(!rapid&&spindleOn):!!opt.cutting,spindle:spindleOn,
   rpm:opt.rpm||rpm,feed:opt.feed||feed,line:opt.line||0,source:opt.source||'',clean:opt.clean||'',
   toolCode:opt.toolCode==null?toolCode:opt.toolCode,toolStation:spec.station||0,toolSpec:{...spec},
   operation:opt.operation||spec.operation||'mill',cycle:opt.cycle||'',synthetic:!!opt.synthetic,
   compMode:opt.compMode==null?comp:opt.compMode,suspicious:false,reasons:[]};
 };
 const push=seg=>{
  const spec=seg.toolSpec,R=Math.max(.05,(spec.diameter||0)/2);
  const pts=seg.points;
  /* проверки по фактическому положению инструмента */
  for(let i=0;i<pts.length;i++){
   const q=pts[i];
   if(q.z<mat.zBottom-.001){add('bad','Инструмент уходит ниже дна заготовки: под ней стол или тиски.',seg.line,seg);break;}
   const surf=surfaceAt(q.x,q.y);
   if(seg.rapid&&!seg.cycle&&Number.isFinite(surf)&&q.z<surf-.02){
    add('bad','Быстрый ход G00 идёт сквозь неснятый металл.',seg.line,seg);break;}
   if(!seg.rapid&&spec.flute&&q.z<mat.zTop-spec.flute-.001){
    add('bad','Глубина больше режущей части '+spec.flute+' мм: в резе окажется хвостовик.',seg.line,seg);break;}
   if(!seg.rapid&&spec.holderD>spec.diameter&&Number.isFinite(surf)&&q.z<surf-.02&&spec.flute&&q.z<mat.zTop-spec.flute*.9){
    add('warn','Оправка близко к поверхности: проверьте вылет инструмента.',seg.line,seg);break;}
  }
  if(!seg.rapid&&seg.cutting&&seg.operation==='mill'){
   /* врезание строго по Z на рабочей подаче — частая причина поломки фрезы */
   const dz=seg.to.z-seg.from.z,dxy=Math.hypot(seg.to.x-seg.from.x,seg.to.y-seg.from.y);
   if(dz<-.05&&dxy<.02&&!seg.cycle)add('warn','Врезание вертикально вниз на рабочей подаче: у концевой фрезы центр не режет. Заходите по спирали, рампой или в готовое отверстие.',seg.line,seg);
  }
  segments.push(seg);applyMillCut(mat,seg,cfg,1);return seg;
 };
 const line=(from,to,opt)=>push(makeSeg(from,to,opt));

 /* компенсация радиуса фрезы: смещаем отрезок по нормали.
    В углах контура это приближение — о нём предупреждаем отдельно. */
 const offsetPoints=(pts,mode,R)=>{
  if(!mode||!(R>0)||pts.length<2)return pts.map(p=>({...p}));
  return pts.map((p,i)=>{
   const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
   if(!len)return{...p};
   const nx=mode===42?dy/len:-dy/len,ny=mode===42?-dx/len:dx/len;
   return{x:p.x+nx*R,y:p.y+ny*R,z:p.z};
  });
 };

 lines.forEach((source,index)=>{
  const clean=stripComments(source);if(!clean)return;
  const line1=index+1,{out,all}=words(clean);
  const gs=all.filter(w=>w.key==='G').map(w=>Math.round(w.value));
  const ms=all.filter(w=>w.key==='M').map(w=>Math.round(w.value));
  if(gs.includes(20))unit=25.4;if(gs.includes(21))unit=1;
  if(gs.includes(90))abs=true;if(gs.includes(91))abs=false;
  if(gs.includes(17))plane=17;if(gs.includes(18))plane=18;if(gs.includes(19))plane=19;
  if(gs.includes(40))comp=0;if(gs.includes(41))comp=41;if(gs.includes(42))comp=42;
  if(gs.includes(43))lengthComp=true;if(gs.includes(49))lengthComp=false;
  if(gs.includes(98))planeG98=true;if(gs.includes(99))planeG98=false;
  if(gs.includes(0))motion='G00';if(gs.includes(1))motion='G01';if(gs.includes(2))motion='G02';if(gs.includes(3))motion='G03';
  if(ms.some(x=>[3,4].includes(x))){spindleOn=true;spindleStarted=true;}
  if(ms.includes(5))spindleOn=false;
  if(ms.includes(30)||ms.includes(2)){ended=true;spindleOn=false;}
  if(Number.isFinite(out.S))rpm=out.S;
  if(Number.isFinite(out.F))feed=out.F;
  if(Number.isFinite(out.D))compD=out.D;
  if(Number.isFinite(out.T)){const t=Math.abs(Math.round(out.T));toolCode=String(t).padStart(2,'0');station=millStation(t);}
  if(clean.includes('#')||/\b(IF|WHILE|GOTO|M97|M98)\b/.test(clean))
   add('bad','Макросы и подпрограммы нельзя достоверно раскрыть: вставьте развёрнутую программу.',line1);
  if(plane!==17&&(gs.includes(2)||gs.includes(3)))
   add('warn','Дуга задана не в плоскости G17: эмулятор строит её в XY.',line1);
  if(gs.includes(28)||gs.includes(53))add('warn','G28/G53 показан как программная линия: машинный ноль проверяется на стойке.',line1);
  if(comp&&!compD)add('warn','G41/G42 без адреса D: корректор радиуса не назначен.',line1);

  const spec=stationSpec(station),op=spec.operation||'mill';
  const R=Math.max(.05,(spec.diameter||0)/2);

  /* --- отмена цикла --- */
  if(gs.includes(80)){cycle=null;return;}

  /* --- циклы сверления --- */
  const drillCycle=gs.find(g=>[81,82,83,73,84,85].includes(g));
  if(drillCycle!=null){
   if(!['drill','tap'].includes(op))add('bad','G'+drillCycle+' требует назначить станции осевой инструмент.',line1);
   const z=Number.isFinite(out.Z)?out.Z*unit:NaN;
   const r=Number.isFinite(out.R)?out.R*unit:retract;
   retract=r;
   if(!Number.isFinite(z)){add('bad','G'+drillCycle+': не задана глубина Z.',line1);return;}
   cycle={code:drillCycle,z,r,q:Number.isFinite(out.Q)?Math.abs(out.Q*unit):0,line:line1,clean};
   const to=toPoint(pos,out,unit);
   runDrill(cycle,{x:to.x,y:to.y},spec,line1,source,clean);
   pos={x:to.x,y:to.y,z:planeG98?Math.max(pos.z,r):r};
   return;
  }
  /* повтор цикла кадром с одними координатами */
  if(cycle&&!gs.length&&(Number.isFinite(out.X)||Number.isFinite(out.Y))){
   const to=toPoint(pos,out,unit);
   runDrill(cycle,{x:to.x,y:to.y},spec,line1,source,clean);
   pos={x:to.x,y:to.y,z:planeG98?pos.z:cycle.r};
   return;
  }

  /* Кадр полной окружности пишут без конечной точки: G02 I-20. J0. Координат в нём
     нет, но движение есть, поэтому одних X/Y/Z для проверки недостаточно. */
  const circleOnly=(motion==='G02'||motion==='G03')&&['I','J','R'].some(k=>Number.isFinite(out[k]));
  const hasMove=['X','Y','Z'].some(k=>Number.isFinite(out[k]))||circleOnly;
  if(!hasMove)return;
  const to=toPoint(pos,out,unit);
  const arc=motion==='G02'||motion==='G03';
  let pts=arc?arcXY(pos,to,out,motion==='G02',unit):[{...pos},{...to}];
  if(arc&&!pts){add('bad','Дуга G02/G03 не построена: проверьте I/J либо R и конечную точку.',line1);pts=[{...pos},{...to}];}
  const rapid=motion==='G00';
  if(!rapid&&comp)pts=offsetPoints(pts,comp,R);
  push(makeSeg(pos,to,{motion,points:pts,line:line1,source,clean,toolSpec:spec,operation:op}));
  pos=to;
 });

 function runDrill(c,at,spec,line1,source,clean){
  const start={x:at.x,y:at.y,z:pos.z};
  const rPlane={x:at.x,y:at.y,z:c.r};
  if(Math.hypot(start.x-pos.x,start.y-pos.y)>1e-6||Math.abs(start.z-pos.z)>1e-6)
   line(pos,start,{motion:'G00',rapid:true,cutting:false,line:line1,source,clean,toolSpec:spec,cycle:'G'+c.code,synthetic:true});
  line(start,rPlane,{motion:'G00',rapid:true,cutting:false,line:line1,source,clean,toolSpec:spec,cycle:'G'+c.code,synthetic:true});
  const peck=(c.code===83||c.code===73)&&c.q>0?c.q:Math.abs(c.r-c.z);
  let z=c.r;let guard=0;
  while(z>c.z+.001&&guard++<300){
   const next=Math.max(c.z,z-peck);
   line({x:at.x,y:at.y,z},{x:at.x,y:at.y,z:next},{motion:'G01',rapid:false,cutting:true,line:line1,source,clean,toolSpec:spec,cycle:'G'+c.code,synthetic:true});
   z=next;
   if(z>c.z+.001){
    /* G83 выводит стружку на плоскость отвода, G73 только ломает её коротким подъёмом */
    const back=c.code===83?c.r:z+Math.min(1,peck*.4);
    line({x:at.x,y:at.y,z},{x:at.x,y:at.y,z:back},{motion:'G00',rapid:true,cutting:false,line:line1,source,clean,toolSpec:spec,cycle:'G'+c.code,synthetic:true});
    line({x:at.x,y:at.y,z:back},{x:at.x,y:at.y,z},{motion:'G00',rapid:true,cutting:false,line:line1,source,clean,toolSpec:spec,cycle:'G'+c.code,synthetic:true});
   }
  }
  const up=planeG98?Math.max(start.z,c.r):c.r;
  line({x:at.x,y:at.y,z:c.z},{x:at.x,y:at.y,z:up},{motion:'G00',rapid:true,cutting:false,line:line1,source,clean,toolSpec:spec,cycle:'G'+c.code,synthetic:true});
 }

 if(comp)add('bad','Компенсация G41/G42 не отменена кодом G40.',lines.length);
 if(!spindleStarted&&segments.length)add('warn','Не найден запуск шпинделя M03/M04.',0);
 if(!lengthComp&&segments.length)add('warn','G43 не найден: длина инструмента не скомпенсирована. На стойке это уход по Z на весь вылет.',0);
 if(!ended)add('warn','Не найдено завершение программы M30.',0);
 if(!segments.length)add('bad','Не найдено перемещений X/Y/Z для графической проверки.',0);
 catalog.forEach(t=>{const c=toolConfigs[t.station];
  if(c&&!c.confirmed)add('warn','T'+String(t.station).padStart(2,'0')+': назначение и габариты инструмента ещё не подтверждены оператором.',t.firstLine);});
 const bad=issues.filter(x=>x.type==='bad').length,warn=issues.filter(x=>x.type==='warn').length;
 return{segments,issues,lines,tools:catalog.map(t=>toolConfigs[t.station]||t),
  geometry:summarizeBlock(mat,cfg),
  stats:{blocks:lines.filter(x=>stripComments(x)).length,moves:segments.length,
   cuts:segments.filter(x=>x.cutting).length,bad,warn},cfg};
}

function summarizeBlock(mat,cfg){
 let deepest=mat.zTop,removed=0,touched=0;
 for(let i=0;i<mat.z.length;i++){
  const z=mat.z[i];
  if(z<mat.zTop-1e-9){touched++;removed+=(mat.zTop-z);}
  if(z<deepest)deepest=z;
 }
 const cell=mat.step*mat.step;
 return{deepest:Number(deepest.toFixed(3)),
  removedCm3:Number((removed*cell/1000).toFixed(2)),
  touchedPct:Number((touched/mat.z.length*100).toFixed(1))};
}
/* габариты заготовки по программе */
function inferBlock(result,cfg){
 const segs=result&&result.segments||[],cut=segs.filter(s=>s.cutting),basis=cut.length?cut:segs;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity;
 basis.forEach(s=>(s.points||[s.to]).forEach(p=>{
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
  minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
  if(Number.isFinite(p.z))minZ=Math.min(minZ,p.z);}));
 if(!Number.isFinite(minX))return{stockX:cfg.stockX,stockY:cfg.stockY,stockZ:cfg.stockZ};
 const pad=8;
 const sx=Math.min(600,Math.max(20,Math.ceil((maxX-Math.min(0,minX)+pad)/5)*5));
 const sy=Math.min(600,Math.max(20,Math.ceil((maxY-Math.min(0,minY)+pad)/5)*5));
 const sz=Math.min(300,Math.max(5,Math.ceil((Math.abs(Math.min(0,minZ))+5)/5)*5));
 return{stockX:sx,stockY:sy,stockZ:sz};
}

/* ============================================================
   Отрисовка. Вид сверху — карта высот, под ним разрез по выбранной линии.
   Цвета траектории общие с токарным эмулятором: G0 синий, G1 зелёный,
   G2 жёлтый, G3 оранжевый — как на бэкплоте CIMCO.
   ============================================================ */
const PATH={rapid:'#4a86ff',line:'#41d977',cw:'#ffe14d',ccw:'#ff9330',bad:'#ff4438'};
const MILLC={bg:'#080b0e',grid:'#141d25',grid2:'#20303c',text:'#8fa0ac',edge:'#a9bcc7',
 frame:'#3f4f5b',tool:'#f1bd72',holder:'#212b33'};

function canvasSpace(canvas){
 const rect=canvas.getBoundingClientRect?canvas.getBoundingClientRect():{width:720,height:420};
 const w=Math.max(280,rect.width||720),hgt=Math.max(200,rect.height||w/1.6);
 const dpr=Math.min(2,window.devicePixelRatio||1);
 const W=Math.round(w*dpr),H=Math.round(hgt*dpr);
 if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 return{ctx,w,h:hgt};
}
/* Цвет по глубине. Линейная шкала на плите 30 мм делает торцевание на 1 мм
   неотличимым от нетронутой поверхности, поэтому берём корневую шкалу — первые
   миллиметры получают заметно больше диапазона — и добавляем горизонтали через
   каждые 5 мм, как на карте: по ним глубина читается без наведения мыши. */
function depthColor(z,zTop,zBottom,out){
 const depth=zTop-z,span=Math.max(.001,zTop-zBottom);
 if(depth<=1e-6){out[0]=150;out[1]=166;out[2]=176;return;} /* нетронутая поверхность плиты */
 const t=Math.min(1,Math.sqrt(depth/span));
 let r=Math.round(124-96*t),g=Math.round(146-112*t),b=Math.round(163-124*t);
 const band=depth%5;
 if(band<.35||band>4.65){r=Math.max(0,r-16);g=Math.max(0,g-16);b=Math.max(0,b-14);}
 out[0]=r;out[1]=g;out[2]=b;
}
/* Растр карты высот в разрешении сетки. Перерисовывается только когда счётчик
   версии металла изменился, поэтому на прокрутке и зуме работы нет вовсе. */
let heightCanvas=null,heightVersion=-1,heightKey='',matClock=0;
const bumpMat=st=>{if(st)st.matVersion=++matClock;};
function heightBitmap(mat,state){
 const key=mat.nx+'x'+mat.ny+':'+mat.zTop+':'+mat.zBottom;
 const version=state&&Number.isFinite(state.matVersion)?state.matVersion:-1;
 if(heightCanvas&&heightKey===key&&heightVersion===version&&version>=0)return heightCanvas;
 if(!heightCanvas||heightKey!==key){
  if(typeof document.createElement!=='function')return null;
  heightCanvas=document.createElement('canvas');
  heightCanvas.width=mat.nx;heightCanvas.height=mat.ny;
  heightKey=key;
 }
 const hctx=heightCanvas.getContext('2d');
 if(!hctx||!hctx.createImageData)return null;
 const img=hctx.createImageData(mat.nx,mat.ny),d=img.data,rgb=[0,0,0];
 /* строка 0 растра — верх кадра, то есть максимальный Y детали */
 for(let j=0;j<mat.ny;j++){
  const row=(mat.ny-1-j)*mat.nx,src=j*mat.nx;
  for(let i=0;i<mat.nx;i++){
   depthColor(mat.z[src+i],mat.zTop,mat.zBottom,rgb);
   const o=(row+i)*4;d[o]=rgb[0];d[o+1]=rgb[1];d[o+2]=rgb[2];d[o+3]=255;
  }
 }
 hctx.putImageData(img,0,0);
 heightVersion=version;
 return heightCanvas;
}
function millGeom(W,H,mat,zoom,panX,panY){
 const padL=40,padR=14,padT=12,secH=viewState.showSection?Math.max(70,H*.26):0,gap=viewState.showSection?16:0;
 const topH=Math.max(60,H-secH-gap-padT-18);
 const k=Math.min((W-padL-padR)/Math.max(1,mat.sx),topH/Math.max(1,mat.sy))*Math.max(.2,zoom||1);
 const ox=padL+((W-padL-padR)-mat.sx*k)/2-mat.x0*k+(panX||0);
 const oy=padT+(topH-mat.sy*k)/2-mat.y0*k+(panY||0);
 return{k,ox,oy,padL,padR,padT,topH,secH,gap,
  MX:x=>ox+x*k,MY:y=>oy+(mat.sy-(y-mat.y0))*k, /* Y вверх, как на чертеже */
  invX:sx=>(sx-ox)/k,invY:sy=>mat.y0+mat.sy-(sy-oy)/k,
  secTop:padT+topH+gap};
}
function drawMill(canvas,state){
 if(!canvas)return;
 const S=canvasSpace(canvas),ctx=S.ctx,W=S.w,H=S.h;
 ctx.clearRect(0,0,W,H);ctx.fillStyle=MILLC.bg;ctx.fillRect(0,0,W,H);
 if(!state||!state.material){ctx.fillStyle=MILLC.text;ctx.font='500 11px "IBM Plex Mono",monospace';
  ctx.fillText('Откройте фрезерную NC-программу',16,H/2);return;}
 const mat=state.material,G=millGeom(W,H,mat,viewState.zoom,viewState.panX,viewState.panY);
 /* карта высот через отдельный холст размером в саму сетку: перекрашивать его надо
    только когда изменился металл, а масштабирование под текущий зум делает уже
    браузер. Иначе на каждом кадре пришлось бы считать цвет для каждого экранного
    пикселя — на плите 190×75 это четверть миллиона точек в кадр. */
 if(viewState.showStock){
  const bmp=heightBitmap(mat,state);
  if(bmp){
   const prev=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=false;
   ctx.drawImage(bmp,G.MX(mat.x0),G.MY(mat.y0+mat.sy),mat.sx*G.k,mat.sy*G.k);
   ctx.imageSmoothingEnabled=prev;
  }
  ctx.strokeStyle=MILLC.frame;ctx.lineWidth=1.2;
  ctx.strokeRect(G.MX(mat.x0),G.MY(mat.y0+mat.sy),mat.sx*G.k,mat.sy*G.k);
 }
 /* сетка и линейки */
 if(viewState.showGrid){
  const stepMm=niceStep(56,G.k);
  ctx.font='500 8px "IBM Plex Mono",monospace';ctx.textBaseline='middle';
  for(let x=Math.ceil(mat.x0/stepMm)*stepMm;x<=mat.x0+mat.sx+.001;x+=stepMm){
   const sx=G.MX(x);ctx.strokeStyle=Math.abs(x)<1e-6?MILLC.grid2:MILLC.grid;
   ctx.beginPath();ctx.moveTo(sx,G.padT);ctx.lineTo(sx,G.padT+G.topH);ctx.stroke();
   ctx.fillStyle=MILLC.text;ctx.textAlign='center';ctx.fillText(String(Math.round(x)),sx,G.padT+G.topH+8);}
  for(let y=Math.ceil(mat.y0/stepMm)*stepMm;y<=mat.y0+mat.sy+.001;y+=stepMm){
   const sy=G.MY(y);ctx.strokeStyle=Math.abs(y)<1e-6?MILLC.grid2:MILLC.grid;
   ctx.beginPath();ctx.moveTo(G.padL-6,sy);ctx.lineTo(W-G.padR,sy);ctx.stroke();
   ctx.fillStyle=MILLC.text;ctx.textAlign='right';ctx.fillText(String(Math.round(y)),G.padL-9,sy);}
  ctx.textAlign='left';
 }
 /* ноль детали */
 const zx=G.MX(0),zy=G.MY(0);
 ctx.strokeStyle='#ff8a34';ctx.lineWidth=1.4;ctx.beginPath();
 ctx.moveTo(zx,zy-8);ctx.lineTo(zx,zy+8);ctx.moveTo(zx-8,zy);ctx.lineTo(zx+8,zy);ctx.stroke();
 ctx.fillStyle='#ff8a34';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText('X0 Y0',zx+9,zy-9);
 /* траектория */
 if(viewState.showPath&&millResult){
  ctx.save();ctx.beginPath();ctx.rect(G.padL-8,0,W-G.padL-G.padR+16,G.padT+G.topH+2);ctx.clip();
  ctx.lineJoin='round';ctx.lineCap='round';
  const cur=state.segment;
  millResult.segments.forEach((seg,idx)=>{
   if(seg.rapid&&!viewState.showRapid)return;
   const pts=seg.points||[seg.from,seg.to];
   ctx.strokeStyle=seg.suspicious?PATH.bad:seg.rapid?PATH.rapid:seg.arc?(seg.cw?PATH.cw:PATH.ccw):PATH.line;
   ctx.lineWidth=seg.suspicious?2.4:idx===cur?2.6:1.3;
   ctx.globalAlpha=seg.suspicious?1:idx===cur?1:.75;
   if(seg.rapid)ctx.setLineDash([6,5]);
   ctx.beginPath();pts.forEach((p,i)=>{const X=G.MX(p.x),Y=G.MY(p.y);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});
   ctx.stroke();if(seg.rapid)ctx.setLineDash([]);
  });
  ctx.globalAlpha=1;ctx.restore();
 }
 /* инструмент в реальном диаметре */
 if(viewState.showTool){
  const p=state.point,spec=state.spec;
  if(p&&spec){
   const R=Math.max(.05,(spec.diameter||0)/2)*G.k,hr=Math.max(R,(spec.holderD||0)/2*G.k);
   ctx.save();ctx.beginPath();ctx.rect(G.padL-8,0,W-G.padL-G.padR+16,G.padT+G.topH+2);ctx.clip();
   ctx.strokeStyle='rgba(120,140,155,.5)';ctx.lineWidth=1;
   ctx.beginPath();ctx.arc(G.MX(p.x),G.MY(p.y),hr,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle='rgba(241,189,114,.28)';ctx.strokeStyle=MILLC.tool;ctx.lineWidth=1.5;
   ctx.beginPath();ctx.arc(G.MX(p.x),G.MY(p.y),R,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.beginPath();ctx.moveTo(G.MX(p.x)-4,G.MY(p.y));ctx.lineTo(G.MX(p.x)+4,G.MY(p.y));
   ctx.moveTo(G.MX(p.x),G.MY(p.y)-4);ctx.lineTo(G.MX(p.x),G.MY(p.y)+4);ctx.stroke();
   ctx.restore();
   const label='T'+String(state.station||0).padStart(2,'0')+' ⌀'+n(spec.diameter).toFixed(1);
   const coord='X'+p.x.toFixed(2)+' Y'+p.y.toFixed(2)+' Z'+p.z.toFixed(2);
   const bw=Math.max(120,coord.length*5.6+14);
   const lx=Math.min(W-bw-4,Math.max(G.padL,G.MX(p.x)+12)),ly=Math.max(12,G.MY(p.y)-34);
   ctx.fillStyle='rgba(5,8,11,.88)';ctx.strokeStyle='rgba(129,150,162,.35)';
   rounded(ctx,lx,ly,bw,27,5);ctx.fill();ctx.stroke();
   ctx.fillStyle=MILLC.tool;ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText(label,lx+6,ly+11);
   ctx.fillStyle='#9fd8ff';ctx.fillText(coord,lx+6,ly+22);
  }
 }
 /* разрез по выбранной линии */
 if(viewState.showSection)drawSection(ctx,G,mat,state,W,H);
 ctx.fillStyle=MILLC.text;ctx.font='500 8px "IBM Plex Mono",monospace';
 ctx.fillText('X, мм',W-42,G.padT+G.topH+8);ctx.fillText('Y',6,G.padT+6);
}
function drawSection(ctx,G,mat,state,W,H){
 const axis=viewState.sectionAxis==='y'?'y':'x';
 const top=G.secTop,hgt=Math.max(50,G.secH),base=top+hgt-12;
 /* по высоте разрез растягиваем на всю полосу: на плите 30 мм фаска 1 мм иначе не видна */
 const zScale=(hgt-26)/Math.max(1,mat.zTop-mat.zBottom);
 ctx.fillStyle='#0b1014';ctx.fillRect(G.padL-6,top,W-G.padL-G.padR+12,hgt);
 ctx.strokeStyle=MILLC.frame;ctx.lineWidth=1;ctx.strokeRect(G.padL-6,top,W-G.padL-G.padR+12,hgt);
 /* линия разреза берётся от текущего положения инструмента, иначе от центра */
 const at=state.point?(axis==='x'?state.point.y:state.point.x):(axis==='x'?mat.y0+mat.sy/2:mat.x0+mat.sx/2);
 const idx=axis==='x'
  ?Math.max(0,Math.min(mat.ny-1,Math.round((at-mat.y0)/mat.step)))
  :Math.max(0,Math.min(mat.nx-1,Math.round((at-mat.x0)/mat.step)));
 const count=axis==='x'?mat.nx:mat.ny,span=axis==='x'?mat.sx:mat.sy,origin=axis==='x'?mat.x0:mat.y0;
 const sx=v=>axis==='x'?G.MX(v):G.padL+(v-origin)/Math.max(.001,span)*(W-G.padL-G.padR);
 const zy=z=>base-(z-mat.zBottom)*zScale;
 ctx.beginPath();
 for(let i=0;i<count;i++){
  const v=origin+i*mat.step,z=axis==='x'?mat.z[idx*mat.nx+i]:mat.z[i*mat.nx+idx];
  const X=sx(v),Y=zy(z);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);
 }
 ctx.lineTo(sx(origin+span),zy(mat.zBottom));ctx.lineTo(sx(origin),zy(mat.zBottom));ctx.closePath();
 ctx.fillStyle='#3d4d59';ctx.fill();ctx.strokeStyle=MILLC.edge;ctx.lineWidth=1.2;ctx.stroke();
 ctx.strokeStyle='rgba(255,138,52,.6)';ctx.setLineDash([4,4]);ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(G.padL-6,zy(mat.zTop));ctx.lineTo(W-G.padR+6,zy(mat.zTop));ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle=MILLC.text;ctx.font='500 8px "IBM Plex Mono",monospace';
 ctx.fillText('РАЗРЕЗ ПО '+(axis==='x'?'X при Y':'Y при X')+' = '+at.toFixed(1),G.padL,top+11);
 ctx.fillText('Z0',W-G.padR-16,zy(mat.zTop)-4);
}
function niceStep(px,k){const list=[.5,1,2,5,10,20,25,50,100,200,500];for(const s of list)if(s*k>=px)return s;return 1000;}
function rounded(ctx,x,y,w,hh,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
 ctx.lineTo(x+w,y+hh-r);ctx.quadraticCurveTo(x+w,y+hh,x+w-r,y+hh);ctx.lineTo(x+r,y+hh);
 ctx.quadraticCurveTo(x,y+hh,x,y+hh-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

/* ============================================================
   Экран эмулятора: разметка, проигрывание и обработчики.
   Классы оформления и подсветка кода общие с токарным эмулятором.
   ============================================================ */
const $=s=>document.querySelector(s);
const DEMO=`%
O2000 (ПЛАСТИНА: ТОРЦЕВАНИЕ, КАРМАН, ОТВЕРСТИЯ)
G21 G17 G90 G40 G49 G80
T01 M06 (FACE MILL 50)
G43 H01
S1800 M03 M08
G00 X-30. Y40. Z5.
G01 Z-1. F300
X150. F900
G00 Z50.
T02 M06 (END MILL 10)
G43 H02
S3000 M03
G00 X30. Y30. Z5.
G01 Z-4. F120
G41 D02 X40. F500
Y50.
X80.
Y30.
X40.
G40 G01 X30. Y30.
G00 Z50.
T03 M06 (DRILL 8.5)
G43 H03
S1200 M03
G00 X20. Y15. Z5.
G81 Z-22. R2. F120
X100.
Y65.
X20.
G80
G00 Z80.
M09
M05
M30
%`;

function millView(){
 const c=load(),theme=viewState.codeTheme==='night'?'night':'cimco';
 const layer=(k,label,title)=>'<button data-msim-view="'+k+'" aria-pressed="'+(viewState[k]?'true':'false')+'" title="'+h(title)+'">'+label+'</button>';
 return '<div class="wrap lsim-wrap"><div class="card" data-msim-back style="display:flex;align-items:center;gap:10px;padding:11px 13px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg><span style="font-family:Oswald;letter-spacing:.08em;text-transform:uppercase;font-size:12px">К рабочим инструментам</span></div>'
 +'<div class="experimental-warning"><b>ЭКСПЕРИМЕНТАЛЬНЫЙ ФРЕЗЕРНЫЙ РЕЖИМ</b><span>Модель детали — карта высот по X/Y: она показывает форму сверху и в разрезе, но не боковые поднутрения и не работу пятой оси. Проверьте итоговые размеры и каждый T; перед станком обязательны прогон в графике и SINGLE BLOCK.</span></div>'
 +'<div class="lsim-modebar" role="group" aria-label="Режимы фрезерного эмулятора">'
 +'<div class="lsim-moderow"><span>ВИД</span>'
 +'<button data-msim-section="off" aria-pressed="'+(!viewState.showSection)+'" title="Только вид сверху">СВЕРХУ</button>'
 +'<button data-msim-section="on" aria-pressed="'+(!!viewState.showSection)+'" title="Вид сверху и разрез по линии инструмента">+ РАЗРЕЗ</button></div>'
 +'<div class="lsim-moderow"><span>РАЗРЕЗ</span>'
 +'<button data-msim-axis="x" aria-pressed="'+(viewState.sectionAxis!=='y')+'" title="Разрез вдоль X">ПО X</button>'
 +'<button data-msim-axis="y" aria-pressed="'+(viewState.sectionAxis==='y')+'" title="Разрез вдоль Y">ПО Y</button></div>'
 +'<div class="lsim-moderow"><span>КОД</span>'
 +'<button data-msim-codetheme="cimco" aria-pressed="'+(theme==='cimco')+'" title="Цвета адресов как в CIMCO Edit">CIMCO</button>'
 +'<button data-msim-codetheme="night" aria-pressed="'+(theme==='night')+'" title="Те же цвета на тёмном фоне">ТЁМНАЯ</button></div>'
 +'<small class="lsim-modehint">Плоскость G17, координаты радиусные. Разрез идёт по линии, на которой стоит инструмент.</small></div>'

 +'<div class="card lsim-gcode-card"><div class="lsim-controls-title"><b>1. Программа</b><span>ФРЕЗЕРНЫЙ · G17 X/Y/Z</span></div>'
 +'<p class="lsim-help">Графика строится из кадров X/Y/Z. <b>G0 не снимает металл</b>; циклы сверления раскрываются в клевки и отводы, а каждая станция T получает свою фрезу с реальным диаметром и радиусом при вершине.</p>'
 +'<div class="gk lsim-editor" data-gk-theme="'+theme+'"><div class="gk-gutter" id="msimGutter" aria-hidden="true"></div><div class="gk-body"><pre class="gk-hl" id="msimGcodeHL" aria-hidden="true"></pre>'
 +'<textarea id="msimGcode" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" wrap="off" aria-label="Текст фрезерной NC-программы" placeholder="O1000&#10;G21 G17 G90 G40 G49&#10;T01 M06&#10;G43 H01&#10;S3000 M03&#10;G00 X0. Y0. Z5.&#10;..."></textarea></div></div>'
 +'<input id="msimFile" type="file" accept=".nc,.txt,.tap,.cnc,.mpf,.h,text/plain" hidden>'
 +'<div class="lsim-g-actions"><button class="btn ghost" id="msimFileBtn">Открыть NC</button><button class="btn ghost" id="msimDemo">Учебный пример</button><button class="btn ghost" id="msimFit">Заготовка по NC</button><button class="btn" id="msimAnalyze">Проверить и показать</button></div>'
 +'<div id="msimReport" class="lsim-g-report" aria-live="polite"><span>После проверки программа, траектория и активный кадр будут синхронизированы.</span></div></div>'

 +'<div id="msimToolSetup" class="card lsim-tool-setup" hidden></div>'

 +'<details class="lsim-layers" open><summary><span>Слои и масштаб</span><i>⌄</i></summary><div class="lsim-layers-body">'
 +'<div class="lsim-zoom"><button id="msimZoomOut" title="Уменьшить">−</button><button id="msimZoomFit" title="Показать всё">FIT</button><button id="msimZoomIn" title="Увеличить">+</button><button id="msimFull" title="Во весь экран" aria-pressed="false">⛶</button></div>'
 +'<div class="lsim-view-buttons">'+layer('showRapid','G0','Быстрые ходы пунктиром')+layer('showPath','ПУТЬ','Траектория инструмента')
 +layer('showStock','ЗАГОТОВКА','Карта высот детали')+layer('showTool','ФРЕЗА','Фреза и оправка в реальном ⌀')
 +layer('showGrid','СЕТКА','Сетка и линейки X и Y')+'</div></div></details>'

 +'<div class="lsim-stage"><canvas id="msimCanvas" width="960" height="520" role="img" aria-label="Фрезерный эмулятор: вид сверху и разрез детали">Ваш браузер не поддерживает Canvas.</canvas>'
 +'<div class="lsim-hud"><span>КАДР <b id="msimPass">0 / 0</b></span><span>ПОЗИЦИЯ <b id="msimPos">X— Y— Z—</b></span><span>ШПИНДЕЛЬ <b id="msimRpm">S'+n(c.rpm)+'</b></span><span>ИНСТРУМЕНТ <b id="msimTool">T—</b></span></div>'
 +'<div class="lsim-fsbar" aria-label="Управление в полном экране"><button type="button" data-mfs="reset" title="В начало">|◀</button><button type="button" data-mfs="back" title="Кадр назад">◀|</button><button type="button" data-mfs="play" title="Пуск / пауза">▶</button><button type="button" data-mfs="step" title="Кадр вперёд">|▶</button><button type="button" data-mfs="fit" title="Показать всё">FIT</button><button type="button" data-mfs="exit" title="Выйти">✕</button></div></div>'
 +'<div class="lsim-stockline" id="msimStockLine" aria-live="polite"></div>'
 +'<div class="lsim-pass-track" aria-hidden="true"><i id="msimTrack" style="width:0"></i></div>'
 +'<div class="lsim-legend"><span><i></i>поверхность детали</span><span class="rapid"><i></i>G0 быстрый</span><span class="line"><i></i>G1 линия</span><span class="cw"><i></i>G2</span><span class="ccw"><i></i>G3</span><span class="insert"><i></i>фреза</span></div>'
 +'<div class="lsim-transport"><div class="lsim-actions transport"><button class="btn ghost" id="msimReset" title="В начало">|◀</button><button class="btn ghost" id="msimRev" title="Назад непрерывно">◀</button><button class="btn ghost" id="msimBack" title="Предыдущий кадр">◀|</button><button class="btn ghost" id="msimStep" title="Следующий кадр">|▶</button><button class="btn" id="msimStart" title="Пуск / пауза" aria-pressed="false">▶</button><button class="btn ghost" id="msimEnd" title="В конец">▶|</button></div>'
 +'<label class="lsim-speed"><span>Скорость</span><input id="msimSpeed" data-msim-field type="range" min="1" max="8" step="1" value="'+n(c.speed)+'"><b id="msimSpeedValue">×'+n(c.speed)+'</b></label>'
 +'<div id="msimStatus" class="lsim-status" aria-live="polite"></div></div>'
 +'<div class="lsim-code-sync gk" data-gk-theme="'+theme+'"><div class="lsim-active-block"><span>АКТИВНЫЙ КАДР</span><b id="msimActiveBlock">— программа не загружена —</b></div><div id="msimCodeWindow" class="lsim-code-window"></div></div>'

 +'<div class="card" style="margin-top:11px"><div class="lsim-controls-title"><b>2. Заготовка</b><span>ПЛИТА · ТИСКИ</span></div>'
 +'<label class="lsim-autostock"><input type="checkbox" id="msimAuto" data-msim-field '+(viewState.autoStock!==false?'checked':'')+'><span><b>Подбирать заготовку по программе</b><small>Габарит берётся из траектории при каждой проверке NC. Снимите галочку, чтобы задать плиту вручную.</small></span></label>'
 +'<div class="lsim-form-grid">'
 +'<label class="fld"><span>Длина X, мм</span><input id="msimStockX" data-msim-field type="number" min="10" max="600" step="1" value="'+n(c.stockX)+'"></label>'
 +'<label class="fld"><span>Ширина Y, мм</span><input id="msimStockY" data-msim-field type="number" min="10" max="600" step="1" value="'+n(c.stockY)+'"></label>'
 +'<label class="fld"><span>Высота Z, мм</span><input id="msimStockZ" data-msim-field type="number" min="1" max="300" step="1" value="'+n(c.stockZ)+'"></label>'
 +'<label class="fld"><span>Ноль детали</span><select id="msimZero" data-msim-field><option value="corner" '+(c.zeroX!=='center'?'selected':'')+'>Угол плиты, Z0 сверху</option><option value="center" '+(c.zeroX==='center'?'selected':'')+'>Центр плиты, Z0 сверху</option></select></label>'
 +'<label class="fld"><span>Крепление</span><select id="msimHold" data-msim-field><option value="vice" '+(c.hold==='vice'?'selected':'')+'>Тиски</option><option value="clamp" '+(c.hold==='clamp'?'selected':'')+'>Прихваты</option><option value="vacuum" '+(c.hold==='vacuum'?'selected':'')+'>Вакуумный стол</option></select></label>'
 +'<label class="fld"><span>Подача F, мм/мин</span><input id="msimFeed" data-msim-field type="number" min="1" max="20000" step="10" value="'+n(c.feed)+'"></label>'
 +'<label class="fld"><span>Обороты S, об/мин</span><input id="msimRpmIn" data-msim-field type="number" min="1" step="100" value="'+n(c.rpm)+'"></label>'
 +'</div></div>'
 +'<div class="lsim-disclaimer"><b>Фрезерный эмулятор — проверка формы и типовых опасностей, а не разрешение на Cycle Start.</b> Модель не знает фактические тиски, прихваты, вылет оправки, корректоры длины и машинный ноль. Обязательны прогон в графике стойки, SINGLE BLOCK, низкий Rapid Override и проверка нулей.</div>'
 +(typeof CREDIT==='string'?CREDIT:'')+'</div>';
}

/* ---------- состояние и проигрывание ---------- */
function readMillForm(){
 const val=id=>{const e=$(id);return e?e.value:''};
 const zero=val('#msimZero')||'corner';
 return{...load(),stockX:n(val('#msimStockX')),stockY:n(val('#msimStockY')),stockZ:n(val('#msimStockZ')),
  zeroX:zero,zeroY:zero,hold:val('#msimHold')||'vice',feed:n(val('#msimFeed'))||400,rpm:n(val('#msimRpmIn'))||3000,
  speed:n(val('#msimSpeed'))||2,toolConfigs:collectMillTools()};
}
function collectMillTools(){
 const out={};
 document.querySelectorAll('.lsim-tool-card[data-mstation]').forEach(card=>{
  const g=nm=>card.querySelector('[data-mtool="'+nm+'"]'),st=Number(card.dataset.mstation),num=nm=>n(g(nm)&&g(nm).value);
  const kind=g('kind')&&g('kind').value||'em10',lib=MILL_TOOLS[kind]||MILL_TOOLS.em10;
  out[st]={station:st,code:card.dataset.mcode||'',kind,operation:g('operation')&&g('operation').value||lib.operation,
   diameter:num('diameter'),corner:num('corner'),flute:num('flute'),shankD:num('shankD'),
   holderD:num('holderD'),holderLen:num('holderLen'),pointAngle:num('pointAngle'),teeth:num('teeth')||2,
   bottom:g('bottom')&&g('bottom').value||lib.bottom||'flat',
   confirmed:!!(g('confirmed')&&g('confirmed').checked)};
 });
 return out;
}
function renderMillTools(result){
 const box=$('#msimToolSetup');if(!box)return;
 const tools=result&&result.tools||[];
 if(!tools.length){box.hidden=true;box.innerHTML='';return;}
 const existing=collectMillTools();
 const ops=[['mill','Фрезерование'],['drill','Сверление'],['tap','Метчик']];
 const bottoms=[['flat','Плоское дно'],['bull','С радиусом при вершине'],['ball','Сферическое'],['cone','Конус (сверло, фаска)']];
 box.hidden=false;
 box.innerHTML='<div class="lsim-controls-title"><b>2. Инструменты из программы</b><span>'+tools.length+' '+(tools.length===1?'СТАНЦИЯ':'СТАНЦИИ')+'</span></div>'
 +'<p class="lsim-help">Проверьте каждый T. Диаметр, радиус при вершине и длина режущей части идут и в рисунок, и в съём металла, и в проверку глубины.</p>'
 +'<div class="lsim-tool-list">'+tools.map((raw,i)=>{
  const t={...raw,...(existing[raw.station]||{})},code=t.code||String(t.station).padStart(2,'0');
  const opt=(list,sel)=>list.map(([v,l])=>'<option value="'+v+'" '+(v===sel?'selected':'')+'>'+l+'</option>').join('');
  return '<section class="lsim-tool-card '+(t.confirmed?'confirmed':'')+' '+(i?'collapsed':'')+'" data-mstation="'+t.station+'" data-mcode="'+h(code)+'">'
  +'<button type="button" class="lsim-tool-head"><span class="lsim-tool-badge">T'+String(t.station).padStart(2,'0')+'</span><b>'+h((MILL_TOOLS[t.kind]||{}).name||t.kind)+'</b><small>'+h(code)+' · '+(t.confirmed?'ПОДТВЕРЖДЁН':'ПРОВЕРИТЬ')+'</small><i>⌄</i></button>'
  +'<div class="lsim-tool-fields">'
  +'<label class="fld"><span>Операция</span><select data-mtool="operation">'+opt(ops,t.operation)+'</select></label>'
  +'<label class="fld"><span>Инструмент · '+Object.keys(MILL_TOOLS).length+' позиций</span><input class="lsim-tool-find" data-mtool-find type="search" placeholder="концевая · сверло · сферическая" autocomplete="off"><select data-mtool="kind">'+millToolOptions(t.kind)+'</select></label>'
  +'<label class="fld"><span>Ø фрезы, мм</span><input data-mtool="diameter" type="number" min="0.1" step="0.1" value="'+n(t.diameter)+'"></label>'
  +'<label class="fld"><span>Радиус при вершине, мм</span><input data-mtool="corner" type="number" min="0" step="0.1" value="'+n(t.corner)+'"></label>'
  +'<label class="fld"><span>Длина режущей части, мм</span><input data-mtool="flute" type="number" min="1" step="1" value="'+n(t.flute)+'"></label>'
  +'<label class="fld"><span>Форма дна</span><select data-mtool="bottom">'+opt(bottoms,t.bottom)+'</select></label>'
  +'<label class="fld"><span>Ø хвостовика, мм</span><input data-mtool="shankD" type="number" min="0.1" step="0.1" value="'+n(t.shankD)+'"></label>'
  +'<label class="fld"><span>Ø оправки, мм</span><input data-mtool="holderD" type="number" min="1" step="0.5" value="'+n(t.holderD)+'"></label>'
  +'<label class="fld"><span>Угол сверла / фаски, °</span><input data-mtool="pointAngle" type="number" min="0" max="178" step="1" value="'+n(t.pointAngle)+'"></label>'
  +'<label class="fld"><span>Число зубьев</span><input data-mtool="teeth" type="number" min="1" max="12" step="1" value="'+n(t.teeth)+'"></label>'
  +'<label class="lsim-tool-confirm"><input data-mtool="confirmed" type="checkbox" '+(t.confirmed?'checked':'')+'><span>Назначение и габариты проверены оператором</span></label>'
  +'<p class="lsim-tool-note">'+h((MILL_TOOLS[t.kind]||{}).note||'')+'</p>'
  +'</div></section>';
 }).join('')+'</div>';
 bindMillToolCards();
}
function bindMillToolCards(){
 document.querySelectorAll('.lsim-tool-card[data-mstation]').forEach(card=>{
  const find=card.querySelector('[data-mtool-find]'),pick=card.querySelector('[data-mtool="kind"]');
  if(find&&pick)find.oninput=()=>{const cur=pick.value;pick.innerHTML=millToolOptions(cur,find.value);pick.value=cur;};
  const head=card.querySelector('.lsim-tool-head');
  if(head)head.onclick=()=>card.classList.toggle('collapsed');
  card.querySelectorAll('[data-mtool]').forEach(f=>f.onchange=()=>{
   if(f.dataset.mtool==='kind'){
    const lib=MILL_TOOLS[f.value]||MILL_TOOLS.em10,set=(nm,v)=>{const e=card.querySelector('[data-mtool="'+nm+'"]');if(e)e.value=v;};
    set('operation',lib.operation);set('diameter',lib.diameter);set('corner',lib.corner);set('flute',lib.flute);
    set('shankD',lib.shankD);set('holderD',lib.holderD);set('holderLen',lib.holderLen);set('pointAngle',lib.pointAngle||0);
    set('teeth',lib.teeth||2);set('bottom',lib.bottom||'flat');
    const nt=card.querySelector('.lsim-tool-note');if(nt)nt.textContent=lib.note||'';
    const title=card.querySelector('.lsim-tool-head b');if(title)title.textContent=lib.name;
   }
   const ok=card.querySelector('[data-mtool="confirmed"]');
   card.classList.toggle('confirmed',!!(ok&&ok.checked));
   const small=card.querySelector('.lsim-tool-head small');
   if(small)small.textContent=card.dataset.mcode+' · '+(ok&&ok.checked?'ПОДТВЕРЖДЁН':'ПРОВЕРИТЬ');
   saveToolStore(collectMillTools());applyMillForm(false);
  });
 });
}
function activeMillSeg(){return millState&&millState.nc&&millState.nc.segments[millState.segment]||null;}
function displayMillSeg(){if(!millState||!millState.nc)return null;const s=millState.nc.segments;
 return s[millState.segment]||s[s.length-1]||null;}
function pointOn(seg,q){
 const pts=seg&&seg.points&&seg.points.length?seg.points:[seg.from,seg.to];
 const at=Math.max(0,Math.min(1,q))*(pts.length-1),i=Math.min(pts.length-2,Math.floor(at)),f=at-i;
 const a=pts[Math.max(0,i)],b=pts[Math.max(1,i+1)];
 return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f};
}
function refreshMillMaterial(){
 if(!millState||!millState.nc)return;
 if(!millState.cutter||millState.cutter.segments!==millState.nc.segments.length)
  millState.cutter=makeMillCutter(millState.nc,millState.cfg);
 millState.material=millState.cutter.at(millState.segment,millState.progress);
 bumpMat(millState);
 const seg=displayMillSeg();
 millState.point=seg?pointOn(seg,activeMillSeg()?millState.progress:1):null;
 millState.spec=seg&&seg.toolSpec||null;
 millState.station=seg&&seg.toolStation||0;
}
function paintMill(){const cv=$('#msimCanvas');if(cv)drawMill(cv,millState);}
function millStatus(kind,text){const b=$('#msimStatus');if(!b)return;b.className='lsim-status '+(kind||'good');b.textContent=text;}

let mEditorLine=-1,mEditorText=null;
function syncMillEditor(force){
 const ta=$('#msimGcode'),hl=$('#msimGcodeHL'),gut=$('#msimGutter');
 if(!ta||!hl||!CNC.highlightGcodeLines)return;
 const seg=activeMillSeg(),line=seg?seg.line:0;
 if(force||ta.value!==mEditorText||line!==mEditorLine){
  const bad=new Set((millResult&&millResult.issues||[]).filter(x=>x.type==='bad'&&x.line).map(x=>x.line));
  hl.innerHTML=CNC.highlightGcodeLines(ta.value,{active:line,badLines:bad});
  if(gut)gut.innerHTML=CNC.gcodeGutter(ta.value,{active:line,badLines:bad});
  mEditorText=ta.value;mEditorLine=line;
 }
 hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft;if(gut)gut.scrollTop=ta.scrollTop;
}
function syncMillCode(){
 const seg=activeMillSeg(),block=$('#msimActiveBlock'),win=$('#msimCodeWindow');
 if(block)block.innerHTML=seg?'<i>'+String(seg.line).padStart(4,'0')+'</i> '+(CNC.highlightGcode?CNC.highlightGcode(seg.clean):h(seg.clean)):'— программа не загружена —';
 document.querySelectorAll('.lsim-tool-card[data-mstation]').forEach(c=>c.classList.toggle('active',!!seg&&Number(c.dataset.mstation)===Number(seg.toolStation)));
 syncMillEditor();
 if(!win)return;
 if(!millResult||!millResult.lines){win.innerHTML='';return;}
 const line=seg?seg.line:1,start=Math.max(1,line-3),end=Math.min(millResult.lines.length,line+3);
 const bad=new Set(millResult.issues.filter(x=>x.type==='bad').map(x=>x.line));
 let html='';
 for(let i=start;i<=end;i++)html+='<button data-msim-line="'+i+'" class="'+(i===line?'current ':'')+(bad.has(i)?'bad':'')+'"><i>'+String(i).padStart(4,'0')+'</i><code>'+(CNC.highlightGcode?CNC.highlightGcode(millResult.lines[i-1]||''):h(millResult.lines[i-1]||''))+'</code></button>';
 win.innerHTML=html;
 win.querySelectorAll('button').forEach(b=>b.onclick=()=>jumpMill(Number(b.dataset.msimLine)));
}
function jumpMill(line){
 if(!millState||!millState.nc)return;
 const i=millState.nc.segments.findIndex(s=>s.line>=line);
 millState.segment=i<0?Math.max(0,millState.nc.segments.length-1):i;
 millState.progress=0;millState.complete=false;haltMill();refreshMillMaterial();updateMillHud();paintMill();
}
function updateMillStockLine(){
 const el=$('#msimStockLine');if(!el)return;
 const c=millState?millState.cfg:readMillForm();
 const hold={vice:'тиски',clamp:'прихваты',vacuum:'вакуумный стол'}[c.hold]||'тиски';
 const g=millResult&&millResult.geometry;
 el.innerHTML='<span>ЗАГОТОВКА <b>'+n(c.stockX)+' × '+n(c.stockY)+' × '+n(c.stockZ)+' мм</b> · '+hold
  +' · ноль '+(c.zeroX==='center'?'в центре':'в углу')+(viewState.autoStock!==false?' · <i>подбор по NC</i>':'')+'</span>'
  +(g?'<span>СНЯТО <b>'+g.removedCm3.toFixed(2)+' см³</b> · самая глубокая точка Z'+g.deepest.toFixed(2)+' · обработано '+g.touchedPct.toFixed(0)+'% площади</span>':'');
}
function updateMillHud(){
 if(!millState)return;
 const seg=activeMillSeg(),shown=seg||displayMillSeg();
 const total=millState.nc?millState.nc.segments.length:0;
 const pass=Math.min(total,millState.segment+1);
 const p=millState.point||{x:0,y:0,z:0};
 if($('#msimPass'))$('#msimPass').textContent=pass+' / '+total;
 if($('#msimPos'))$('#msimPos').textContent='X'+n(p.x).toFixed(2)+' Y'+n(p.y).toFixed(2)+' Z'+n(p.z).toFixed(2);
 if($('#msimRpm'))$('#msimRpm').textContent='S'+((shown&&shown.rpm)||millState.cfg.rpm);
 if($('#msimTool'))$('#msimTool').textContent=shown&&shown.toolStation?'T'+String(shown.toolStation).padStart(2,'0')+' ⌀'+n(shown.toolSpec&&shown.toolSpec.diameter).toFixed(1):'T—';
 const ratio=total?(millState.segment+millState.progress)/total:0;
 if($('#msimTrack'))$('#msimTrack').style.width=Math.max(0,Math.min(100,(millState.complete?100:ratio*100))).toFixed(1)+'%';
 updateMillStockLine();syncMillCode();
}
function advanceMill(delta){
 if(!millState||!millState.nc)return;
 millState.progress+=delta*(millState.direction||1);
 while(millState.progress>=1){
  millState.progress-=1;millState.segment++;
  if(millState.segment>=millState.nc.segments.length){
   millState.segment=millState.nc.segments.length;millState.progress=0;millState.complete=true;millState.running=false;
   millStatus('good','Прогон завершён. Сравните форму, разрез и опасные кадры с чертежом.');break;}
 }
 while(millState.progress<0){
  millState.segment--;
  if(millState.segment<0){millState.segment=0;millState.progress=0;millState.running=false;break;}
  millState.progress+=1;
 }
 refreshMillMaterial();
}
function setMillPlay(on){const b=$('#msimStart');if(!b)return;b.textContent=on?'Ⅱ':'▶';b.setAttribute('aria-pressed',String(!!on));}
function haltMill(){if(millFrame){cancelAnimationFrame(millFrame);millFrame=0;}if(millState)millState.running=false;setMillPlay(false);millLast=0;}
function runMill(){if(millFrame||!millState||!millState.running)return;setMillPlay(true);millFrame=requestAnimationFrame(tickMill);}
function tickMill(){
 millFrame=0;
 if(!millState||!millState.running||!$('#msimCanvas'))return;
 const now=Date.now(),dt=Math.min(70,Math.max(0,now-(millLast||now)));millLast=now;
 advanceMill(dt/(900/Math.max(1,millState.cfg.speed||2)));
 paintMill();updateMillHud();
 if(millState.running)millFrame=requestAnimationFrame(tickMill);else setMillPlay(false);
}
function seekMill(i,p){
 if(!millState||!millState.nc)return;
 millState.segment=Math.max(0,Math.min(millState.nc.segments.length,i));
 millState.progress=p||0;millState.complete=millState.segment>=millState.nc.segments.length;
 haltMill();refreshMillMaterial();updateMillHud();paintMill();
}
function stepMill(dir){
 if(!millState||!millState.nc)return;
 haltMill();
 millState.segment=Math.max(0,Math.min(millState.nc.segments.length,millState.segment+dir));
 millState.progress=0;millState.complete=millState.segment>=millState.nc.segments.length;
 refreshMillMaterial();paintMill();updateMillHud();
}
function buildMillState(cfg,result){
 const st={cfg,nc:result,segment:0,progress:0,direction:1,running:false,complete:false};
 st.cutter=makeMillCutter(result,cfg);st.material=st.cutter.at(0,0);bumpMat(st);
 return st;
}
function analyzeMill(announce){
 const ta=$('#msimGcode'),code=ta?ta.value.trim():'';
 if(!code){millResult=null;renderMillReport(null);syncMillEditor(true);
  if(announce)typeof toast==='function'&&toast('Вставьте или откройте G-код');return false;}
 let cfg=readMillForm();
 const discovered=parseMillGcode(code,cfg);
 renderMillTools(discovered);
 if(viewState.autoStock!==false){
  const fit=inferBlock(discovered,readMillForm());
  const set=(id,v)=>{const e=$(id);if(e)e.value=v;};
  set('#msimStockX',fit.stockX);set('#msimStockY',fit.stockY);set('#msimStockZ',fit.stockZ);
 }
 cfg=readMillForm();save(cfg);
 millResult=parseMillGcode(code,cfg);
 renderMillReport(millResult);
 millState=buildMillState(cfg,millResult);
 refreshMillMaterial();updateMillHud();
 viewState.zoom=1;viewState.panX=0;viewState.panY=0;saveView();
 paintMill();syncMillEditor(true);
 if(announce&&typeof toast==='function')toast(millResult.stats.bad?'Найдено ошибок: '+millResult.stats.bad:'Траектория построена');
 return true;
}
function applyMillForm(announce){
 if(!$('#msimCanvas'))return false;
 const cfg=readMillForm();save(cfg);
 const ta=$('#msimGcode');
 if(millResult&&ta&&ta.value.trim()){
  millResult=parseMillGcode(ta.value,cfg);renderMillReport(millResult);
  millState=buildMillState(cfg,millResult);refreshMillMaterial();
 }else if(!millState){millState={cfg,nc:null,segment:0,progress:0,material:blankBlock(cfg)};bumpMat(millState);}
 else{millState.cfg=cfg;millState.material=blankBlock(cfg);bumpMat(millState);}
 updateMillHud();paintMill();
 if(announce&&typeof toast==='function')toast('Заготовка '+n(cfg.stockX)+'×'+n(cfg.stockY)+'×'+n(cfg.stockZ));
 return true;
}
function renderMillReport(result){
 const box=$('#msimReport');if(!box)return;
 if(!result){box.className='lsim-g-report';box.innerHTML='<span>Вставьте G-код и нажмите «Проверить и показать».</span>';return;}
 const s=result.stats;
 const head=s.bad?'ПРОВЕРКА ЗАБЛОКИРОВАНА · ошибок: '+s.bad:s.warn?'НАГЛЯДНО, НО ПРОВЕРЬТЕ · замечаний: '+s.warn:'ТОЧНО РАСКРЫТО В ПОДДЕРЖИВАЕМОМ РЕЖИМЕ';
 const state=s.bad?'bad':s.warn?'warn':'good';
 const items=result.issues.length?result.issues.map(i=>'<li class="'+i.type+'" '+(i.line?'data-msim-jump="'+i.line+'"':'')+'><b>'+(i.type==='bad'?'ОШИБКА':'ПРОВЕРИТЬ')+'</b>'+(i.line?' · строка '+i.line:'')+'<span>'+h(i.text)+'</span></li>').join('')
  :'<li class="good"><b>БАЗОВАЯ ПРОВЕРКА ПРОЙДЕНА</b><span>Перемещения разобраны. Сверьте форму, ноль детали и корректоры длины.</span></li>';
 const g=result.geometry;
 const geo=g?'<li class="good"><b>ИТОГОВАЯ ГЕОМЕТРИЯ</b><span>Снято '+g.removedCm3.toFixed(2)+' см³ · самая глубокая точка Z'+g.deepest.toFixed(2)+' мм · обработано '+g.touchedPct.toFixed(0)+'% площади плиты</span></li>':'';
 box.className='lsim-g-report '+state;
 box.innerHTML='<div class="lsim-g-summary"><b>'+head+'</b><span>Фрезерный · '+s.blocks+' кадров · '+s.moves+' ходов · '+s.cuts+' режущих</span></div><ul>'+items+geo+'</ul>';
 box.querySelectorAll('[data-msim-jump]').forEach(x=>x.onclick=()=>jumpMill(Number(x.dataset.msimJump)));
}

function millZoom(mult,fit){
 if(fit){viewState.zoom=1;viewState.panX=0;viewState.panY=0;}
 else viewState.zoom=Math.max(.3,Math.min(12,(viewState.zoom||1)*mult));
 saveView();paintMill();
}
function toggleMillFull(force){
 const stage=document.querySelector('.lsim-stage');if(!stage)return;
 const on=force==null?!stage.classList.contains('full'):!!force;
 stage.classList.toggle('full',on);document.body.classList.toggle('lsim-full-open',on);
 const b=$('#msimFull');if(b){b.setAttribute('aria-pressed',String(on));b.textContent=on?'✕':'⛶';}
 requestAnimationFrame(()=>{paintMill();setTimeout(paintMill,120);});
}
function bindMillGestures(){
 const cv=$('#msimCanvas');if(!cv||cv.dataset.gest)return;cv.dataset.gest='1';
 const pts=new Map();let drag=null,pinch=null,lastTap=0;
 const local=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
 cv.addEventListener('pointerdown',e=>{
  cv.setPointerCapture&&cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,local(e));
  if(pts.size===1){const p=pts.get(e.pointerId);drag={sx:p.x,sy:p.y,px:viewState.panX||0,py:viewState.panY||0,moved:false};}
  else if(pts.size===2){drag=null;const[a,b]=[...pts.values()];
   pinch={d:Math.hypot(b.x-a.x,b.y-a.y)||1,zoom:viewState.zoom||1};}
 });
 cv.addEventListener('pointermove',e=>{
  if(!pts.has(e.pointerId))return;pts.set(e.pointerId,local(e));
  if(pinch&&pts.size>=2){const[a,b]=[...pts.values()],d=Math.hypot(b.x-a.x,b.y-a.y)||1;
   viewState.zoom=Math.max(.3,Math.min(12,pinch.zoom*(d/pinch.d)));paintMill();return;}
  if(drag){const p=pts.get(e.pointerId),dx=p.x-drag.sx,dy=p.y-drag.sy;
   if(Math.hypot(dx,dy)>3)drag.moved=true;
   if(!drag.moved)return;e.preventDefault();
   viewState.panX=drag.px+dx;viewState.panY=drag.py+dy;paintMill();}
 });
 const release=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;
  if(pts.size===0){if(drag&&drag.moved)saveView();
   else{const now=Date.now();if(now-lastTap<320)millZoom(1,true);lastTap=now;}drag=null;}};
 cv.addEventListener('pointerup',release);cv.addEventListener('pointercancel',release);
 cv.addEventListener('wheel',e=>{e.preventDefault();millZoom(e.deltaY<0?1.12:1/1.12);},{passive:false});
}
function bindMill(){
 if(!$('#msimCanvas'))return;
 const back=document.querySelector('[data-msim-back]');
 if(back)back.onclick=()=>{if(history.state&&history.state.razryadDepth)history.back();
  else{try{history.replaceState({...history.state,razryadMillRoute:false},'',location.pathname);}catch(_){}
   folder=null;render();}};
 document.querySelectorAll('[data-msim-field]').forEach(x=>x.onchange=()=>{
  if(x.id==='msimSpeed'){const v=$('#msimSpeedValue');if(v)v.textContent='×'+x.value;
   if(millState)millState.cfg.speed=n(x.value)||1;return;}
  if(x.id==='msimAuto'){viewState.autoStock=!!x.checked;saveView();
   if(x.checked&&millResult)analyzeMill(false);else applyMillForm(false);
   updateMillStockLine();return;}
  applyMillForm(false);
 });
 $('#msimAnalyze').onclick=()=>analyzeMill(true);
 $('#msimFileBtn').onclick=()=>$('#msimFile').click();
 $('#msimFile').onchange=e=>{const f=e.target.files&&e.target.files[0];if(!f)return;
  f.text().then(code=>{$('#msimGcode').value=code;analyzeMill(true);})
   .catch(()=>renderMillReport({stats:{bad:1,warn:0,blocks:0,moves:0,cuts:0},issues:[{type:'bad',line:0,text:'Не удалось прочитать файл. Сохраните программу как обычный текст.'}]}));};
 $('#msimDemo').onclick=()=>{$('#msimGcode').value=DEMO;analyzeMill(true);};
 $('#msimFit').onclick=()=>{
  if(!millResult)return typeof toast==='function'&&toast('Сначала откройте NC');
  const fit=inferBlock(millResult,readMillForm());
  const set=(id,v)=>{const e=$(id);if(e)e.value=v;};
  set('#msimStockX',fit.stockX);set('#msimStockY',fit.stockY);set('#msimStockZ',fit.stockZ);
  applyMillForm(true);};
 const ta=$('#msimGcode');
 if(ta){
  ta.addEventListener('input',()=>syncMillEditor());
  ta.addEventListener('scroll',()=>{const hl=$('#msimGcodeHL'),g=$('#msimGutter');
   if(hl){hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft;}if(g)g.scrollTop=ta.scrollTop;});
  ta.addEventListener('keydown',e=>{if(e.key!=='Tab'||e.shiftKey)return;e.preventDefault();
   const a=ta.selectionStart,b=ta.selectionEnd;ta.value=ta.value.slice(0,a)+'  '+ta.value.slice(b);
   ta.selectionStart=ta.selectionEnd=a+2;syncMillEditor();});
 }
 document.querySelectorAll('[data-msim-view]').forEach(x=>x.onclick=()=>{
  const k=x.dataset.msimView;viewState[k]=!viewState[k];
  x.setAttribute('aria-pressed',String(viewState[k]));saveView();paintMill();});
 document.querySelectorAll('[data-msim-section]').forEach(x=>x.onclick=()=>{
  viewState.showSection=x.dataset.msimSection==='on';saveView();
  document.querySelectorAll('[data-msim-section]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.msimSection==='on')===viewState.showSection)));
  paintMill();});
 document.querySelectorAll('[data-msim-axis]').forEach(x=>x.onclick=()=>{
  viewState.sectionAxis=x.dataset.msimAxis;saveView();
  document.querySelectorAll('[data-msim-axis]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.msimAxis===viewState.sectionAxis)));
  paintMill();});
 document.querySelectorAll('[data-msim-codetheme]').forEach(x=>x.onclick=()=>{
  viewState.codeTheme=x.dataset.msimCodetheme;saveView();
  document.querySelectorAll('[data-msim-codetheme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.msimCodetheme===viewState.codeTheme)));
  document.querySelectorAll('.gk').forEach(g=>g.dataset.gkTheme=viewState.codeTheme);});
 $('#msimZoomOut').onclick=()=>millZoom(.82);
 $('#msimZoomIn').onclick=()=>millZoom(1.22);
 $('#msimZoomFit').onclick=()=>millZoom(1,true);
 const full=$('#msimFull');if(full)full.onclick=()=>toggleMillFull();
 document.querySelectorAll('[data-mfs]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.mfs;
  if(a==='exit')return toggleMillFull(false);
  if(a==='fit')return millZoom(1,true);
  if(a==='reset')return seekMill(0,0);
  if(a==='back')return stepMill(-1);
  if(a==='step')return stepMill(1);
  if(a==='play'){const s=$('#msimStart');if(s)s.click();b.textContent=millState&&millState.running?'Ⅱ':'▶';}});
 $('#msimStart').onclick=()=>{
  if(millState&&millState.running){haltMill();millStatus('warn','Пауза. Нажмите ▶ ещё раз, чтобы продолжить.');updateMillHud();return;}
  if(!millState||!millState.nc)return typeof toast==='function'&&toast('Сначала загрузите NC');
  if(millState.complete){millState.segment=0;millState.progress=0;millState.complete=false;}
  millState.direction=1;millState.running=true;setMillPlay(true);millLast=Date.now();
  millStatus('good','Эмулятор запущен. Повторное нажатие Ⅱ остановит движение.');runMill();};
 $('#msimRev').onclick=()=>{
  if(!millState||!millState.nc)return;
  if(millState.running&&millState.direction<0)return haltMill();
  millState.direction=-1;millState.complete=false;millState.running=true;setMillPlay(true);millLast=Date.now();runMill();};
 $('#msimStep').onclick=()=>stepMill(1);
 $('#msimBack').onclick=()=>stepMill(-1);
 $('#msimReset').onclick=()=>seekMill(0,0);
 $('#msimEnd').onclick=()=>seekMill(millState&&millState.nc?millState.nc.segments.length:0,0);
 bindMillGestures();
 if(window.ResizeObserver){if(millResize)millResize.disconnect();
  millResize=new ResizeObserver(()=>{if(millState&&$('#msimCanvas'))paintMill();});
  millResize.observe($('#msimCanvas'));}
}
function showMill(){
 const ttl=$('#ttl'),sub=$('#sub');
 if(ttl)ttl.textContent='Эмулятор ЧПУ · фрезерный';
 if(sub)sub.textContent='Карта высот детали, разрез, циклы сверления и каждый T';
 ['#searchbox','#chips','#mseg'].forEach(id=>{const e=$(id);if(e)e.style.display='none';});
 if(typeof drawNav==='function')drawNav();
 millResult=null;millState=null;
 if(CNC.ensureGkStyles)CNC.ensureGkStyles();
 $('#screen').innerHTML=millView();
 mEditorLine=-1;mEditorText=null;
 if(root){root.dataset.app='chpu';root.dataset.section='control';}
 if(typeof bind==='function')bind();
 if(typeof numFix==='function')numFix();
 $('#screen').scrollTop=0;
 applyMillForm(false);syncMillEditor(true);
}
/* release=true — уходим с экрана: опорные снимки карты высот занимают десятки
   мегабайт, держать их, пока пользователь в другом разделе, незачем */
function stopMill(release){
 haltMill();
 if(millResize){millResize.disconnect();millResize=null;}
 const stage=document.querySelector('.lsim-stage');
 if(stage&&$('#msimCanvas'))stage.classList.remove('full');
 if($('#msimCanvas'))document.body.classList.remove('lsim-full-open');
 if(release){millState=null;millResult=null;heightCanvas=null;heightVersion=-1;heightKey='';}
}
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&$('#msimCanvas')&&document.body.classList.contains('lsim-full-open'))toggleMillFull(false);});

/* встраиваемся в маршрутизацию приложения тем же приёмом, что токарный эмулятор */
if(typeof bind==='function'){const prevBind=bind;bind=function(){prevBind();bindMill();};}
if(typeof render==='function'){const prevRender=render;
 render=function(){
  const toMill=tab==='work'&&folder==='millx';
  stopMill(!toMill);
  if(toMill){showMill();return;}
  prevRender();
 };}

window.RazryadMill={MILL_TOOLS,MILL_GROUPS,millToolOptions,bottomProfile,blankBlock,cloneBlock,
 applyMillCut,blockProfile,makeMillCutter,parseMillGcode,detectMillTools,inferBlock,arcXY,
 defaults,summarizeBlock,drawMill,DEMO};
try{if(new URLSearchParams(location.search).get('open')==='mill'||history.state&&history.state.razryadMillRoute){
 tab='work';folder='millx';history.replaceState({...history.state,razryadMillRoute:true},'',location.pathname);}}catch(_){}
if(typeof render==='function')render();
})();
