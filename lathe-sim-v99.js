/* РАЗРЯД 0.993 — единый проверяемый Эмулятор CNC: плоский разрез токарной программы */
(function(){
const STORE='razryad-lathe-sim-v99';
const VIEW_STORE='razryad-lathe-backplot-view-v99';
const PROFILE='razryad-machine-profile-v99';
const TOOL_STORE='razryad-lathe-tools-v992';
let bannerFrame=0,simFrame=0,bannerStart=Date.now(),simState=null,lastTick=0,resizeWatch=null,gcodeResult=null,viewState=loadView();
const root=document.querySelector('.device');

function defaults(){return{dialect:'haas',operation:'external',stock:'solid',contour:'step',stockD:60,length:120,boreD:20,targetD:45,stepD:54,stepLen:42,chuck:'3jaw',grip:25,tool:'cnmg',nose:0.8,depth:2,feed:0.25,rpm:800,speed:2,coolant:true,chips:true,arcCenterDiameter:true,showCycles:true,toolConfigs:{}};}
function profile(){try{return JSON.parse(localStorage.getItem(PROFILE)||'null')||{name:'Haas ST-20',maxRpm:4000}}catch(_){return{name:'Haas ST-20',maxRpm:4000}}}
function load(){try{return{...defaults(),...(JSON.parse(localStorage.getItem(STORE)||'null')||{})}}catch(_){return defaults()}}
function save(v){try{localStorage.setItem(STORE,JSON.stringify(v))}catch(_){}}
function loadView(){const base={showRapid:true,showDots:true,showArcs:true,showStock:true,showTool:true,showPath:true,showCycles:true,showGrid:true,flat:true,zoom:1,panX:0,panY:0};try{return{...base,...(JSON.parse(localStorage.getItem(VIEW_STORE)||'null')||{})}}catch(_){return base}}
/* единая точка отрисовки: плоский разрез либо объёмный вид */
function paint(){const cv=$('#lsimCanvas');if(!cv)return;
 /* в плоском разрезе координаты подписаны прямо на холсте — старые подписи осей прячем */
 const ax=document.querySelector('.lsim-axis');if(ax)ax.style.display=viewState.flat===false?'':'none';
 if(viewState.flat===false)drawLathe(cv,simState,false,Date.now());else draw2D(cv,simState,Date.now());}
function saveView(){try{localStorage.setItem(VIEW_STORE,JSON.stringify(viewState))}catch(_){}}
function loadToolStore(){try{return JSON.parse(localStorage.getItem(TOOL_STORE)||'{}')||{}}catch(_){return{}}}
function saveToolStore(v){try{localStorage.setItem(TOOL_STORE,JSON.stringify(v||{}))}catch(_){}}
function h(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}

/* Каталог инструмента: группа, геометрия для проверок и силуэт для 2D-отрисовки.
   shape — как рисовать: turn (наружный), bore (расточной), groove, thread, axial.
   insert — форма пластины, lead — главный угол в плане, hand — правый/левый. */
const TOOL_GROUPS=[['ext','Резцы наружные · сменная пластина'],['bore','Резцы расточные · сменная пластина'],['groove','Канавочные и отрезные'],['thr','Резьбовые'],['brazed','Напайные резцы (ГОСТ)'],['axial','Осевой инструмент']];
const TOOL_LIBRARY={
 /* наружные со сменной пластиной */
 cnmg:{name:'PCLNR 2525 + CNMG · проходной 95°',group:'ext',operation:'external',diameter:0,workingLength:32,bodyD:25,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'r80',lead:95,hand:'R'},
 dnmg:{name:'PDJNR 2525 + DNMG · проходной 93°',group:'ext',operation:'external',diameter:0,workingLength:32,bodyD:25,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'r55',lead:93,hand:'R'},
 tnmg:{name:'PTGNR 2525 + TNMG · проходной 91°',group:'ext',operation:'external',diameter:0,workingLength:32,bodyD:25,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'tri',lead:91,hand:'R'},
 wnmg:{name:'MWLNR 2525 + WNMG · проходной 95°',group:'ext',operation:'external',diameter:0,workingLength:32,bodyD:25,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'tri80',lead:95,hand:'R'},
 vnmg:{name:'SVJBR 2020 + VBMT · профильный 93°',group:'ext',operation:'external',diameter:0,workingLength:32,bodyD:20,minBore:0,nose:.4,pointAngle:0,shape:'turn',insert:'r35',lead:93,hand:'R'},
 dcmt:{name:'SDJCR 2020 + DCMT · чистовой 93°',group:'ext',operation:'external',diameter:0,workingLength:30,bodyD:20,minBore:0,nose:.4,pointAngle:0,shape:'turn',insert:'r55',lead:93,hand:'R'},
 face:{name:'MSKNR 2525 + SNMG · подрезной 75°',group:'ext',operation:'external',diameter:0,workingLength:30,bodyD:25,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'sq',lead:75,hand:'R'},
 /* расточные со сменной пластиной */
 ccmt:{name:'S25S-SCLCR + CCMT · расточной 95°',group:'bore',operation:'boring',diameter:0,workingLength:55,bodyD:12,minBore:16,nose:.4,pointAngle:0,shape:'bore',insert:'r80',lead:95,hand:'R'},
 sducr:{name:'S20R-SDUCR + DCMT · расточной 93°',group:'bore',operation:'boring',diameter:0,workingLength:50,bodyD:16,minBore:20,nose:.4,pointAngle:0,shape:'bore',insert:'r55',lead:93,hand:'R'},
 svucr:{name:'S16Q-SVUCR + VCMT · профильный расточной',group:'bore',operation:'boring',diameter:0,workingLength:45,bodyD:14,minBore:16,nose:.2,pointAngle:0,shape:'bore',insert:'r35',lead:93,hand:'R'},
 /* канавочные и отрезные */
 mgmn:{name:'MGEHR 2020 + MGMN300 · канавка 3 мм',group:'groove',operation:'groove',diameter:0,workingLength:22,bodyD:20,minBore:0,nose:.2,pointAngle:0,insertWidth:3,shape:'groove',lead:90,hand:'R'},
 mgmn2:{name:'MGEHR 2020 + MGMN200 · канавка 2 мм',group:'groove',operation:'groove',diameter:0,workingLength:18,bodyD:20,minBore:0,nose:.2,pointAngle:0,insertWidth:2,shape:'groove',lead:90,hand:'R'},
 cutoff:{name:'Отрезной GTN-3 · 3 мм',group:'groove',operation:'groove',diameter:0,workingLength:32,bodyD:20,minBore:0,nose:.2,pointAngle:0,insertWidth:3,shape:'groove',lead:90,hand:'R'},
 mgivr:{name:'MGIVR 2016 + MGMN200 · внутренняя канавка',group:'groove',operation:'groove',diameter:0,workingLength:40,bodyD:16,minBore:22,nose:.2,pointAngle:0,insertWidth:2,shape:'groovein',lead:90,hand:'R'},
 /* резьбовые */
 thread:{name:'SER 2020 + 16ER · резьбовой наружный',group:'thr',operation:'thread',diameter:0,workingLength:30,bodyD:20,minBore:0,nose:.1,pointAngle:60,shape:'thread',insert:'thr',lead:90,hand:'R'},
 threadin:{name:'SNR 0020 + 16IR · резьбовой внутренний',group:'thr',operation:'thread',diameter:0,workingLength:45,bodyD:16,minBore:20,nose:.1,pointAngle:60,shape:'threadin',insert:'thr',lead:90,hand:'R'},
 /* напайные */
 brazed:{name:'Напайной проходной прямой',group:'brazed',operation:'external',diameter:0,workingLength:30,bodyD:20,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'brz',lead:45,hand:'R',brazed:true},
 brazed_bent:{name:'Напайной проходной отогнутый 45°',group:'brazed',operation:'external',diameter:0,workingLength:30,bodyD:20,minBore:0,nose:1,pointAngle:0,shape:'turn',insert:'brz',lead:45,hand:'R',brazed:true},
 brazed_up:{name:'Напайной проходной упорный 90°',group:'brazed',operation:'external',diameter:0,workingLength:30,bodyD:20,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'brz',lead:90,hand:'R',brazed:true},
 brazed_face:{name:'Напайной подрезной',group:'brazed',operation:'external',diameter:0,workingLength:28,bodyD:20,minBore:0,nose:.8,pointAngle:0,shape:'turn',insert:'brz',lead:75,hand:'R',brazed:true},
 brazed_bore:{name:'Напайной расточной проходной',group:'brazed',operation:'boring',diameter:0,workingLength:45,bodyD:16,minBore:20,nose:.8,pointAngle:0,shape:'bore',insert:'brz',lead:60,hand:'R',brazed:true},
 brazed_cut:{name:'Напайной отрезной',group:'brazed',operation:'groove',diameter:0,workingLength:30,bodyD:20,minBore:0,nose:.2,pointAngle:0,insertWidth:4,shape:'groove',lead:90,hand:'R',brazed:true},
 brazed_thr:{name:'Напайной резьбовой',group:'brazed',operation:'thread',diameter:0,workingLength:28,bodyD:20,minBore:0,nose:.1,pointAngle:60,shape:'thread',insert:'brz',lead:90,hand:'R',brazed:true},
 /* осевой инструмент */
 drill:{name:'Спиральное сверло HSS 118°',group:'axial',operation:'drill',diameter:10,workingLength:55,bodyD:10,minBore:0,nose:0,pointAngle:118,shape:'axial'},
 drill_carb:{name:'Твердосплавное сверло 140°',group:'axial',operation:'drill',diameter:10,workingLength:50,bodyD:10,minBore:0,nose:0,pointAngle:140,shape:'axial'},
 drill_smp:{name:'Сверло со сменными пластинами 180°',group:'axial',operation:'drill',diameter:20,workingLength:60,bodyD:20,minBore:0,nose:0,pointAngle:178,shape:'axial'},
 centerdrill:{name:'Центровочное сверло 60°',group:'axial',operation:'centerdrill',diameter:4,workingLength:12,bodyD:10,minBore:0,nose:0,pointAngle:60,shape:'axial'},
 tap:{name:'Машинный метчик',group:'axial',operation:'tap',diameter:10,workingLength:30,bodyD:10,minBore:8.5,nose:0,pointAngle:0,shape:'axial'},
 reamer:{name:'Развёртка машинная',group:'axial',operation:'drill',diameter:12,workingLength:40,bodyD:12,minBore:11.8,nose:0,pointAngle:170,shape:'axial'}
};
function toolStation(value){const tv=Math.abs(Math.round(Number(value)||0));return tv>=100?Math.floor(tv/100):tv;}
function operationForKind(kind,fallback){return TOOL_LIBRARY[kind]&&TOOL_LIBRARY[kind].operation||fallback||'external';}
function defaultToolConfig(station,cfg,hint){const fallback={...(cfg||defaults())},stored=loadToolStore()[station]||{},kind=stored.kind||hint&&hint.kind||fallback.tool||'cnmg',base=TOOL_LIBRARY[kind]||TOOL_LIBRARY.cnmg,operation=stored.operation||hint&&hint.operation||(Number(station)===0?fallback.operation:operationForKind(kind,fallback.operation));return{station:Number(station)||0,code:hint&&hint.code||'',kind,operation,diameter:Number(stored.diameter??base.diameter)||0,workingLength:Number(stored.workingLength??base.workingLength)||0,bodyD:Number(stored.bodyD??base.bodyD)||0,minBore:Number(stored.minBore??base.minBore)||0,nose:Number(stored.nose??base.nose??fallback.nose)||0,pointAngle:Number(stored.pointAngle??base.pointAngle)||0,insertWidth:Number(stored.insertWidth??base.insertWidth)||3,confirmed:stored.confirmed===true};}
function toolHintFromText(text){const t=String(text||'').toUpperCase();if(/CENTER\s*DRILL|ЦЕНТРОВ(?:ОЧН|К)|ЦЕНТРОВКА/.test(t))return{operation:'centerdrill',kind:'centerdrill'};if(/\bTAP\b|МЕТЧИК/.test(t))return{operation:'tap',kind:'tap'};if(/\bDRILL\b|СВЕРЛ/.test(t))return{operation:'drill',kind:'drill'};if(/\bBOR(?:E|ING)\b|РАСТОЧ|SCLCR|CCMT/.test(t))return{operation:'boring',kind:'ccmt'};if(/GROOV|КАНАВ|MGEHR|MGMN/.test(t))return{operation:'groove',kind:'mgmn'};if(/THREAD|РЕЗЬБ|\bSER\b|16ER|16IR/.test(t))return{operation:'thread',kind:'thread'};if(/EXTERNAL|НАРУЖ|PCLNR|CNMG|SVJBR|VNMG/.test(t))return{operation:'external',kind:/SVJBR|VNMG/.test(t)?'vnmg':'cnmg'};return null;}
function detectToolCatalog(code,cfg){
 const map=new Map(),lines=String(code||'').split(/\r?\n/);let active=0;
 lines.forEach((source,index)=>{
  const textHint=toolHintFromText(source),line=stripGComments(source),{out,all}=parseWords(line);
  if(Number.isFinite(out.T)){
   active=toolStation(out.T);
   if(active){const codeText=String(Math.abs(Math.round(out.T))).padStart(4,'0');if(!map.has(active))map.set(active,{station:active,code:codeText,codes:new Set(),firstLine:index+1,hints:[],xs:[]});map.get(active).codes.add(codeText);}
  }
  if(!active)return;
  const gs=all.filter(w=>w.key==='G').map(w=>Math.round(w.value)),entry=map.get(active);
  if(textHint)entry.hints.push(textHint);
  if(Number.isFinite(out.X))entry.xs.push(Math.abs(out.X));
  if(gs.some(g=>[81,83].includes(g)))entry.hints.push({operation:'drill',kind:'drill'});
  else if(gs.includes(75))entry.hints.push({operation:'groove',kind:'mgmn'});
  else if(gs.includes(76))entry.hints.push({operation:'thread',kind:'thread'});
  else if(gs.includes(74)&&Number.isFinite(out.Z))entry.hints.push({operation:'drill',kind:'drill'});
 });
 return[...map.values()].map(entry=>{let hint=entry.hints[0]||null;if(!hint&&entry.xs.length&&Math.max(...entry.xs)<=Math.max(6,(Number(cfg&&cfg.boreD)||0)*1.5))hint={operation:'boring',kind:'ccmt'};const c=defaultToolConfig(entry.station,cfg,{...(hint||{}),code:entry.code});c.codes=[...entry.codes];c.firstLine=entry.firstLine;return c;});
}
function normalizeToolConfigs(cfg,catalog){const supplied=cfg&&cfg.toolConfigs||{},out={};(catalog||[]).forEach(item=>{const saved=supplied[item.station]||supplied[String(item.station)]||{},base=defaultToolConfig(item.station,cfg,item),kind=saved.kind||base.kind,lib=TOOL_LIBRARY[kind]||TOOL_LIBRARY.cnmg;out[item.station]={...base,...saved,station:item.station,code:item.code||base.code,kind,operation:saved.operation||base.operation||lib.operation,diameter:Number(saved.diameter??base.diameter),workingLength:Number(saved.workingLength??base.workingLength),bodyD:Number(saved.bodyD??base.bodyD),minBore:Number(saved.minBore??base.minBore),nose:Number(saved.nose??base.nose),pointAngle:Number(saved.pointAngle??base.pointAngle),insertWidth:Number(saved.insertWidth??base.insertWidth),confirmed:saved.confirmed==null?base.confirmed:saved.confirmed===true};});return out;}

function targetOuter(c,t){
 const stock=c.stockD/2,base=c.targetD/2;
 if(c.operation==='groove'){
  const half=Math.min(.22,Math.max(.025,c.stepLen/c.length/2)),mid=.73;
  return Math.abs(t-mid)<=half?base:stock;
 }
 if(c.contour==='step'){
  const edge=Math.max(.05,1-c.stepLen/c.length);
  return t>=edge?base:c.stepD/2;
 }
 if(c.contour==='chamfer'){
  const edge=Math.max(.84,1-2/c.length);
  return t>edge?Math.max(1,base-2*(t-edge)/(1-edge)):base;
 }
 return base;
}

function validate(raw){
 const c={...defaults(),...raw},p=profile(),errors=[],warnings=[];
 if(!(c.stockD>=5&&c.stockD<=500))errors.push('Диаметр заготовки: 5–500 мм.');
 if(!(c.length>=10&&c.length<=1200))errors.push('Длина заготовки: 10–1200 мм.');
 if(!(c.grip>0&&c.grip<c.length))errors.push('Длина зажима должна быть меньше длины заготовки.');
 if(!(c.depth>0&&c.depth<=10))errors.push('Глубина резания должна быть больше 0 и не более 10 мм на сторону.');
 if(!(c.feed>0&&c.feed<=2))errors.push('Подача должна быть в диапазоне 0–2 мм/об.');
 if(!(c.rpm>0))errors.push('Обороты должны быть больше нуля.');
 if(p.maxRpm&&c.rpm>p.maxRpm)errors.push(`S${c.rpm} выше лимита профиля станка S${p.maxRpm}.`);
 if(c.operation==='boring'){
  if(!(c.boreD>0&&c.boreD<c.stockD-2))errors.push('Для расточки нужен исходный Ø отверстия меньше наружного Ø.');
  if(!(c.targetD>c.boreD&&c.targetD<c.stockD-2))errors.push('Целевой Ø расточки должен быть больше исходного отверстия и меньше наружного Ø.');
  if(!['ccmt','vnmg'].includes(c.tool))warnings.push('Для показанной расточки обычно выбирают расточной инструмент; проверьте державку и минимальный Ø.');
 }else{
  if(!(c.targetD>0&&c.targetD<c.stockD))errors.push('Целевой наружный Ø должен быть меньше Ø заготовки.');
  if(c.contour==='step'&&!(c.stepD>=c.targetD&&c.stepD<c.stockD))errors.push('Второй Ø ступени должен быть между целевым Ø и Ø заготовки.');
  if(c.contour==='step'&&!(c.stepLen>0&&c.stepLen<c.length-c.grip))errors.push('Длина ступени должна помещаться вне зоны зажима.');
  if(c.operation==='groove'&&c.tool!=='mgmn')warnings.push('Для канавки показан профиль MGMN; выбранный инструмент проверьте по ширине и вылету.');
 }
 if(c.grip<c.stockD*.35)warnings.push('Короткий зажим: это только визуальная модель — допустимый зажим определяет оснастка и техпроцесс.');
 if(c.length-c.grip>c.stockD*4)warnings.push('Большой вылет: оцените необходимость центра/люнета и снизьте режим по фактической жёсткости.');
 return{errors,warnings};
}

function buildModel(raw){
 const cfg={...defaults(),...raw};let removal=0;
 if(cfg.operation==='boring')removal=(cfg.targetD-cfg.boreD)/2;
 else{
  let minR=cfg.stockD/2;
  for(let i=0;i<=60;i++)minR=Math.min(minR,targetOuter(cfg,i/60));
  removal=cfg.stockD/2-minR;
 }
 const totalPasses=Math.max(1,Math.ceil(Math.max(0,removal)/Math.max(.01,cfg.depth)));
 return{cfg,totalPasses,pass:0,progress:0,spin:0,running:false,complete:false};
}

function stripGComments(line){return String(line||'').replace(/\([^)]*\)/g,' ').replace(/;.*$/,' ').trim().toUpperCase();}
function parseWords(line){const out={},all=[];String(line||'').replace(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g,(_,k,v)=>{const item={key:k,raw:v,value:Number(v),hasDecimal:v.includes('.')};all.push(item);out[k]=item.value;return _;});return{out,all};}
function normAngle(a){while(a<=-Math.PI)a+=Math.PI*2;while(a>Math.PI)a-=Math.PI*2;return a;}
function arcPath(from,to,words,cw,cfg,unit){
 const a={u:from.z,v:from.x/2},b={u:to.z,v:to.x/2},du=b.u-a.u,dv=b.v-a.v,chord=Math.hypot(du,dv);if(chord<1e-8)return null;
 let centers=[];
 if(Number.isFinite(words.R)){
  const radius=Math.abs(words.R*unit);if(radius<chord/2-1e-6)return null;
  const mu=(a.u+b.u)/2,mv=(a.v+b.v)/2,hgt=Math.sqrt(Math.max(0,radius*radius-chord*chord/4)),pu=-dv/chord,pv=du/chord;
  centers=[{u:mu+pu*hgt,v:mv+pv*hgt},{u:mu-pu*hgt,v:mv-pv*hgt}];
 }else if(Number.isFinite(words.I)||Number.isFinite(words.K)){
  const i=(Number.isFinite(words.I)?words.I:0)*unit/(cfg.arcCenterDiameter===false?1:2),k=(Number.isFinite(words.K)?words.K:0)*unit;
  centers=[{u:a.u+k,v:a.v+i}];
 }else return null;
 const wantLong=Number.isFinite(words.R)&&words.R<0;
 let chosen=null;
 centers.forEach(c=>{const sa=Math.atan2(a.v-c.v,a.u-c.u),ea=Math.atan2(b.v-c.v,b.u-c.u);let sweep=normAngle(ea-sa);if(cw&&sweep>0)sweep-=Math.PI*2;if(!cw&&sweep<0)sweep+=Math.PI*2;const long=Math.abs(sweep)>Math.PI+1e-6;if(centers.length===1||long===wantLong)chosen={c,sa,sweep,r:Math.hypot(a.u-c.u,a.v-c.v)};});
 if(!chosen)return null;const endRadius=Math.hypot(b.u-chosen.c.u,b.v-chosen.c.v);if(Math.abs(endRadius-chosen.r)>Math.max(.02,chosen.r*.002))return null;const count=Math.max(8,Math.min(180,Math.ceil(Math.abs(chosen.sweep)*chosen.r/1.4))),points=[];
 for(let j=0;j<=count;j++){const q=j/count,ang=chosen.sa+chosen.sweep*q;points.push({z:chosen.c.u+Math.cos(ang)*chosen.r,x:(chosen.c.v+Math.sin(ang)*chosen.r)*2});}
 points[0]={...from};points[points.length-1]={...to};return points;
}
function segmentSamples(seg,spacing=.65){const pts=seg.points&&seg.points.length>1?seg.points:[seg.from,seg.to],out=[];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],steps=Math.max(2,Math.ceil(Math.hypot(b.z-a.z,(b.x-a.x)/2)/spacing));for(let j=i===1?0:1;j<=steps;j++){const q=j/steps;out.push({z:a.z+(b.z-a.z)*q,x:a.x+(b.x-a.x)*q});}}return out;}
function compensatedToolPath(points,mode,nose){if(!mode||!(nose>0)||!points||points.length<2)return(points||[]).map(p=>({...p}));return points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dz=b.z-a.z,dr=(b.x-a.x)/2,len=Math.hypot(dz,dr),normalR=len?dz/len:0,shift=(mode===41?1:-1)*normalR*nose;return{z:p.z,x:p.x+shift*2};});}

function parseGcode(code,rawCfg){
 const cfg={...defaults(),arcCenterDiameter:true,showCycles:true,...(rawCfg||{})},p=profile(),issues=[],segments=[],seen=new Set();
 const fanuc=cfg.dialect==='fanuc',dialectName=fanuc?'Fanuc':'Haas';
 const lines=String(code||'').split(/\r?\n/),records=lines.map((source,index)=>{const clean=stripGComments(source),parsed=parseWords(clean);return{source,index,line:index+1,clean,out:parsed.out,all:parsed.all,gs:parsed.all.filter(w=>w.key==='G').map(w=>Math.round(w.value)),ms:parsed.all.filter(w=>w.key==='M').map(w=>Math.round(w.value))};});
 const labels=new Map(),duplicateLabels=[];records.forEach(r=>{if(Number.isFinite(r.out.N)){const key=Math.round(r.out.N);if(labels.has(key))duplicateLabels.push({label:key,line:r.line});else labels.set(key,r.index);}});
 const catalog=detectToolCatalog(code,cfg),toolConfigs=normalizeToolConfigs({...cfg,toolConfigs:cfg.toolConfigs||{}},catalog);cfg.toolConfigs=toolConfigs;
 const add=(type,text,line,segment)=>{const key=`${type}:${text}:${line||0}`;if(seen.has(key))return;seen.add(key);issues.push({type,text,line:line||0});if(segment){segment.suspicious=true;(segment.reasons||(segment.reasons=[])).push(text);}};
 duplicateLabels.forEach(x=>add('bad',`Номер кадра N${x.label} повторяется: диапазоны P/Q неоднозначны.`,x.line));
 const definitionLines=new Set();records.forEach(r=>{if(!r.gs.some(g=>[70,71].includes(g))||!Number.isFinite(r.out.P)||!Number.isFinite(r.out.Q))return;const a=labels.get(Math.round(r.out.P)),b=labels.get(Math.round(r.out.Q));if(a==null||b==null||b<a){if(a==null)add('bad',`G${r.gs.includes(71)?71:70}: кадр P${Math.round(r.out.P)} не найден.`,r.line);if(b==null)add('bad',`G${r.gs.includes(71)?71:70}: кадр Q${Math.round(r.out.Q)} не найден.`,r.line);if(a!=null&&b!=null&&b<a)add('bad','Диапазон P/Q задан в обратном порядке.',r.line);return;}for(let i=a;i<=b;i++)definitionLines.add(i);});
 const stationSpec=station=>toolConfigs[station]||defaultToolConfig(station,cfg,{code:station?String(station).padStart(2,'0')+'01':''});
 let pos={x:cfg.stockD+12,z:6},motion='G00',unit=1,spindleMode='G97',g50=false,spindleOn=false,spindleStart=false,end=false,g99=false,g18=false,compMode=0,rpm=cfg.rpm,feed=cfg.feed,toolCode='',station=0,g71Depth=0,g71Retract=.5,g74Retract=.5,g75Retract=.5,g76Setup=null,g90Modal=null;
 const collisionMat=blankStock({...cfg,toolConfigs});
 const toPoint=(from,out,u=unit)=>{const to={...from};if(Number.isFinite(out.X))to.x=out.X*u;if(Number.isFinite(out.Z))to.z=out.Z*u;if(Number.isFinite(out.U))to.x=from.x+out.U*u;if(Number.isFinite(out.W))to.z=from.z+out.W*u;return to;};
 /* Fanuc задаёт глубины циклов в микронах без точки, Haas — в миллиметрах с точкой.
    В режиме Fanuc считаем микронами всегда; в режиме Haas доверяем десятичной точке. */
 const micron=(value,u=unit,word)=>{const v=Math.abs(Number(value)||0);if(!v)return 0;
  if(fanuc)return(word&&word.hasDecimal?v:v/1000)*u;
  return(word&&word.hasDecimal?v:v>50?v/1000:v)*u;};
 const wordOf=(r,key)=>r&&r.all&&r.all.find(w=>w.key===key)||null;
 const makeSegment=(from,to,opt={})=>{const spec=opt.toolSpec||stationSpec(opt.station==null?station:opt.station),m=opt.motion||motion,arc=m==='G02'||m==='G03',rapid=opt.rapid==null?m==='G00':!!opt.rapid,words=opt.words||{},rawPoints=opt.points||(arc?arcPath(from,to,words,m==='G02',cfg,opt.unit||unit):null)||[{...from},{...to}],activeComp=opt.compMode==null?compMode:opt.compMode,pts=!rapid&&activeComp?compensatedToolPath(rawPoints,activeComp,Math.max(0,spec.nose||0)):rawPoints,segment={from:{...pts[0]},to:{...pts[pts.length-1]},programmedFrom:{...from},programmedTo:{...to},programmedPoints:activeComp?rawPoints:null,points:pts,motion:m,line:opt.line||0,source:opt.source||'',clean:opt.clean||'',rapid,arc,cw:m==='G02',cutting:opt.cutting==null?(!rapid&&spindleOn):!!opt.cutting,spindle:spindleOn,rpm:opt.rpm||rpm,feed:opt.feed||feed,toolCode:opt.toolCode==null?toolCode:opt.toolCode,toolStation:spec.station||0,toolSpec:{...spec},operation:opt.operation||spec.operation||cfg.operation,compMode:activeComp,geometryCompensated:!!(!rapid&&activeComp&&spec.nose>0),cycle:opt.cycle||'',synthetic:!!opt.synthetic,suspicious:false,reasons:[]};if(arc&&!(opt.points||arcPath(from,to,words,m==='G02',cfg,opt.unit||unit)))add('bad','Дуга G02/G03 не построена: проверьте R либо I/K и конечную точку.',segment.line,segment);return segment;};
 const inspectAndPush=segment=>{if(segment.to.x<0||segment.points.some(q=>q.x<0))add('bad','Отрицательная координата X: возможен переход через ось.',segment.line,segment);const spec=segment.toolSpec||stationSpec(segment.toolStation),op=segment.operation,freeLen=Math.max(1,cfg.length-cfg.grip),axial=['drill','centerdrill','tap'].includes(op),samples=segmentSamples(segment);if(segment.compMode&&!(spec.nose>0))add('bad','G41/G42 требует задать радиус вершины для активного инструмента.',segment.line,segment);
  if(axial&&samples.some(q=>q.z<=.05&&Math.abs(q.x)>.15))add('bad',`${op==='tap'?'Метчик':'Сверло'} идёт не по оси X0.`,segment.line,segment);
  if(axial&&Math.min(segment.from.z,segment.to.z)<-Math.max(.1,spec.workingLength||0))add('bad',`Рабочая длина инструмента ${spec.workingLength||0} мм меньше заданной глубины.`,segment.line,segment);
  for(const q of samples){const r=Math.abs(q.x)/2,k=Math.max(0,Math.min(collisionMat.z.length-1,Math.round((q.z+cfg.length)/cfg.length*(collisionMat.z.length-1)))),outer=collisionMat.outer[k],inner=collisionMat.inner[k];
   if(q.z<-freeLen&&r<cfg.stockD/2+Math.max(12,(spec.bodyD||0)/2)){add('bad','Траектория или корпус инструмента входит в заданную зону зажима/патрона.',segment.line,segment);break;}
   if(axial){const toolR=Math.max(0,(spec.diameter||0)/2),bodyR=Math.max(toolR,(spec.bodyD||0)/2);if(toolR<=0)add('bad','Для осевого инструмента не задан диаметр.',segment.line,segment);if(toolR>=outer-.2)add('bad','Диаметр осевого инструмента не оставляет стенку заготовки.',segment.line,segment);if(segment.rapid&&!segment.cycle&&q.z<0&&inner+0.05<toolR){add('bad','Быстрый ход осевого инструмента входит в неснятый металл.',segment.line,segment);break;}if(q.z<-(spec.workingLength||0)&&bodyR>inner+.05){add('bad','Корпус/патрон инструмента касается торца или отверстия.',segment.line,segment);break;}if(op==='tap'&&q.z<0&&inner+0.05<(spec.minBore||spec.diameter*.8)/2){add('bad','Отверстие под метчик меньше заданного минимального диаметра.',segment.line,segment);break;}}
   else if(op==='boring'){if(spec.minBore&&inner*2+0.05<spec.minBore&&q.z<=0)add('bad',`Расточная оправка требует отверстие не меньше Ø${spec.minBore} мм.`,segment.line,segment);const hit=segment.rapid&&q.z<=0&&q.z>=-freeLen&&r>inner+.05&&r<outer-.05;if(hit){add('bad','Быстрый ход расточного резца пересекает текущую стенку отверстия.',segment.line,segment);break;}}
   else{const hit=segment.rapid&&q.z<=0&&q.z>=-freeLen&&r<outer-.05&&(inner<=.05||r>inner+.05);if(hit){add('bad','Быстрый ход G00 пересекает текущую поверхность заготовки.',segment.line,segment);break;}}
  }
  segments.push(segment);applySegmentCut(collisionMat,segment,cfg,1);return segment;
 };
 const addLinear=(from,to,opt={})=>inspectAndPush(makeSegment(from,to,opt));
 const buildContour=(start,a,b,spec,ctx)=>{let cp={...start},cm='G00',cu=ctx.unit,cf=ctx.feed,cr=ctx.rpm,cc=ctx.compMode,out=[];for(let i=a;i<=b;i++){const r=records[i];if(r.gs.includes(20))cu=25.4;if(r.gs.includes(21))cu=1;if(r.gs.includes(0))cm='G00';if(r.gs.includes(1))cm='G01';if(r.gs.includes(2))cm='G02';if(r.gs.includes(3))cm='G03';if(r.gs.includes(40))cc=0;if(r.gs.includes(41))cc=41;if(r.gs.includes(42))cc=42;if(Number.isFinite(r.out.F))cf=r.out.F;if(Number.isFinite(r.out.S))cr=r.out.S;if(!['X','Z','U','W'].some(k=>Number.isFinite(r.out[k])))continue;const to=toPoint(cp,r.out,cu),arc=cm==='G02'||cm==='G03',pts=arc?arcPath(cp,to,r.out,cm==='G02',cfg,cu):[{...cp},{...to}],seg=makeSegment(cp,to,{motion:cm,points:pts||undefined,words:r.out,unit:cu,line:r.line,source:r.source,clean:r.clean,cutting:cm!=='G00',rapid:cm==='G00',toolSpec:spec,feed:cf,rpm:cr,compMode:cc,cycle:'CONTOUR'});if(arc&&!pts)add('bad','Дуга в контуре P/Q не построена.',r.line,seg);out.push(seg);cp=to;}return out;};
 const contourFor=(r,spec)=>{const a=labels.get(Math.round(r.out.P)),b=labels.get(Math.round(r.out.Q));if(a==null||b==null||b<a)return[];return buildContour(pos,a,b,spec,{unit,feed,rpm,compMode});};
 const addPolyline=(pts,opt)=>{if(!pts||pts.length<2)return null;return inspectAndPush(makeSegment(pts[0],pts[pts.length-1],{...opt,points:pts}));};
 records.forEach(r=>{
  if(!r.clean)return;if(definitionLines.has(r.index))return;
  const {out,gs,ms}=r;
  if(gs.includes(20))unit=25.4;if(gs.includes(21))unit=1;
  if(gs.includes(18))g18=true;if(gs.includes(0))motion='G00';if(gs.includes(1))motion='G01';if(gs.includes(2))motion='G02';if(gs.includes(3))motion='G03';if(gs.some(g=>[0,1,2,3,70,71,74,75,76,81,83].includes(g)))g90Modal=null;
  if(gs.includes(50))g50=true;if(gs.includes(96)){spindleMode='G96';if(!g50)add('bad','G96 включён без предварительного ограничения G50 S…',r.line);}if(gs.includes(97))spindleMode='G97';if(gs.includes(99))g99=true;
  if(gs.includes(40))compMode=0;if(gs.includes(41))compMode=41;if(gs.includes(42))compMode=42;
  if(ms.some(x=>[3,4,13,14].includes(x))){spindleOn=true;spindleStart=true;}if(ms.some(x=>[5,15].includes(x)))spindleOn=false;if(ms.includes(30)){end=true;spindleOn=false;}
  if(Number.isFinite(out.S))rpm=out.S;if(Number.isFinite(out.F))feed=out.F;if(Number.isFinite(out.T)){const tv=Math.abs(Math.round(out.T));toolCode=String(tv).padStart(4,'0');station=toolStation(tv);}
  const spec=stationSpec(station),op=spec.operation||cfg.operation;
  if(r.clean.includes('#')||/\b(IF|WHILE|GOTO|M97|M98)\b/.test(r.clean))add('bad','Макросы и подпрограммы нельзя достоверно раскрыть: вставьте развёрнутую программу.',r.line);
  /* проверка выбранного диалекта стойки */
  if(fanuc){
   const haasOnly=gs.find(g=>[12,13,100,101,102,103,150,187].includes(g)||g>=110&&g<=129||g===154);
   if(haasOnly!=null)add('warn',`G${haasOnly} — код Haas. На Fanuc такого кода нет: при переносе кадр правится вручную.`,r.line);
   if(ms.some(x=>[97,109,138,139].includes(x)))add('warn','M97/M109/M138 — коды Haas, на Fanuc они не выполнятся.',r.line);
   if(gs.includes(71)&&Number.isFinite(out.P)&&Number.isFinite(out.D))add('warn','Однокадровый G71 с адресом D — форма Haas. Fanuc ждёт два кадра: G71 U(глубина) R(отход), затем G71 P Q U W F.',r.line);
   if(Number.isFinite(out.L)&&gs.some(g=>[70,71,74,75,76,81,83].includes(g)))add('warn','Число повторов на Fanuc задаётся адресом K, а не L.',r.line);
  }else{
   if(gs.includes(50)&&gs.includes(92))add('warn','G92 как установка координат — форма Fanuc; на Haas это G50.',r.line);
   if(ms.includes(29))add('warn','M29 — код Fanuc: на Haas жёсткое нарезание встроено в цикл и отдельный M29 не нужен.',r.line);
   if(/\bG54\.1\b/.test(r.clean))add('warn','G54.1 — дополнительная нулевая точка Fanuc. На Haas это G154 P__.',r.line);
   if(/\bG5[01]\.1\b/.test(r.clean))add('warn','G50.1/G51.1 — зеркало Fanuc. На Haas это G100/G101.',r.line);
   if(ms.includes(198))add('warn','M198 — вызов с внешнего устройства на Fanuc; на Haas работа с носителя идёт иначе.',r.line);
   if(Number.isFinite(out.K)&&gs.some(g=>[70,71,76].includes(g)))add('warn','Число повторов на Haas задаётся адресом L, а не K.',r.line);
  }
  if(gs.includes(28)||gs.includes(53))add('warn','G28/G53 показан только как программная линия: машинный ноль и реальная безопасная позиция проверяются на стойке.',r.line);
  if(Number.isFinite(out.S)&&spindleMode==='G97'&&p.maxRpm&&out.S>p.maxRpm)add('bad',`S${out.S} выше лимита профиля станка S${p.maxRpm}.`,r.line);
  if(gs.includes(71)&&!Number.isFinite(out.P)&&!Number.isFinite(out.Q)){if(Number.isFinite(out.U))g71Depth=Math.abs(out.U*unit);if(Number.isFinite(out.D))g71Depth=Math.abs(out.D*unit);if(Number.isFinite(out.R))g71Retract=Math.abs(out.R*unit);if(!g71Depth)add('bad','Первый кадр G71 должен задать глубину U/D.',r.line);return;}
  if(gs.includes(71)&&Number.isFinite(out.P)&&Number.isFinite(out.Q)){const contour=contourFor(r,spec);if(!contour.length)return;const pts=[];contour.forEach((s,i)=>{(s.points||[s.from,s.to]).forEach((q,j)=>{if(i||j)pts.push({...q});else pts.push({...q});});});let zDir=0,nonMonotonic=false;for(let i=1;i<pts.length;i++){const dz=pts[i].z-pts[i-1].z;if(Math.abs(dz)<1e-6)continue;const d=Math.sign(dz);if(zDir&&d!==zDir)nonMonotonic=true;zDir=zDir||d;}if(nonMonotonic){add('bad','G71 Type II с обратным ходом Z заблокирован: требуется монотонный контур Type I.',r.line);return;}const allowance=Math.abs(Number(out.U)||0)*unit,depth=Math.abs(Number(out.D)||g71Depth||cfg.depth),stepX=Math.max(.02,depth*2),external=op!=='boring',targetXs=pts.map(q=>q.x+(external?allowance:-allowance)),limit=external?Math.min(...targetXs):Math.max(...targetXs),start={...pos};let level=start.x,pass=0;while((external?level-stepX>limit+.001:level+stepX<limit-.001)&&pass<80){level+=external?-stepX:stepX;const cutPts=pts.map(q=>({z:q.z,x:external?Math.max(q.x+allowance,level):Math.min(q.x-allowance,level)})),entry=cutPts[0];if(Math.hypot(entry.z-pos.z,(entry.x-pos.x)/2)>.001)addLinear(pos,entry,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G71',synthetic:true});addPolyline(cutPts,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:`${r.clean} (ПРОХОД ${pass+1})`,toolSpec:spec,operation:op,cycle:'G71',synthetic:true});const last=cutPts.at(-1),away={x:last.x+(external?1:-1)*Math.max(.2,g71Retract*2),z:last.z};addLinear(last,away,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G71',synthetic:true});addLinear(away,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G71',synthetic:true});pos={...start};pass++;}if(pass>=80)add('bad','G71 потребовал более 80 проходов: проверьте глубину U/D и диаметры.',r.line);else if(!pass)add('warn','G71 не создал черновых слоёв: заготовка уже близка к контуру или неверна операция инструмента.',r.line);return;}
  if(gs.includes(70)){if(!Number.isFinite(out.P)||!Number.isFinite(out.Q)){add('bad','G70 должен содержать P и Q.',r.line);return;}const contour=contourFor(r,spec);if(!contour.length)return;for(const cs of contour){const seg={...cs,toolSpec:{...spec},cutting:cs.motion!=='G00'&&spindleOn,spindle:spindleOn,cycle:'G70',synthetic:true,suspicious:false,reasons:[]};inspectAndPush(seg);pos={...(cs.programmedTo||cs.to)};}return;}
  if((gs.includes(90)||g90Modal&&gs.length===0)&&['X','Z','U','W'].some(k=>Number.isFinite(out[k]))){if(Number.isFinite(out.I)){add('bad','Конусный G90 с I заблокирован до выбора направления и квадранта.',r.line);return;}const start={...pos},cycleWords={...out};if(!Number.isFinite(cycleWords.Z)&&!Number.isFinite(cycleWords.W)&&g90Modal)cycleWords.Z=g90Modal.z/unit;const to=toPoint(start,cycleWords,unit),radial={x:to.x,z:start.z};if(Math.abs(radial.x-start.x)>.001)addLinear(start,radial,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G90',synthetic:true});addLinear(radial,to,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G90',synthetic:true});const clear={x:start.x,z:to.z};addLinear(to,clear,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G90',synthetic:true});addLinear(clear,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G90',synthetic:true});g90Modal={z:to.z};pos=start;return;}
  if(gs.includes(75)&&!Number.isFinite(out.X)){if(Number.isFinite(out.R))g75Retract=Math.abs(out.R*unit);return;}
  if(gs.includes(75)&&Number.isFinite(out.X)){if(op!=='groove')add('warn','G75 назначен инструменту не как канавочная операция.',r.line);const start={...pos},targetZ=Number.isFinite(out.Z)?out.Z*unit:start.z,zDir=Math.sign(targetZ-start.z)||-1,zStep=Math.max(.01,Number.isFinite(out.K)?Math.abs(out.K*unit):Number.isFinite(out.Q)&&out.Q!==0?micron(out.Q,unit,wordOf(r,'Q')):Math.abs(targetZ-start.z)||1),zList=[];let zz=start.z,guardZ=0;while((zDir<0?zz>targetZ+.001:zz<targetZ-.001)&&guardZ++<100){zList.push(zz);zz=zDir<0?Math.max(targetZ,zz-zStep):Math.min(targetZ,zz+zStep);}zList.push(targetZ);const target=out.X*unit,dir=Math.sign(target-start.x)||-1,peck=Math.max(.02,Number.isFinite(out.I)?Math.abs(out.I*unit)*2:Number.isFinite(out.P)?micron(out.P,unit,wordOf(r,'P'))*2:Math.abs(target-start.x));for(const z of zList){const approach={x:start.x,z};if(Math.hypot(approach.z-pos.z,(approach.x-pos.x)/2)>.001)addLinear(pos,approach,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});let cur=start.x,guard=0;while((dir<0?cur>target+.001:cur<target-.001)&&guard++<100){const next=dir<0?Math.max(target,cur-peck):Math.min(target,cur+peck),a={x:cur,z},b={x:next,z};addLinear(a,b,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});if(next!==target){const back={x:next-dir*g75Retract*2,z};addLinear(b,back,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});addLinear(back,b,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});}cur=next;}pos={x:target,z};addLinear(pos,approach,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});pos=approach;}if(Math.hypot(pos.z-start.z,(pos.x-start.x)/2)>.001)addLinear(pos,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});pos=start;return;}
  if(gs.includes(76)&&!Number.isFinite(out.X)){g76Setup={...out,line:r.line};return;}
  if(gs.includes(76)&&Number.isFinite(out.X)&&Number.isFinite(out.Z)){if(op!=='thread')add('warn','G76 назначен инструменту не как резьбовая операция.',r.line);const start={...pos},targetX=out.X*unit,targetZ=out.Z*unit,height=Number.isFinite(out.K)?Math.abs(out.K*unit):Number.isFinite(out.P)&&out.P>20?micron(out.P,unit,wordOf(r,'P')):Math.abs(start.x-targetX)/2,first=Number.isFinite(out.D)?Math.abs(out.D*unit):Number.isFinite(out.Q)?micron(out.Q,unit,wordOf(r,'Q')):height/2.5,rawPasses=first>0?Math.ceil((height/first)*(height/first)):6,passes=Math.max(3,Math.min(24,rawPasses));if(!(height>0&&first>0))add('bad','G76: не удалось определить высоту профиля и глубину первого прохода.',r.line);if(rawPasses>24)add('warn',`G76 расчётно требует ${rawPasses} проходов; в эмуляторе показаны первые 24.`,r.line);for(let i=1;i<=passes;i++){const q=i/passes,level=start.x-(start.x-targetX)*Math.sqrt(q),entry={x:level,z:start.z};addLinear(i===1?start:{x:start.x,z:start.z},entry,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G76',synthetic:true});const endPt={x:level,z:targetZ};addLinear(entry,endPt,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:`${r.clean} (ПРОХОД ${i})`,toolSpec:spec,cycle:'G76',synthetic:true});const clear={x:start.x+2,z:targetZ};addLinear(endPt,clear,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G76',synthetic:true});addLinear(clear,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G76',synthetic:true});}pos=start;return;}
  if(gs.includes(74)&&!Number.isFinite(out.Z)){if(Number.isFinite(out.R))g74Retract=Math.abs(out.R*unit);return;}
  const axialCycle=gs.find(g=>[81,83].includes(g))||(gs.includes(74)&&Number.isFinite(out.Z)&&['drill','centerdrill','tap'].includes(op)?74:0);
  if(gs.includes(74)&&Number.isFinite(out.Z)&&!axialCycle){add('bad','G74 неоднозначен: назначьте станции сверление либо используйте поддерживаемую отдельную операцию торцевой канавки.',r.line);return;}
  if(axialCycle){if(!['drill','centerdrill','tap'].includes(op)){add('bad',`G${axialCycle} требует назначить станции осевой инструмент.`,r.line);return;}const start={...pos},axisX=Number.isFinite(out.X)?out.X*unit:start.x,rPlane=Number.isFinite(out.R)?out.R*unit:Math.max(1,start.z),depth=Number.isFinite(out.Z)?out.Z*unit:NaN;if(!Number.isFinite(depth)){add('bad',`G${axialCycle}: не задана глубина Z.`,r.line);return;}if(Number.isFinite(out.Q)&&out.Q<=0)add('bad',`G${axialCycle}: шаг Q должен быть больше нуля.`,r.line);const hasVariable=['I','J','K'].some(k=>Number.isFinite(out[k]));if(Number.isFinite(out.Q)&&hasVariable)add('bad',`G${axialCycle}: нельзя одновременно задавать Q и I/J/K.`,r.line);if(hasVariable&&(!(out.I>0)||!(out.K>0)||Number(out.J)<0))add('bad',`G${axialCycle}: для переменного клевка нужны I>0, J≥0 и K>0.`,r.line);let at={x:axisX,z:start.z};if(Math.hypot(at.z-pos.z,(at.x-pos.x)/2)>.001)addLinear(pos,at,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});if(Math.abs(at.z-rPlane)>.001){const q={x:axisX,z:rPlane};addLinear(at,q,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});at=q;}let peck=axialCycle===81?Math.abs(depth-rPlane):Math.max(.05,Number.isFinite(out.Q)?micron(out.Q,unit,wordOf(r,'Q')):hasVariable?Math.abs(out.I*unit):Math.min(Math.abs(depth-rPlane),Math.max(1,(spec.diameter||5)*1.5)));const minPeck=hasVariable?Math.max(.05,Math.abs(out.K*unit)):peck,peckDrop=hasVariable?Math.max(0,Math.abs((out.J||0)*unit)):0,dir=Math.sign(depth-rPlane)||-1;let z=at.z,guard=0;while((dir<0?z>depth+.001:z<depth-.001)&&guard++<200){const next=dir<0?Math.max(depth,z-peck):Math.min(depth,z+peck),tip={x:axisX,z:next};addLinear({x:axisX,z},tip,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});z=next;peck=Math.max(minPeck,peck-peckDrop);if(z!==depth){const retract={x:axisX,z:axialCycle===83?rPlane:z-dir*Math.max(.2,g74Retract)};addLinear(tip,retract,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});addLinear(retract,{x:axisX,z},{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});}}const retract={x:axisX,z:rPlane};addLinear({x:axisX,z:depth},retract,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});pos=retract;return;}
  if(gs.some(g=>[72,73,77,78,79,92,94].includes(g))&&['X','Z','U','W'].some(k=>Number.isFinite(out[k]))){add('bad',`G${gs.find(g=>[72,73,77,78,79,92,94].includes(g))} как токарный цикл не должен превращаться в обычный ход: выберите поддерживаемую схему.`,r.line);return;}
  const hasMove=['X','Z','U','W'].some(k=>Number.isFinite(out[k]));if(!hasMove)return;const to=toPoint(pos,out,unit),arc=motion==='G02'||motion==='G03',points=arc?arcPath(pos,to,out,motion==='G02',cfg,unit):[{...pos},{...to}],segment=makeSegment(pos,to,{motion,points:points||undefined,words:out,unit,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,operation:op});if(arc&&!points)add('bad','Дуга G02/G03 не построена: проверьте R либо I/K и конечную точку.',r.line,segment);inspectAndPush(segment);pos=to;
 });
 if(compMode)add('bad','Компенсация G41/G42 не отменена кодом G40.',lines.length);
 if(!g18&&segments.length)add('warn','G18 не найден: Эмулятор предполагает токарную плоскость XZ.',0);
 if(!g99)add('warn','G99 не найден: проверьте, что подача задана в мм/об.',0);
 if(!spindleStart&&segments.length)add('warn','Не найден запуск шпинделя M03/M04 или M13/M14.',0);
 if(catalog.length>1&&catalog.some(t=>!toolConfigs[t.station]?.confirmed))add('warn',`В программе несколько инструментов (${catalog.length}). Подтвердите карточку каждой станции T.`,0);
 catalog.forEach(t=>{const c=toolConfigs[t.station];if(c&&!c.confirmed)add('warn',`T${String(t.station).padStart(2,'0')}: назначение и габариты инструмента ещё не подтверждены оператором.`,t.firstLine);});
 if(!end)add('warn','Не найдено завершение программы M30.',0);
 if(!segments.length)add('bad','Не найдено перемещений X/Z для графической проверки.',0);
 const bad=issues.filter(x=>x.type==='bad').length,warn=issues.filter(x=>x.type==='warn').length;
 return{dialect:dialectName,segments,issues,lines,tools:catalog.map(t=>toolConfigs[t.station]||t),geometry:summarizeGeometry(collisionMat,cfg,segments),stats:{blocks:lines.filter(x=>stripGComments(x)).length,moves:segments.length,cuts:segments.filter(x=>x.cutting).length,bad,warn},cfg};
}

function blankStock(cfg,count){count=count||Math.min(1201,Math.max(181,Math.ceil(cfg.length)+1));const z=[],outer=[],inner=[],hasInitialHole=cfg.stock==='tube'||cfg.operation==='boring';for(let i=0;i<count;i++){z.push(-cfg.length+i*cfg.length/(count-1));outer.push(cfg.stockD/2);inner.push(hasInitialHole?Math.max(0,cfg.boreD/2):0);}return{z,outer,inner};}
function applySegmentCut(mat,seg,cfg,portion=1){
 if(!seg||!seg.cutting||portion<=0)return mat;const pts=seg.points&&seg.points.length>1?seg.points:[seg.from,seg.to],op=seg.operation||cfg.operation,spec=seg.toolSpec||defaultToolConfig(seg.toolStation||0,cfg),axial=['drill','centerdrill'].includes(op);if(pts.some(p=>p.x<0))return mat;const free=-Math.max(1,cfg.length-cfg.grip),limit=Math.max(0,Math.min(1,portion)),profileStep=cfg.length/Math.max(1,mat.z.length-1),faceAtZero=Math.abs(seg.to.z-seg.from.z)<1e-6&&Math.abs(seg.to.z)<=profileStep*.55;
 if(axial){const spans=[];let total=0;for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i].z-pts[i-1].z,(pts[i].x-pts[i-1].x)/2);spans.push(d);total+=d;}let remain=total*limit,deepest=Math.min(0,pts[0].z);for(let i=1;i<pts.length&&remain>1e-8;i++){const a=pts[i-1],b=pts[i],d=spans[i-1],take=Math.min(1,d?remain/d:1);deepest=Math.min(deepest,a.z+(b.z-a.z)*take);remain-=d*take;}const toolR=Math.max(0,(spec.diameter||0)/2),angle=Math.max(20,Math.min(175,spec.pointAngle||118))*Math.PI/180,tan=Math.tan(angle/2);for(let k=0;k<mat.z.length;k++){const z=mat.z[k];if(z>0.05||z<deepest-.05||z<free-.05)continue;const behind=Math.max(0,z-deepest),radius=Math.min(toolR,behind*tan);if(radius>mat.inner[k]&&radius<mat.outer[k]-.2)mat.inner[k]=radius;}return mat;}
 if(faceAtZero)return mat;
 const spans=[];let total=0;for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i].z-pts[i-1].z,(pts[i].x-pts[i-1].x)/2);spans.push(d);total+=d;}let remain=total*limit;
 for(let i=1;i<pts.length&&remain>1e-8;i++){const a=pts[i-1],b=pts[i],d=spans[i-1],take=Math.min(1,d?remain/d:1),steps=Math.max(2,Math.ceil(Math.hypot((b.z-a.z)*take,(b.x-a.x)*take/2)/.5));
  const dz=b.z-a.z,dr=(b.x-a.x)/2,len=Math.hypot(dz,dr),normalR=len?dz/len:0,compShift=seg.compMode&&!seg.geometryCompensated?(seg.compMode===41?1:-1)*normalR*Math.max(0,spec.nose||0):0;
  for(let j=0;j<=steps;j++){const q=j/steps*take,z=a.z+(b.z-a.z)*q,x=a.x+(b.x-a.x)*q,r=Math.max(0,Math.abs(x)/2+compShift);if(z>0.05||z<free-0.05)continue;const k=Math.max(0,Math.min(mat.z.length-1,Math.round((z+cfg.length)/cfg.length*(mat.z.length-1)))),spread=op==='groove'?Math.max(0,Math.ceil((spec.insertWidth||0)/2/profileStep)):0,k0=Math.max(0,k-spread),k1=Math.min(mat.z.length-1,k+spread);
   for(let kk=k0;kk<=k1;kk++){if(op==='boring'){if(r>mat.inner[kk]&&r<mat.outer[kk]-.2)mat.inner[kk]=r;}else if(op!=='tap'&&r>0&&r<mat.outer[kk])mat.outer[kk]=Math.max(mat.inner[kk]+.2,r);}
  }remain-=d*take;
 }
 return mat;
}
function stockProfile(result,cfg,upto,partial){const mat=blankStock(cfg),end=Math.max(0,Math.min(result&&result.segments?result.segments.length:0,Number.isFinite(upto)?upto:result.segments.length));for(let i=0;i<end;i++)applySegmentCut(mat,result.segments[i],cfg,1);if(result&&result.segments[end]&&partial>0)applySegmentCut(mat,result.segments[end],cfg,partial);return mat;}
function summarizeGeometry(mat,cfg,segments){const free=-Math.max(1,cfg.length-cfg.grip),active=[];for(let i=0;i<mat.z.length;i++){if(mat.z[i]>=free-.001&&mat.z[i]<=.05)active.push(i);}const minWall=active.length?Math.min(...active.map(i=>Math.max(0,mat.outer[i]-mat.inner[i]))):0,maxHoleD=active.length?Math.max(...active.map(i=>mat.inner[i]*2)):0,minOuterD=active.length?Math.min(...active.map(i=>mat.outer[i]*2)):cfg.stockD;let gripClear=Infinity;(segments||[]).forEach(seg=>(seg.points||[seg.from,seg.to]).forEach(q=>{if(q.z>=free&&q.x/2<cfg.stockD/2+Math.max(12,(seg.toolSpec&&seg.toolSpec.bodyD||0)/2))gripClear=Math.min(gripClear,q.z-free);}));return{minWall:Number(minWall.toFixed(3)),maxHoleD:Number(maxHoleD.toFixed(3)),minOuterD:Number(minOuterD.toFixed(3)),gripClear:Number.isFinite(gripClear)?Number(gripClear.toFixed(3)):null};}
function inferStock(result,cfg){const segs=result&&result.segments||[],cut=segs.filter(s=>s.cutting),basis=cut.length?cut:segs,pts=basis.flatMap(s=>s.points||[s.to]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));if(!pts.length)return{stockD:cfg.stockD,length:cfg.length,grip:cfg.grip};const radial=pts.filter((p,i)=>!['drill','centerdrill','tap','boring'].includes((basis[i]&&basis[i].operation)||'')),maxX=Math.max(...(radial.length?radial:pts).map(p=>Math.abs(p.x))),minZ=Math.min(...pts.map(p=>p.z)),calculatedD=Math.min(500,Math.max(5,Math.ceil((maxX+4)/5)*5)),innerOnly=!segs.some(s=>s.cutting&&!['drill','centerdrill','tap','boring'].includes(s.operation)),stockD=innerOnly?Math.max(cfg.stockD,calculatedD):calculatedD,grip=Math.max(10,Math.min(120,Number(cfg.grip)||25)),length=Math.min(1200,Math.max(10,Math.ceil((Math.abs(Math.min(0,minZ))+grip+10)/10)*10));return{stockD,length,grip:Math.min(grip,Math.max(10,length*.25))};}
function buildPlayback(cfg,result){const m=buildModel(cfg);m.nc=result;m.segment=0;m.progress=0;m.direction=1;m.totalPasses=Math.max(1,result&&result.segments?result.segments.length:1);m.material=blankStock(cfg);return m;}

const DEMO_GCODE=`%
O0099 (ПРОВЕРКА СТУПЕНЧАТОГО ВАЛА)
G21 G18 G40 G80 G99
T0101 (PCLNR + CNMG)
G50 S2500
G97 S800 M03
G00 X64. Z3.
G01 X45. Z0. F0.22
Z-42.
X54.
Z-95.
G00 X70.
Z5.
M05
M30
%`;

function simulatorView(){
 const c=load(),p=profile(),pressed=k=>viewState[k]?'true':'false';
 return `<div class="wrap lsim-wrap"><div class="card" data-lsim-back style="display:flex;align-items:center;gap:10px;padding:11px 13px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg><span style="font-family:Oswald;letter-spacing:.08em;text-transform:uppercase;font-size:12px">К рабочим инструментам</span></div>
 <div class="experimental-warning"><b>ЭКСПЕРИМЕНТАЛЬНЫЙ 2D-РЕЖИМ</b><span>Контур и столкновения могут быть показаны неточно для неподдерживаемых циклов, макросов и фактической оснастки. Проверьте итоговый профиль и каждый T; перед станком обязательны GRAPHICS и SINGLE BLOCK.</span></div>
 <div class="card lsim-gcode-card"><div class="lsim-controls-title"><b>1. Откройте готовую программу</b><span>ЭМУЛЯТОР CNC · HAAS / FANUC</span></div><p class="lsim-help">Графика строится из кадров X/Z. <b>G0 не снимает металл</b>; циклы раскрываются в рабочие и возвратные ходы, а каждая станция T получает свою геометрию.</p><textarea id="lsimGcode" spellcheck="false" autocomplete="off" placeholder="O0100&#10;G21 G18 G40 G99&#10;G50 S2500&#10;G97 S800 M03&#10;T0101&#10;G00 X64. Z3.&#10;..."></textarea><input id="lsimGFile" type="file" accept=".nc,.txt,.tap,.cnc,.mpf,text/plain" hidden><div class="lsim-g-actions"><button class="btn ghost" id="lsimGFileBtn">Открыть NC</button><button class="btn ghost" id="lsimGDemo">Учебный пример</button><button class="btn ghost" id="lsimSampleTurn">Пример точения</button><button class="btn" id="lsimGAnalyze">Проверить и показать</button></div><div id="lsimGReport" class="lsim-g-report" aria-live="polite"><span>После проверки программа, траектория и активный кадр будут синхронизированы.</span></div></div>
 <div id="lsimToolSetup" class="card lsim-tool-setup" hidden></div>
 <div class="lsim-dialect" role="group" aria-label="Диалект стойки"><span>СТОЙКА</span><button data-lsim-dialect="haas" aria-pressed="${c.dialect!=='fanuc'}">HAAS</button><button data-lsim-dialect="fanuc" aria-pressed="${c.dialect==='fanuc'}">FANUC</button><small id="lsimDialectHint">${c.dialect==='fanuc'?'P/Q циклов — в микронах, повтор K, G71 двумя кадрами':'P/Q как задано, глубина D и I/K в мм, повтор L'}</small></div>
 <div class="lsim-sim-toolbar" aria-label="Отображение эмулятора"><div class="lsim-zoom"><button id="lsimZoomOut" title="Уменьшить">−</button><button id="lsimZoomFit" title="Показать всё">FIT</button><button id="lsimZoomIn" title="Увеличить">+</button><button id="lsimFull" title="Во весь экран" aria-pressed="false">⛶</button><button data-lsim-view="flat" aria-pressed="${pressed('flat')}" title="Плоский разрез с осевой линией">2D</button></div><div class="lsim-view-buttons"><button data-lsim-view="showRapid" aria-pressed="${pressed('showRapid')}">G0</button><button data-lsim-view="showDots" aria-pressed="${pressed('showDots')}">ТОЧКИ</button><button data-lsim-view="showArcs" aria-pressed="${pressed('showArcs')}">ДУГИ</button><button data-lsim-view="showStock" aria-pressed="${pressed('showStock')}">ЗАГОТОВКА</button><button data-lsim-view="showTool" aria-pressed="${pressed('showTool')}">РЕЗЕЦ</button><button data-lsim-view="showPath" aria-pressed="${pressed('showPath')}">ПУТЬ</button><button data-lsim-view="showCycles" aria-pressed="${pressed('showCycles')}">ЦИКЛЫ</button><button data-lsim-view="showGrid" aria-pressed="${pressed('showGrid')}">СЕТКА</button></div></div>
 <div class="lsim-stage"><canvas id="lsimCanvas" width="960" height="460" role="img" aria-label="Эмулятор CNC: плоский разрез токарной программы: патрон, заготовка, снятие материала и активный инструмент">Ваш браузер не поддерживает Canvas.</canvas><div class="lsim-hud"><span>КАДР <b id="lsimPass">0 / 0</b></span><span>ПОЗИЦИЯ <b id="lsimPos">X— Z—</b></span><span>ШПИНДЕЛЬ <b id="lsimRpm">S${c.rpm}</b></span><span>ИНСТРУМЕНТ <b id="lsimActiveTool">T—</b></span></div><div class="lsim-axis"><span>−Z · ПАТРОН / ЗАЖИМ</span><span>Z0 · ТОРЕЦ</span></div>
  <div class="lsim-fsbar" aria-label="Управление в полном экране"><button type="button" data-fs="reset" title="В начало">|◀</button><button type="button" data-fs="back" title="Кадр назад">◀|</button><button type="button" data-fs="play" title="Пуск / пауза">▶</button><button type="button" data-fs="step" title="Кадр вперёд">|▶</button><button type="button" data-fs="fit" title="Показать всё">FIT</button><button type="button" data-fs="exit" title="Выйти из полного экрана">✕</button></div></div>
 <div class="lsim-hint-gest">Тяните деталь пальцем · щипок или колесо — масштаб · двойное нажатие — сброс · ⛶ во весь экран</div>
 <div class="lsim-pass-track" aria-hidden="true"><i id="lsimTrack" style="width:0"></i></div><div class="lsim-legend"><span><i></i>текущая поверхность</span><span class="rapid"><i></i>G0 быстрый</span><span class="line"><i></i>G1 линия</span><span class="cw"><i></i>G2</span><span class="ccw"><i></i>G3</span><span class="insert"><i></i>пластина / напайка</span></div>
 <div class="lsim-transport"><div class="lsim-actions transport"><button class="btn ghost" id="lsimReset" title="В начало">|◀</button><button class="btn ghost" id="lsimReverse" title="Назад непрерывно">◀</button><button class="btn ghost" id="lsimBack" title="Предыдущий кадр">◀|</button><button class="btn ghost" id="lsimStep" title="Следующий кадр">|▶</button><button class="btn" id="lsimStart" title="Пуск / пауза" aria-pressed="false">▶</button><button class="btn ghost" id="lsimEnd" title="В конец">▶|</button></div><label class="lsim-speed"><span>Скорость</span><input id="lsimSpeed" data-lsim-field type="range" min="1" max="8" step="1" value="${c.speed}"><b id="lsimSpeedValue">×${c.speed}</b></label><div id="lsimStatus" class="lsim-status" aria-live="polite"></div></div>
 <div class="lsim-code-sync"><div class="lsim-active-block"><span>АКТИВНЫЙ КАДР</span><b id="lsimActiveBlock">— программа не загружена —</b></div><div id="lsimCodeWindow" class="lsim-code-window"></div></div>
 <div class="card" style="margin-top:11px"><div class="lsim-controls-title"><b>2. Заготовка и операция</b><span>${h(p.name)} · MAX S${n(p.maxRpm)||'—'}</span></div><div class="lsim-form-grid">
  <label class="fld"><span>Операция</span><select id="lsimOperation" data-lsim-field><option value="external" ${c.operation==='external'?'selected':''}>Наружная проточка / торцевание</option><option value="boring" ${c.operation==='boring'?'selected':''}>Расточка отверстия</option><option value="groove" ${c.operation==='groove'?'selected':''}>Наружная канавка</option></select></label>
  <label class="fld" data-lsim-show="external"><span>Контур без NC (учебный)</span><select id="lsimContour" data-lsim-field><option value="straight" ${c.contour==='straight'?'selected':''}>Прямой цилиндр</option><option value="step" ${c.contour==='step'?'selected':''}>Ступенчатый вал</option><option value="chamfer" ${c.contour==='chamfer'?'selected':''}>Цилиндр с фаской 2×45°</option></select></label>
  <label class="fld"><span>Тип заготовки</span><select id="lsimStock" data-lsim-field><option value="solid" ${c.stock==='solid'?'selected':''}>Круглый пруток</option><option value="tube" ${c.stock==='tube'?'selected':''}>Труба / отверстие</option><option value="forging" ${c.stock==='forging'?'selected':''}>Поковка</option></select></label>
  <label class="fld"><span>Патрон</span><select id="lsimChuck" data-lsim-field><option value="3jaw" ${c.chuck==='3jaw'?'selected':''}>3-кулачковый</option><option value="4jaw" ${c.chuck==='4jaw'?'selected':''}>4-кулачковый</option><option value="collet" ${c.chuck==='collet'?'selected':''}>Цанга</option></select></label>
  <label class="fld"><span>Ø заготовки, мм</span><input id="lsimStockD" data-lsim-field type="number" min="5" max="500" step="0.1" value="${c.stockD}"></label><label class="fld"><span>Длина, мм</span><input id="lsimLength" data-lsim-field type="number" min="10" max="1200" step="1" value="${c.length}"></label>
  <label class="fld"><span>Исходный Ø отверстия, мм</span><input id="lsimBoreD" data-lsim-field type="number" min="0" step="0.1" value="${c.boreD}"></label><label class="fld"><span id="lsimTargetLabel">Целевой Ø, мм</span><input id="lsimTargetD" data-lsim-field type="number" min="1" step="0.1" value="${c.targetD}"></label>
  <label class="fld" data-lsim-show="step"><span>Второй Ø ступени, мм</span><input id="lsimStepD" data-lsim-field type="number" min="1" step="0.1" value="${c.stepD}"></label><label class="fld" data-lsim-show="step,groove"><span id="lsimStepLabel">Длина ступени, мм</span><input id="lsimStepLen" data-lsim-field type="number" min="1" step="1" value="${c.stepLen}"></label>
  <label class="fld"><span>Длина зажима, мм</span><input id="lsimGrip" data-lsim-field type="number" min="1" step="1" value="${c.grip}"></label>
 </div><button class="btn ghost" id="lsimAutoStock">Подогнать заготовку по NC</button></div>
 <div class="card"><div class="lsim-controls-title"><b>3. Инструмент без номера T</b><span>Резерв / учебная модель</span></div><div class="lsim-form-grid">
  <label class="fld"><span>Резец / осевой инструмент</span><select id="lsimTool" data-lsim-field>${toolOptions(c.tool)}</select></label>
  <label class="fld"><span>Радиус вершины, мм</span><select id="lsimNose" data-lsim-field><option value="0.4" ${c.nose==.4?'selected':''}>0,4</option><option value="0.8" ${c.nose==.8?'selected':''}>0,8</option><option value="1.2" ${c.nose==1.2?'selected':''}>1,2</option></select></label>
  <label class="fld"><span>Глубина ap, мм/сторону</span><input id="lsimDepth" data-lsim-field type="number" min="0.05" max="10" step="0.05" value="${c.depth}"></label><label class="fld"><span>Подача F, мм/об</span><input id="lsimFeed" data-lsim-field type="number" min="0.01" max="2" step="0.01" value="${c.feed}"></label>
  <label class="fld"><span>Обороты S, об/мин</span><input id="lsimRpmInput" data-lsim-field type="number" min="1" step="10" value="${c.rpm}"></label>
 </div><div class="lsim-checks"><label><input type="checkbox" id="lsimCoolant" data-lsim-field ${c.coolant?'checked':''}>Показывать СОЖ</label><label><input type="checkbox" id="lsimChips" data-lsim-field ${c.chips?'checked':''}>Показывать стружку</label><label><input type="checkbox" id="lsimDiameterArc" data-lsim-field ${c.arcCenterDiameter?'checked':''}>I в диаметральном режиме</label><label><input type="checkbox" id="lsimShowCycles" data-lsim-field ${c.showCycles?'checked':''}>Раскрывать циклы</label></div><button class="btn ghost" id="lsimBuild">Перестроить модель</button></div>
 <div class="lsim-disclaimer"><b>Эмулятор CNC — проверка формы и типовых опасностей, а не разрешение на Cycle Start.</b> Модель не знает фактические кулачки, вылет державки, корректор, заднюю бабку и машинный ноль. Обязательны Haas GRAPHICS, SINGLE BLOCK, низкий Rapid Override, проверка нулей и пробный проход над деталью.</div>${CREDIT}</div>`;
}

function showSimulator(){
 $('#ttl').textContent='Эмулятор CNC';$('#sub').textContent='Каждый T, циклы, сверление, снятие металла и опасные ходы';
 $('#searchbox').style.display='none';$('#chips').style.display='none';$('#mseg').style.display='none';drawNav();
 gcodeResult=null;$('#screen').innerHTML=simulatorView();if(root){root.dataset.app='chpu';root.dataset.section='control';}
 bind();numFix();$('#screen').scrollTop=0;applyForm(false);consumeHandoff();
}

function consumeHandoff(){
 const item=window.RazryadBackplot&&window.RazryadBackplot.take?window.RazryadBackplot.take():null;
 if(!item||!item.code||!$('#lsimGcode'))return false;
 $('#lsimGcode').value=item.code;analyzePastedGcode(false);
 const report=$('#lsimGReport');if(report)report.insertAdjacentHTML('afterbegin',`<div class="lsim-import-source"><b>${h(item.title||'NC-программа')}</b><span>Передано из ${h(item.source||'приложения')}</span></div>`);
 toast('Код передан в эмулятор CNC');return true;
}

function openWithCode(code,meta){
 const item={code:String(code||'').trim(),title:meta&&meta.title||'NC-программа',source:meta&&meta.source||'РАЗРЯД',created:Date.now()};
 if(!item.code)return false;
 if(window.RazryadBackplot&&window.RazryadBackplot.store)window.RazryadBackplot.store(item);
 tab='work';folder='simx';geoCase=null;rank=null;filter='Все';deeper();try{history.replaceState({...history.state,razryadBackplotRoute:true},'',location.href);}catch(_){}render();return true;
}

function readForm(){
 const val=id=>{const e=$(id);return e?e.value:''};
 return{dialect:load().dialect||'haas',operation:val('#lsimOperation'),stock:val('#lsimStock'),contour:val('#lsimContour'),stockD:n(val('#lsimStockD')),length:n(val('#lsimLength')),boreD:n(val('#lsimBoreD')),targetD:n(val('#lsimTargetD')),stepD:n(val('#lsimStepD')),stepLen:n(val('#lsimStepLen')),chuck:val('#lsimChuck'),grip:n(val('#lsimGrip')),tool:val('#lsimTool'),nose:n(val('#lsimNose')),depth:n(val('#lsimDepth')),feed:n(val('#lsimFeed')),rpm:n(val('#lsimRpmInput')),speed:n(val('#lsimSpeed'))||1,coolant:!!($('#lsimCoolant')&&$('#lsimCoolant').checked),chips:!!($('#lsimChips')&&$('#lsimChips').checked),arcCenterDiameter:!!($('#lsimDiameterArc')&&$('#lsimDiameterArc').checked),showCycles:!!($('#lsimShowCycles')&&$('#lsimShowCycles').checked),toolConfigs:collectToolConfigs()};
}

function updateVisibility(){
 const op=$('#lsimOperation')?$('#lsimOperation').value:'external',contour=$('#lsimContour')?$('#lsimContour').value:'straight';
 document.querySelectorAll('[data-lsim-show]').forEach(x=>{const keys=x.dataset.lsimShow.split(',');x.style.display=(keys.includes(op)||keys.includes(contour))?'':'none';});
 const target=$('#lsimTargetLabel');if(target)target.textContent=op==='boring'?'Целевой Ø расточки, мм':op==='groove'?'Ø дна канавки, мм':'Целевой Ø, мм';
 const step=$('#lsimStepLabel');if(step)step.textContent=op==='groove'?'Ширина канавки, мм':'Длина ступени, мм';
}

function setStatus(check,plain){
 const box=$('#lsimStatus');if(!box)return;
 if(plain){box.className='lsim-status '+(plain.type||'good');box.textContent=plain.text;return;}
 if(check.errors.length){box.className='lsim-status bad';box.innerHTML='<b>Исправьте ввод:</b> '+check.errors.map(h).join(' ');}
 else if(check.warnings.length){box.className='lsim-status warn';box.innerHTML='<b>Модель собрана.</b> '+check.warnings.map(h).join(' ');}
 else{box.className='lsim-status good';box.textContent='Модель собрана. Значения подходят для наглядного просмотра.';}
}

function operationName(op){return({external:'Наружная / торец',boring:'Расточка',groove:'Канавка',thread:'Резьба',drill:'Сверление',centerdrill:'Центрование',tap:'Метчик'})[op]||op;}
function optionList(items,selected){return items.map(([v,label])=>`<option value="${v}" ${v===selected?'selected':''}>${label}</option>`).join('');}
/* выпадающий список инструмента, разбитый по группам, как в каталоге инструмента */
function toolOptions(selected){return TOOL_GROUPS.map(([g,label])=>{const list=Object.entries(TOOL_LIBRARY).filter(([,v])=>v.group===g);if(!list.length)return'';return`<optgroup label="${h(label)}">${list.map(([key,v])=>`<option value="${key}" ${key===selected?'selected':''}>${h(v.name)}</option>`).join('')}</optgroup>`;}).join('');}
function collectToolConfigs(){const out={};document.querySelectorAll('.lsim-tool-card[data-station]').forEach(card=>{const get=name=>card.querySelector(`[data-tool-field="${name}"]`),station=Number(card.dataset.station),num=name=>n(get(name)&&get(name).value);out[station]={station,code:card.dataset.code||'',operation:get('operation')&&get('operation').value||'external',kind:get('kind')&&get('kind').value||'cnmg',diameter:num('diameter'),workingLength:num('workingLength'),bodyD:num('bodyD'),minBore:num('minBore'),nose:num('nose'),pointAngle:num('pointAngle'),insertWidth:num('insertWidth'),confirmed:!!(get('confirmed')&&get('confirmed').checked)};});return out;}
function renderToolSetup(result){const box=$('#lsimToolSetup');if(!box)return;const tools=result&&result.tools||[];if(!tools.length){box.hidden=true;box.innerHTML='';return;}const existing=collectToolConfigs(),opItems=[['external','Наружная / торец'],['boring','Расточка'],['groove','Канавка'],['thread','Резьба'],['drill','Сверление'],['centerdrill','Центрование'],['tap','Метчик']];
 box.hidden=false;box.innerHTML=`<div class="lsim-controls-title"><b>2. Инструменты из программы</b><span>${tools.length} ${tools.length===1?'СТАНЦИЯ':'СТАНЦИИ'}</span></div><p class="lsim-help">Проверьте назначение каждого T. Диаметр, рабочая длина и корпус участвуют и в рисунке, и в проверке столкновений.</p><div class="lsim-tool-list">${tools.map((raw,index)=>{const t={...raw,...(existing[raw.station]||{})},code=t.code||String(t.station).padStart(2,'0')+'01';return`<section class="lsim-tool-card ${t.confirmed?'confirmed':''} ${index?'collapsed':''}" data-station="${t.station}" data-code="${h(code)}"><button type="button" class="lsim-tool-head"><span class="lsim-tool-badge">T${String(t.station).padStart(2,'0')}</span><b>${h(operationName(t.operation))}</b><small>${h(code)} · ${t.confirmed?'ПОДТВЕРЖДЁН':'ПРОВЕРИТЬ'}</small><i>⌄</i></button><div class="lsim-tool-fields">
 <label class="fld"><span>Операция T${String(t.station).padStart(2,'0')}</span><select data-tool-field="operation">${optionList(opItems,t.operation)}</select></label><label class="fld"><span>Инструмент</span><select data-tool-field="kind">${toolOptions(t.kind)}</select></label>
 <label class="fld"><span>Ø режущей части, мм</span><input data-tool-field="diameter" type="number" min="0" step="0.1" value="${n(t.diameter)}"></label><label class="fld"><span>Рабочая длина / вылет, мм</span><input data-tool-field="workingLength" type="number" min="1" step="1" value="${n(t.workingLength)}"></label>
 <label class="fld"><span>Ø корпуса / державки, мм</span><input data-tool-field="bodyD" type="number" min="1" step="0.1" value="${n(t.bodyD)}"></label><label class="fld"><span>Минимальный Ø отверстия, мм</span><input data-tool-field="minBore" type="number" min="0" step="0.1" value="${n(t.minBore)}"></label>
 <label class="fld"><span>Радиус вершины, мм</span><input data-tool-field="nose" type="number" min="0" step="0.1" value="${n(t.nose)}"></label><label class="fld"><span>Угол сверла / профиля, °</span><input data-tool-field="pointAngle" type="number" min="0" max="175" step="1" value="${n(t.pointAngle)}"></label>
 <label class="fld"><span>Ширина пластины канавки, мм</span><input data-tool-field="insertWidth" type="number" min="0.2" step="0.1" value="${n(t.insertWidth)||3}"></label><label class="lsim-tool-confirm"><input data-tool-field="confirmed" type="checkbox" ${t.confirmed?'checked':''}><span>Назначение и габариты проверены оператором</span></label>
 <canvas class="lsim-tool-preview" data-tool-preview width="210" height="84" aria-label="Схема выбранного инструмента"></canvas>
 </div></section>`;}).join('')}</div>`;bindToolCards();document.querySelectorAll('.lsim-tool-card').forEach(refreshToolPreview);}
function bindToolCards(){document.querySelectorAll('.lsim-tool-card').forEach(card=>{const head=card.querySelector('.lsim-tool-head');if(head)head.onclick=()=>{card.classList.toggle('collapsed');if(!card.classList.contains('collapsed'))requestAnimationFrame(()=>refreshToolPreview(card));};card.querySelectorAll('[data-tool-field]').forEach(field=>field.onchange=()=>{const all=collectToolConfigs(),spec=all[Number(card.dataset.station)],kind=TOOL_LIBRARY[spec.kind]||TOOL_LIBRARY.cnmg;if(field.dataset.toolField==='kind'){const op=card.querySelector('[data-tool-field="operation"]');if(op)op.value=kind.operation;const set=(name,value)=>{const e=card.querySelector(`[data-tool-field="${name}"]`);if(e)e.value=value;};set('diameter',kind.diameter);set('workingLength',kind.workingLength);set('bodyD',kind.bodyD);set('minBore',kind.minBore);set('nose',kind.nose);set('pointAngle',kind.pointAngle);set('insertWidth',kind.insertWidth||3);}const confirmed=card.querySelector('[data-tool-field="confirmed"]')?.checked;card.classList.toggle('confirmed',!!confirmed);const small=card.querySelector('.lsim-tool-head small');if(small)small.textContent=`${card.dataset.code} · ${confirmed?'ПОДТВЕРЖДЁН':'ПРОВЕРИТЬ'}`;const title=card.querySelector('.lsim-tool-head b'),op=card.querySelector('[data-tool-field="operation"]');if(title&&op)title.textContent=operationName(op.value);refreshToolPreview(card);saveToolStore(collectToolConfigs());applyForm(false);});});}

function renderGReport(result){
 const box=$('#lsimGReport');if(!box)return;
 if(!result){box.className='lsim-g-report';box.innerHTML='<span>Вставьте G-код и нажмите «Проверить и показать».</span>';return;}
 const s=result.stats,head=s.bad?`ПРОВЕРКА ЗАБЛОКИРОВАНА · ошибок: ${s.bad}`:s.warn?`НАГЛЯДНО, НО ПРОВЕРЬТЕ · замечаний: ${s.warn}`:'ТОЧНО РАСКРЫТО В ПОДДЕРЖИВАЕМОМ 2D-РЕЖИМЕ';
 const state=s.bad?'bad':s.warn?'warn':'good',baseItems=result.issues.length?result.issues.map(i=>`<li class="${i.type}" ${i.line?`data-lsim-jump="${i.line}"`:''}><b>${i.type==='bad'?'ОШИБКА':'ПРОВЕРИТЬ'}</b>${i.line?` · строка ${i.line}`:''}<span>${h(i.text)}</span></li>`).join(''):'<li class="good"><b>БАЗОВАЯ ПРОВЕРКА ПРОЙДЕНА</b><span>Перемещения разобраны. Сверьте контур, ноль детали и корректор инструмента.</span></li>',g=result.geometry,geometryItem=g?`<li class="good"><b>ИТОГОВАЯ 2D-ГЕОМЕТРИЯ</b><span>Минимальный наружный Ø ${g.minOuterD.toFixed(2)} мм · максимальное отверстие Ø ${g.maxHoleD.toFixed(2)} мм · минимальная стенка ${g.minWall.toFixed(2)} мм${g.gripClear==null?'':` · запас до зоны зажима по Z ${g.gripClear.toFixed(2)} мм`}</span></li>`:'',items=baseItems+geometryItem;
 box.className=`lsim-g-report ${state}`;box.innerHTML=`<div class="lsim-g-summary"><b>${head}</b><span>${h(result.dialect||"Haas")} · ${s.blocks} кадров · ${s.moves} ходов · ${s.cuts} режущих</span></div><ul>${items}</ul>`;
 box.querySelectorAll('[data-lsim-jump]').forEach(x=>x.onclick=()=>jumpToLine(Number(x.dataset.lsimJump)));
}

function activeSegment(){return simState&&simState.nc&&simState.nc.segments[simState.segment]||null;}
function syncCode(){
 const active=activeSegment(),block=$('#lsimActiveBlock'),win=$('#lsimCodeWindow');if(block)block.textContent=active?`${String(active.line).padStart(4,'0')}  ${active.clean}`:'— программа не загружена —';document.querySelectorAll('.lsim-tool-card').forEach(card=>card.classList.toggle('active',!!active&&Number(card.dataset.station)===Number(active.toolStation)));if(!win)return;
 if(!gcodeResult||!gcodeResult.lines){win.innerHTML='';return;}const line=active?active.line:1,start=Math.max(1,line-3),end=Math.min(gcodeResult.lines.length,line+3),badLines=new Set(gcodeResult.issues.filter(x=>x.type==='bad').map(x=>x.line));let html='';
 for(let i=start;i<=end;i++)html+=`<button data-lsim-line="${i}" class="${i===line?'current ':''}${badLines.has(i)?'bad':''}"><i>${String(i).padStart(4,'0')}</i><code>${h(gcodeResult.lines[i-1]||'')}</code></button>`;win.innerHTML=html;win.querySelectorAll('button').forEach(x=>x.onclick=()=>jumpToLine(Number(x.dataset.lsimLine)));
}
function jumpToLine(line){if(!simState||!simState.nc)return;const idx=simState.nc.segments.findIndex(s=>s.line>=line);simState.segment=idx<0?Math.max(0,simState.nc.segments.length-1):idx;simState.progress=0;simState.complete=false;haltRun();refreshMaterial();updateHud();paint();}
function refreshMaterial(){if(simState&&simState.nc)simState.material=stockProfile(simState.nc,simState.cfg,simState.segment,simState.progress);}

function analyzePastedGcode(announce){
 const area=$('#lsimGcode'),code=area?area.value.trim():'';if(!code){gcodeResult=null;renderGReport(null);if(announce)toast('Вставьте или откройте G-код');return false;}
 let cfg=readForm(),check=validate(cfg);if(check.errors.length){setStatus(check);return false;}
 const discovered=parseGcode(code,cfg);renderToolSetup(discovered);cfg=readForm();gcodeResult=parseGcode(code,cfg);renderGReport(gcodeResult);simState=buildPlayback(cfg,gcodeResult);refreshMaterial();updateHud();paint();
 if(announce)toast(gcodeResult.stats.bad?`Найдено ошибок: ${gcodeResult.stats.bad}`:'Траектория построена');return true;
}

function applyForm(announce){
 if(!$('#lsimCanvas'))return false;updateVisibility();const cfg=readForm(),check=validate(cfg);setStatus(check);if(check.errors.length)return false;
 save(cfg);lastTick=0;if(gcodeResult&&$('#lsimGcode')&&$('#lsimGcode').value.trim()){gcodeResult=parseGcode($('#lsimGcode').value,cfg);renderGReport(gcodeResult);simState=buildPlayback(cfg,gcodeResult);refreshMaterial();}else simState=buildModel(cfg);updateHud();paint();
 if(announce)toast(gcodeResult?`Эмулятор CNC: ${gcodeResult.stats.moves} перемещений`:`Учебная модель: ${simState.totalPasses} проходов`);return true;
}

function bindSimulator(){
 if(!$('#lsimCanvas'))return;
 const back=document.querySelector('[data-lsim-back]');if(back)back.onclick=()=>{if(history.state&&history.state.razryadDepth)history.back();else{try{history.replaceState({...history.state,razryadBackplotRoute:false},'',location.pathname);}catch(_){}folder=null;render();}};
 document.querySelectorAll('#nav [data-tab]').forEach(item=>item.onclick=()=>{tab=item.dataset.tab;folder=null;geoCase=null;rank=null;filter='Все';const q=$('#q');if(q)q.value='';try{history.replaceState({...history.state,razryadBackplotRoute:false},'',location.pathname);}catch(_){}deeper();render();});
 document.querySelectorAll('[data-lsim-field]').forEach(x=>x.onchange=()=>{if(x.id==='lsimSpeed'){const v=$('#lsimSpeedValue');if(v)v.textContent=`×${x.value}`;if(simState)simState.cfg.speed=n(x.value)||1;return;}updateVisibility();applyForm(false);});
 $('#lsimBuild').onclick=()=>applyForm(true);
 $('#lsimGFileBtn').onclick=()=>$('#lsimGFile').click();
 $('#lsimGFile').onchange=e=>{const file=e.target.files&&e.target.files[0];if(!file)return;file.text().then(code=>{$('#lsimGcode').value=code;analyzePastedGcode(true);}).catch(()=>{renderGReport({stats:{bad:1,warn:0,blocks:0,moves:0},issues:[{type:'bad',text:'Не удалось прочитать файл. Сохраните программу как обычный текст.',line:0}]});});};
 $('#lsimGDemo').onclick=()=>{$('#lsimOperation').value='external';$('#lsimTool').value='cnmg';$('#lsimStockD').value=60;$('#lsimLength').value=120;$('#lsimGrip').value=25;$('#lsimTargetD').value=45;$('#lsimStepD').value=54;$('#lsimStepLen').value=42;updateVisibility();$('#lsimGcode').value=DEMO_GCODE;analyzePastedGcode(true);};
 $('#lsimSampleTurn').onclick=()=>{fetch('./samples/turning-demo.nc').then(r=>{if(!r.ok)throw Error();return r.text();}).then(code=>{$('#lsimOperation').value='external';$('#lsimTool').value='cnmg';updateVisibility();$('#lsimGcode').value=code;analyzePastedGcode(false);fitStockToNc(true);toast('Загружен учебный пример точения');}).catch(()=>toast('Учебный пример не найден в папке samples'));};
 $('#lsimGAnalyze').onclick=()=>analyzePastedGcode(true);
 $('#lsimAutoStock').onclick=()=>fitStockToNc(true);
 document.querySelectorAll('[data-lsim-view]').forEach(x=>x.onclick=()=>{const key=x.dataset.lsimView;
  if(key==='showCycles'){const box=$('#lsimShowCycles');if(box){box.checked=!box.checked;x.setAttribute('aria-pressed',String(box.checked));viewState.showCycles=box.checked;saveView();applyForm(false);return;}}
  viewState[key]=!viewState[key];x.setAttribute('aria-pressed',String(viewState[key]));saveView();paint();});
 document.querySelectorAll('[data-lsim-dialect]').forEach(x=>x.onclick=()=>{const value=x.dataset.lsimDialect;const cur=load();if(cur.dialect===value)return;save({...cur,dialect:value});
  document.querySelectorAll('[data-lsim-dialect]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lsimDialect===value)));
  const hint=$('#lsimDialectHint');if(hint)hint.textContent=value==='fanuc'?'P/Q циклов — в микронах, повтор K, G71 двумя кадрами':'P/Q как задано, глубина D и I/K в мм, повтор L';
  if($('#lsimGcode')&&$('#lsimGcode').value.trim())analyzePastedGcode(false);else applyForm(false);
  toast(value==='fanuc'?'Разбор по правилам Fanuc':'Разбор по правилам Haas');});
 $('#lsimZoomOut').onclick=()=>changeZoom(.82);$('#lsimZoomFit').onclick=()=>changeZoom(1,true);$('#lsimZoomIn').onclick=()=>changeZoom(1.22);
 const fs=$('#lsimFull');if(fs)fs.onclick=()=>toggleFullscreen();
 document.querySelectorAll('[data-fs]').forEach(b=>b.onclick=()=>{const a=b.dataset.fs;
  if(a==='exit')return toggleFullscreen(false);
  if(a==='fit')return changeZoom(1,true);
  if(a==='reset')return seekBlock(0,0);
  if(a==='back')return stepBlock(-1);
  if(a==='step')return stepBlock(1);
  if(a==='play'){const s=$('#lsimStart');if(s)s.click();b.textContent=simState&&simState.running?'Ⅱ':'▶';}});
 bindCanvasGestures();
 $('#lsimStart').onclick=()=>{if(simState&&simState.running){haltRun();setStatus(null,{type:'warn',text:'Пауза. Нажмите ▶ ещё раз, чтобы продолжить.'});updateHud();return;}if(!simState&&!applyForm(false))return;if(simState.complete&&simState.nc){simState.segment=0;simState.progress=0;simState.complete=false;}simState.direction=1;simState.running=true;setPlayButton(true);lastTick=Date.now();setStatus(null,{type:'good',text:'Эмулятор запущен вперёд. Повторное нажатие Ⅱ остановит движение.'});runSimulation();};
 $('#lsimReverse').onclick=()=>{if(!simState||!simState.nc)return toast('Сначала загрузите NC');if(simState.running&&simState.direction<0){haltRun();return;}simState.direction=-1;simState.complete=false;simState.running=true;setPlayButton(true);lastTick=Date.now();runSimulation();};
 $('#lsimStep').onclick=()=>stepBlock(1);$('#lsimBack').onclick=()=>stepBlock(-1);
 $('#lsimReset').onclick=()=>seekBlock(0,0);$('#lsimEnd').onclick=()=>seekBlock(simState&&simState.nc?simState.nc.segments.length:0,1);
 updateVisibility();
 if(window.ResizeObserver){if(resizeWatch)resizeWatch.disconnect();resizeWatch=new ResizeObserver(()=>{if(simState&&$('#lsimCanvas'))paint();});resizeWatch.observe($('#lsimCanvas'));}
}

function changeZoom(mult,fit){
 if(fit){viewState.zoom=1;viewState.panX=0;viewState.panY=0;}
 else viewState.zoom=Math.max(.4,Math.min(14,(viewState.zoom||1)*mult));
 saveView();paint();}

/* зум с привязкой к точке под пальцем или курсором: деталь не убегает из-под руки */
function zoomAt(sx,sy,mult){
 const cv=$('#lsimCanvas');if(!cv||!simState)return changeZoom(mult);
 const r=cv.getBoundingClientRect(),W=r.width,H=r.height;
 const before=flatGeom(W,H,simState,viewState.zoom||1,viewState.panX||0,viewState.panY||0);
 const wz=before.invZ(sx),wx=before.invX(sy);
 viewState.zoom=Math.max(.4,Math.min(14,(viewState.zoom||1)*mult));
 const after=flatGeom(W,H,simState,viewState.zoom,0,0);
 viewState.panX=sx-after.MX(wz);viewState.panY=sy-after.MY(wx);
 saveView();paint();
}

/* перетаскивание детали, щипок двумя пальцами, колесо мыши, двойное нажатие — сброс */
function bindCanvasGestures(){
 const cv=$('#lsimCanvas');if(!cv||cv.dataset.gest)return;cv.dataset.gest='1';
 const pts=new Map();let drag=null,pinch=null,lastTap=0;
 const local=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
 cv.addEventListener('pointerdown',e=>{
  if(viewState.flat===false)return;
  cv.setPointerCapture&&cv.setPointerCapture(e.pointerId);
  pts.set(e.pointerId,local(e));
  if(pts.size===1){const p=pts.get(e.pointerId);drag={sx:p.x,sy:p.y,px:viewState.panX||0,py:viewState.panY||0,moved:false};}
  else if(pts.size===2){drag=null;const [a,b]=[...pts.values()];
   pinch={d:Math.hypot(b.x-a.x,b.y-a.y)||1,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,zoom:viewState.zoom||1,
    px:viewState.panX||0,py:viewState.panY||0};}
 });
 cv.addEventListener('pointermove',e=>{
  if(!pts.has(e.pointerId))return;
  pts.set(e.pointerId,local(e));
  if(pinch&&pts.size>=2){
   const [a,b]=[...pts.values()],d=Math.hypot(b.x-a.x,b.y-a.y)||1;
   const mult=d/pinch.d;
   viewState.zoom=pinch.zoom;viewState.panX=pinch.px;viewState.panY=pinch.py;
   zoomAt(pinch.cx,pinch.cy,mult);
   return;
  }
  if(drag){const p=pts.get(e.pointerId),dx=p.x-drag.sx,dy=p.y-drag.sy;
   if(Math.hypot(dx,dy)>3)drag.moved=true;
   if(!drag.moved)return;
   e.preventDefault();
   viewState.panX=drag.px+dx;viewState.panY=drag.py+dy;paint();}
 });
 const release=e=>{
  pts.delete(e.pointerId);
  if(pts.size<2)pinch=null;
  if(pts.size===0){
   if(drag&&drag.moved)saveView();
   else{const now=Date.now();if(now-lastTap<320){changeZoom(1,true);toast('Вид сброшен');}lastTap=now;}
   drag=null;}
 };
 cv.addEventListener('pointerup',release);
 cv.addEventListener('pointercancel',release);
 cv.addEventListener('wheel',e=>{
  if(viewState.flat===false)return;
  e.preventDefault();const p=local(e);zoomAt(p.x,p.y,e.deltaY<0?1.12:1/1.12);
 },{passive:false});
}

/* полный экран: сцена растягивается на всё окно, без выхода со страницы */
function toggleFullscreen(force){
 const stage=document.querySelector('.lsim-stage');if(!stage)return;
 const on=force==null?!stage.classList.contains('full'):!!force;
 stage.classList.toggle('full',on);
 document.body.classList.toggle('lsim-full-open',on);
 const btn=$('#lsimFull');if(btn){btn.setAttribute('aria-pressed',String(on));btn.textContent=on?'✕':'⛶';btn.title=on?'Выйти из полного экрана':'Во весь экран';}
 requestAnimationFrame(()=>{paint();setTimeout(paint,120);});
}
function fitStockToNc(announce){if(!gcodeResult)return announce&&toast('Сначала откройте NC');const fit=inferStock(gcodeResult,readForm());$('#lsimStockD').value=fit.stockD;$('#lsimLength').value=fit.length;$('#lsimGrip').value=Math.round(fit.grip);applyForm(false);if(announce)toast(`Заготовка: Ø${fit.stockD} × ${fit.length} мм`);return true;}
function seekBlock(index,progress){if(!simState)return;if(!simState.nc){simState=buildModel(readForm());simState.complete=index>0;simState.pass=index>0?simState.totalPasses:0;simState.progress=progress||0;}else{simState.segment=Math.max(0,Math.min(simState.nc.segments.length,index));simState.progress=progress||0;simState.complete=simState.segment>=simState.nc.segments.length;}haltRun();refreshMaterial();updateHud();paint();}
function stepBlock(dir){if(!simState&&!applyForm(false))return;haltRun();if(!simState.nc){advance(dir>0?.16:-.16);}else{simState.segment=Math.max(0,Math.min(simState.nc.segments.length,simState.segment+dir));simState.progress=0;simState.complete=simState.segment>=simState.nc.segments.length;refreshMaterial();}simState.spin+=.35*dir;paint();updateHud();}

function advance(delta){
 if(!simState)return;
 if(simState.nc){simState.progress+=delta*(simState.direction||1);while(simState.progress>=1){simState.progress-=1;simState.segment++;if(simState.segment>=simState.nc.segments.length){simState.segment=simState.nc.segments.length;simState.progress=0;simState.complete=true;simState.running=false;setStatus(null,{type:'good',text:'Прогон завершён. Сравните полученный профиль, опасные кадры и фактическую наладку.'});break;}}while(simState.progress<0){simState.segment--;if(simState.segment<0){simState.segment=0;simState.progress=0;simState.running=false;break;}simState.progress+=1;}refreshMaterial();return;}
 if(simState.complete&&delta>0)return;simState.progress=Math.max(0,simState.progress+delta);
 while(simState.progress>=1&&!simState.complete){simState.progress-=1;simState.pass++;if(simState.pass>=simState.totalPasses){simState.pass=simState.totalPasses;simState.progress=1;simState.complete=true;simState.running=false;setStatus(null,{type:'good',text:'Учебные слои сняты. Для проверки реальной программы откройте NC выше.'});}}
}

function setPlayButton(running){const b=$('#lsimStart');if(!b)return;b.textContent=running?'Ⅱ':'▶';b.setAttribute('aria-pressed',String(!!running));b.title=running?'Пауза':'Пуск';}
function runSimulation(){if(simFrame||!simState||!simState.running)return;setPlayButton(true);simFrame=requestAnimationFrame(simTick);}
function haltRun(){if(simFrame){cancelAnimationFrame(simFrame);simFrame=0;}if(simState)simState.running=false;setPlayButton(false);lastTick=0;}
function simTick(){
 simFrame=0;if(!simState||!simState.running||!$('#lsimCanvas'))return;const now=Date.now(),dt=Math.min(70,Math.max(0,now-(lastTick||now)));lastTick=now;
 const active=activeSegment(),rpm=active&&active.rpm||simState.cfg.rpm;simState.spin+=dt*.0035*Math.max(.45,Math.min(2.8,Math.sqrt(Math.max(1,rpm)/800)));advance(dt/(950/Math.max(1,simState.cfg.speed)));paint();updateHud();if(simState.running)simFrame=requestAnimationFrame(simTick);else setPlayButton(false);
}

function updateHud(){
 if(!simState)return;const c=simState.cfg,seg=activeSegment();let pass,z,x,rpm=c.rpm,ratio;
 if(simState.nc){pass=Math.min(simState.nc.segments.length,simState.segment+1);const a=seg?pointOnSegment(seg,simState.progress):(simState.nc.segments.at(-1)||{to:{x:0,z:0}}).to;x=a.x;z=a.z;rpm=seg&&seg.rpm||rpm;ratio=simState.nc.segments.length?(simState.segment+simState.progress)/simState.nc.segments.length:0;}else{pass=simState.complete?simState.totalPasses:Math.min(simState.totalPasses,simState.pass+1);z=simState.complete?0:-c.length+simState.progress*Math.max(0,c.length-c.grip);x=currentOuter(simState,Math.max(0,Math.min(1,(z+c.length)/c.length)))*2;ratio=(simState.pass+simState.progress)/simState.totalPasses;}
 if($('#lsimPass'))$('#lsimPass').textContent=`${pass} / ${simState.totalPasses}`;
 if($('#lsimPos'))$('#lsimPos').textContent=`X${n(x).toFixed(2)} Z${n(z).toFixed(2)}`;
 if($('#lsimRpm'))$('#lsimRpm').textContent=`S${rpm}`;
 if($('#lsimActiveTool'))$('#lsimActiveTool').textContent=seg&&seg.toolStation?`T${String(seg.toolStation).padStart(2,'0')} · ${operationName(seg.operation)}`:'T—';
 if($('#lsimTrack'))$('#lsimTrack').style.width=`${Math.max(0,Math.min(100,(simState.complete?100:ratio*100))).toFixed(1)}%`;syncCode();
}

function pointOnSegment(seg,q){const pts=seg&&seg.points&&seg.points.length?seg.points:[seg.from,seg.to],limit=Math.max(0,Math.min(1,q)),at=limit*(pts.length-1),i=Math.min(pts.length-2,Math.floor(at)),f=at-i,a=pts[Math.max(0,i)],b=pts[Math.max(1,i+1)];return{x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};}

function canvasSpace(canvas,banner){
 const rect=canvas.getBoundingClientRect?canvas.getBoundingClientRect():{width:banner?600:720,height:banner?182:360},w=Math.max(280,rect.width||600),hgt=Math.max(banner?150:160,rect.height||w/(banner?3.2:2.05)),dpr=Math.min(2,window.devicePixelRatio||1);
 const W=Math.round(w*dpr),H=Math.round(hgt*dpr);if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h:hgt};
}

function palette(){return{bg:'#070a0d',grid:'#1b252d',steel:'#8798a5',steel2:'#35434d',edge:'#c8d2d8',dark:'#11171c',orange:'#ff6b00',hot:'#ffad49',tool:'#e8d397',cool:'#55b9da',hole:'#040607'};}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

function currentOuter(m,t){
 const c=m.cfg;if(m.nc&&m.material){const i=Math.max(0,Math.min(m.material.outer.length-1,Math.round(t*(m.material.outer.length-1))));return m.material.outer[i];}const stock=c.stockD/2,target=targetOuter(c,t);if(m.complete)return target;
 const before=Math.max(target,stock-m.pass*c.depth),after=Math.max(target,stock-(m.pass+1)*c.depth),cutEdge=1-m.progress*(1-c.grip/c.length);
 return t>=cutEdge?after:before;
}
function currentInner(m,t){
 const c=m.cfg;if(m.nc&&m.material){const i=Math.max(0,Math.min(m.material.inner.length-1,Math.round(t*(m.material.inner.length-1))));return m.material.inner[i];}const base=Math.max(0,c.boreD/2);if(c.operation!=='boring')return c.stock==='tube'?base:0;const target=c.targetD/2;if(m.complete)return target;
 const before=Math.min(target,base+m.pass*c.depth),after=Math.min(target,base+(m.pass+1)*c.depth),cutEdge=1-m.progress*(1-c.grip/c.length);
 return t>=cutEdge?after:before;
}

function passRadii(m,t){
 const c=m.cfg;if(c.operation==='boring'){const target=c.targetD/2,base=c.boreD/2;return{before:Math.min(target,base+m.pass*c.depth),after:Math.min(target,base+(m.pass+1)*c.depth)};}
 const target=targetOuter(c,t),base=c.stockD/2;return{before:Math.max(target,base-m.pass*c.depth),after:Math.max(target,base-(m.pass+1)*c.depth)};
}
function toolPoint(g,m){
 if(m.nc){const seg=activeSegment(),p=seg?pointOnSegment(seg,m.progress):(m.nc.segments.at(-1)||{to:{x:m.cfg.stockD+10,z:4}}).to;return{x:g.x1+(p.z/m.cfg.length)*(g.x1-g.x0),t:Math.max(0,Math.min(1,(p.z+m.cfg.length)/m.cfg.length)),nc:true,program:p};}
 const c=m.cfg,cutStart=g.x0+(g.x1-g.x0)*c.grip/c.length,half=Math.min(.22,c.stepLen/c.length/2),zoneStart=c.operation==='groove'?g.x0+(g.x1-g.x0)*(.73-half):cutStart,zoneEnd=c.operation==='groove'?g.x0+(g.x1-g.x0)*(.73+half):g.x1;
 const x=m.complete?zoneStart:zoneEnd-(zoneEnd-zoneStart)*m.progress,t=Math.max(0,Math.min(1,(x-g.x0)/(g.x1-g.x0)));return{x,t,zoneStart,zoneEnd};
}

function drawChuck(ctx,g,m,col){
 const {x0,cy,scale}=g,c=m.cfg,stockR=c.stockD/2*scale,jawR=stockR+14,discR=stockR+24,jaws=c.chuck==='4jaw'?4:c.chuck==='collet'?12:3;
 const back=ctx.createLinearGradient(x0-90,0,x0,0);back.addColorStop(0,'#10161b');back.addColorStop(1,'#46535d');ctx.fillStyle=back;rounded(ctx,x0-110,cy-discR-10,82,discR*2+20,10);ctx.fill();
 ctx.fillStyle='#202a31';ctx.fillRect(x0-32,cy-discR,x0-(x0-32),discR*2);ctx.beginPath();ctx.ellipse(x0-30,cy,21,discR,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#778995';ctx.lineWidth=1.2;ctx.stroke();
 const parts=[];for(let i=0;i<jaws;i++){const a=m.spin+i*Math.PI*2/jaws;parts.push({a,depth:Math.cos(a)});}parts.sort((a,b)=>a.depth-b.depth);
 parts.forEach(q=>{const y=cy+Math.sin(q.a)*jawR,x=x0-23+q.depth*9,wide=c.chuck==='collet'?13:28,high=c.chuck==='collet'?5:11;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(q.a)*.14);ctx.fillStyle=q.depth>0?'#83929c':'#43515b';rounded(ctx,-wide/2,-high/2,wide,high,3);ctx.fill();ctx.strokeStyle='#a9b3ba';ctx.globalAlpha=.62;ctx.stroke();ctx.restore();});
 ctx.strokeStyle='rgba(255,107,0,.52)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x0-20,cy,12,discR-7,0,m.spin,m.spin+Math.PI*1.25);ctx.stroke();ctx.globalAlpha=1;
}

function bodyPath(ctx,ptsTop,ptsBottom){ctx.beginPath();ctx.moveTo(ptsTop[0][0],ptsTop[0][1]);for(let i=1;i<ptsTop.length;i++)ctx.lineTo(ptsTop[i][0],ptsTop[i][1]);for(let i=ptsBottom.length-1;i>=0;i--)ctx.lineTo(ptsBottom[i][0],ptsBottom[i][1]);ctx.closePath();}

function drawInnerTunnel(ctx,g,m,col,samples){
 const c=m.cfg,active=activeSegment(),hasHole=c.operation==='boring'||c.stock==='tube'||!!(m.material&&m.material.inner.some(r=>r>.05))||!!(active&&['boring','drill','centerdrill','tap'].includes(active.operation));if(!hasHole)return;
 const top=[],bottom=[];for(let i=0;i<=samples;i++){const t=i/samples,x=g.x0+(g.x1-g.x0)*t,r=currentInner(m,t)*g.scale;top.push([x,g.cy-r]);bottom.push([x,g.cy+r]);}
 const tunnel=ctx.createLinearGradient(0,g.cy-40,0,g.cy+40);tunnel.addColorStop(0,'#17232a');tunnel.addColorStop(.42,col.hole);tunnel.addColorStop(.58,'#020304');tunnel.addColorStop(1,'#24323a');bodyPath(ctx,top,bottom);ctx.fillStyle=tunnel;ctx.fill();
 ctx.strokeStyle='rgba(141,164,176,.62)';ctx.lineWidth=1.1;ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.beginPath();bottom.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();
 if(c.operation==='boring'&&!m.complete&&!m.nc){const q=toolPoint(g,m),r=passRadii(m,q.t),x0=q.x,x1=g.x1,oldR=r.before*g.scale,newR=r.after*g.scale;ctx.fillStyle='rgba(255,107,0,.30)';ctx.beginPath();ctx.moveTo(x0,g.cy+oldR);ctx.lineTo(x1,g.cy+oldR);ctx.lineTo(x1,g.cy+newR);ctx.lineTo(x0,g.cy+newR);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(x0,g.cy-oldR);ctx.lineTo(x1,g.cy-oldR);ctx.lineTo(x1,g.cy-newR);ctx.lineTo(x0,g.cy-newR);ctx.closePath();ctx.fill();}
}

function drawAxialTool(ctx,g,m,time,col,q,spec,op){const x=q.x,y=g.cy+(q.nc?q.program.x/2*g.scale:0),pxPerMm=(g.x1-g.x0)/Math.max(1,m.cfg.length),toolR=Math.max(2,(spec.diameter||4)/2*g.scale),bodyR=Math.max(toolR,(spec.bodyD||spec.diameter||8)/2*g.scale),angle=Math.max(20,Math.min(175,spec.pointAngle||118))*Math.PI/180,coneMm=op==='tap'?2:(spec.diameter||4)/2/Math.tan(angle/2),cone=Math.max(4,coneMm*pxPerMm),work=Math.max(cone+18,(spec.workingLength||35)*pxPerMm),end=x+work;
 ctx.save();ctx.strokeStyle='#aab7bf';ctx.lineWidth=1;const metal=ctx.createLinearGradient(0,y-bodyR,0,y+bodyR);metal.addColorStop(0,'#d4dde1');metal.addColorStop(.32,'#6f818c');metal.addColorStop(.62,'#26343c');metal.addColorStop(1,'#9babb3');ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+cone,y-toolR);ctx.lineTo(end,y-toolR);ctx.lineTo(end,y+toolR);ctx.lineTo(x+cone,y+toolR);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.save();ctx.beginPath();ctx.rect(x+cone,y-toolR,end-x-cone,toolR*2);ctx.clip();ctx.strokeStyle=op==='tap'?'#f0c068':'rgba(10,25,34,.74)';ctx.lineWidth=op==='tap'?1.6:2.2;for(let u=x+cone-10;u<end+15;u+=op==='tap'?7:15){ctx.beginPath();ctx.moveTo(u,y-toolR-2);ctx.lineTo(u+12,y+toolR+2);ctx.stroke();if(op!=='tap'){ctx.beginPath();ctx.moveTo(u+7,y-toolR-2);ctx.lineTo(u+19,y+toolR+2);ctx.stroke();}}ctx.restore();
 ctx.fillStyle='#2d3a42';ctx.strokeStyle='#8b9aa2';rounded(ctx,end-3,y-bodyR,Math.max(26,bodyR*2.2),bodyR*2,4);ctx.fill();ctx.stroke();ctx.fillStyle='#f1bd72';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText(`${op==='tap'?'TAP':'DRILL'} Ø${n(spec.diameter).toFixed(1)}`,Math.min(g.x1-80,x+14),Math.max(15,y-bodyR-8));
 if(m.cfg.coolant){ctx.strokeStyle='rgba(85,185,218,.68)';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x+35+i*7,y-bodyR-24-i*4);ctx.quadraticCurveTo(x+18,y-bodyR-6,x+3,y);ctx.stroke();}}
 if(m.cfg.chips&&m.running){ctx.strokeStyle=col.hot;ctx.lineWidth=1.5;for(let i=0;i<5;i++){const phase=time*.009+i*1.4,dy=Math.sin(phase)*18;ctx.beginPath();ctx.moveTo(x+4,y);ctx.quadraticCurveTo(x+10+i*2,y+dy*.4,x+18+i*4,y+dy);ctx.stroke();}}ctx.restore();}

function drawOuterLayer(ctx,g,m,col){
 if(m.nc||m.complete||m.cfg.operation==='boring')return;const q=toolPoint(g,m),samples=22,upper=[],lower=[];for(let i=0;i<=samples;i++){const t=q.t+(1-q.t)*i/samples,x=g.x0+(g.x1-g.x0)*t,r=passRadii(m,t);upper.push([x,g.cy+r.after*g.scale]);lower.push([x,g.cy+r.before*g.scale]);}bodyPath(ctx,upper,lower);ctx.fillStyle='rgba(255,107,0,.28)';ctx.fill();ctx.strokeStyle='rgba(255,174,76,.68)';ctx.stroke();
}

function drawInsert(ctx,tool,boring,col){
 ctx.fillStyle=tool==='brazed'?'#9aa8ae':col.tool;ctx.strokeStyle=tool==='brazed'?'#d7e4e8':'#fff2b4';ctx.lineWidth=1.05;ctx.beginPath();
 if(tool==='mgmn')ctx.rect(-2,-6,6,14);
 else if(tool==='vnmg'){ctx.moveTo(-5,0);ctx.lineTo(1,-8);ctx.lineTo(10,1);ctx.lineTo(1,9);ctx.closePath();}
 else if(tool==='ccmt'){ctx.moveTo(-5,-5);ctx.lineTo(5,-3);ctx.lineTo(9,5);ctx.lineTo(-1,9);ctx.lineTo(-7,2);ctx.closePath();}
 else if(tool==='brazed'){ctx.moveTo(-7,1);ctx.lineTo(7,-5);ctx.lineTo(10,7);ctx.lineTo(-2,9);ctx.closePath();}
 else{ctx.moveTo(-7,0);ctx.lineTo(0,-6);ctx.lineTo(10,1);ctx.lineTo(2,9);ctx.closePath();}
 ctx.fill();ctx.stroke();if(!['mgmn','brazed'].includes(tool)){ctx.fillStyle='#5e5639';ctx.beginPath();ctx.arc(1,1,2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.32)';ctx.beginPath();ctx.arc(1,1,3.7,0,Math.PI*2);ctx.stroke();}if(tool==='brazed'){ctx.fillStyle='#4b6b73';ctx.beginPath();ctx.moveTo(-6,2);ctx.lineTo(6,-3);ctx.lineTo(8,5);ctx.lineTo(-1,7);ctx.closePath();ctx.fill();}if(boring){ctx.strokeStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.moveTo(-3,-3);ctx.lineTo(4,5);ctx.stroke();}
}

function drawTool(ctx,g,m,time,col,banner){
 const c=m.cfg,q=toolPoint(g,m),active=m.nc?activeSegment():null,spec=active&&active.toolSpec||{...TOOL_LIBRARY[c.tool],kind:c.tool,nose:c.nose,operation:c.operation},op=active&&active.operation||c.operation,x=q.x,t=q.t;if(['drill','centerdrill','tap'].includes(op)){drawAxialTool(ctx,g,m,time,col,q,spec,op);return;}let tipY;
 if(op==='boring'){
  tipY=q.nc?g.cy+q.program.x/2*g.scale:g.cy+currentInner(m,t)*g.scale;const endX=g.x1+Math.max(55,(g.x1-g.x0)*.16),barY=Math.max(g.cy+4,tipY-10),grad=ctx.createLinearGradient(x,0,endX,0);grad.addColorStop(0,'#7c8991');grad.addColorStop(.4,'#3a464e');grad.addColorStop(1,'#1b242a');ctx.fillStyle=grad;ctx.strokeStyle='#8f9ba2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+3,tipY-5);ctx.lineTo(endX,barY-6);ctx.quadraticCurveTo(endX+8,barY,endX,barY+6);ctx.lineTo(x+4,tipY+4);ctx.closePath();ctx.fill();ctx.stroke();
 }else{
  tipY=q.nc?g.cy+q.program.x/2*g.scale:g.cy+currentOuter(m,t)*g.scale+2;const grad=ctx.createLinearGradient(x,tipY,x+82,tipY+48);grad.addColorStop(0,'#87949d');grad.addColorStop(.22,'#4c5961');grad.addColorStop(1,'#171e23');ctx.fillStyle=grad;ctx.strokeStyle='#8c989f';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x-2,tipY+4);ctx.lineTo(x+69,tipY+28);ctx.lineTo(x+84,tipY+45);ctx.lineTo(x+72,tipY+61);ctx.lineTo(x-4,tipY+13);ctx.closePath();ctx.fill();ctx.stroke();
 }
 ctx.save();ctx.translate(x,tipY);if(op==='boring')ctx.rotate(-.08);drawInsert(ctx,spec.kind||c.tool,op==='boring',col);ctx.restore();
 if(!banner){ctx.fillStyle='rgba(5,8,11,.82)';ctx.strokeStyle='rgba(129,150,162,.35)';rounded(ctx,Math.min(g.x1-64,x+15),op==='boring'?g.cy-31:Math.min(g.cy+64,tipY+37),74,17,5);ctx.fill();ctx.stroke();ctx.fillStyle='#f1bd72';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText(`${active&&active.toolStation?'T'+String(active.toolStation).padStart(2,'0')+' ':''}${String(spec.kind||c.tool).toUpperCase()}`,Math.min(g.x1-59,x+20),op==='boring'?g.cy-20:Math.min(g.cy+75,tipY+48));}
 if(c.coolant){ctx.strokeStyle='rgba(85,185,218,.68)';ctx.lineWidth=1.3;for(let i=0;i<3;i++){ctx.beginPath();if(op==='boring'){ctx.moveTo(g.x1+35+i*6,g.cy-44-i*4);ctx.quadraticCurveTo(g.x1+10,g.cy-4,x+5,tipY-3);}else{ctx.moveTo(x+36+i*7,Math.max(12,tipY-70-i*5));ctx.quadraticCurveTo(x+18+i*3,tipY-28,x+4,tipY-3);}ctx.stroke();}}
 if(c.chips&&m.running){ctx.strokeStyle=col.hot;ctx.lineWidth=1.6;for(let i=0;i<6;i++){const phase=time*.008+i*1.7,dx=8+Math.abs(Math.sin(phase))*28,dy=(op==='boring'?1:-1)*(5+Math.abs(Math.cos(phase*.8))*24);ctx.beginPath();ctx.moveTo(x+2,tipY);ctx.quadraticCurveTo(x+dx*.45,tipY+dy*.35,x+dx,tipY+dy);ctx.stroke();}}
}

function drawGcodePath(ctx,g,result,col){
 if(!viewState.showPath||!result||!result.segments||!result.segments.length)return;const c=result.cfg,map=p=>({x:g.x1+(p.z/c.length)*(g.x1-g.x0),y:g.cy+p.x/2*g.scale});let flagged=0;
 result.segments.forEach((seg,index)=>{if(seg.rapid&&!viewState.showRapid)return;if(seg.arc&&!viewState.showArcs)return;if(seg.synthetic&&result.cfg&&result.cfg.showCycles===false)return;const pts=seg.points&&seg.points.length?seg.points:[seg.from,seg.to],first=map(pts[0]);if(!Number.isFinite(first.x+first.y))return;ctx.save();ctx.beginPath();ctx.rect(g.x0-42,g.cy-c.stockD/2*g.scale-48,g.x1-g.x0+120,c.stockD*g.scale+120);ctx.clip();ctx.strokeStyle=seg.suspicious?'#ff4438':seg.rapid?'#4da3ff':seg.arc?(seg.cw?'#ffd64d':'#ff8a34'):'#55d58a';ctx.lineWidth=seg.suspicious?2.7:index===simState?.segment?2.8:1.55;ctx.globalAlpha=seg.suspicious?1:index===simState?.segment?1:.78;if(seg.rapid)ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(first.x,first.y);for(let i=1;i<pts.length;i++){const q=map(pts[i]);ctx.lineTo(q.x,q.y);}ctx.stroke();ctx.setLineDash([]);
  const b=map(pts[pts.length-1]);if(viewState.showDots){ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(b.x,b.y,index===simState?.segment?3.6:2.2,0,Math.PI*2);ctx.fill();}if(seg.suspicious&&flagged<8){flagged++;ctx.fillStyle='#ff4438';ctx.beginPath();ctx.arc(b.x,b.y,4.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='600 7px "IBM Plex Mono",monospace';ctx.fillText(String(seg.line),b.x+6,b.y-5);}ctx.restore();});
}

/* ============================================================
   Плоский разрез 2D: сечение детали, траектория и инструмент.
   Ось Z горизонтально, +X вверх и вниз от осевой линии в диаметрах.
   ============================================================ */
const FLAT={bg:'#080b0e',grid:'#141d25',grid2:'#20303c',axis:'#5d6f7c',text:'#8fa0ac',
 blank:'#1a2229',blankEdge:'#3f4f5b',metal:'#3d4d59',metalEdge:'#a9bcc7',
 chuck:'#212b33',chuckEdge:'#576976',steel:'#93a4b0',carbide:'#e8d397',braze:'#c08a4a'};

/* границы сцены: заготовка плюс рабочие ходы; парковочные G0 в подбор не берём */
function flatBounds(m){
 const c=m.cfg;let zMin=-Math.max(10,c.length),zMax=Math.max(6,c.length*.08),rMax=Math.max(4,c.stockD/2);
 const segs=(m.nc&&m.nc.segments)||[];
 segs.forEach(s=>{if(!s.cutting&&!s.cycle)return;(s.points||[s.from,s.to]).forEach(p=>{if(!Number.isFinite(p.z)||!Number.isFinite(p.x))return;zMin=Math.min(zMin,p.z);zMax=Math.max(zMax,p.z);rMax=Math.max(rMax,Math.abs(p.x)/2);});});
 return{zMin,zMax:Math.max(zMax,2),rMax};
}
function niceStep(px,k){const list=[.5,1,2,5,10,20,25,50,100,200,500];for(const s of list)if(s*k>=px)return s;return 1000;}
function programPoint(m){
 if(m.nc){const seg=activeSegment(),p=seg?pointOnSegment(seg,m.progress):(m.nc.segments[m.nc.segments.length-1]||{to:{x:m.cfg.stockD+10,z:4}}).to;return{...p};}
 const c=m.cfg,t=m.progress||0;return{x:currentOuter(m,1)*2,z:-Math.max(0,(c.length-c.grip))*t};
}
/* силуэт пластины: вершина в начале координат, оси в миллиметрах */
function insertPoly(kind,lead,size){
 const ang={r80:80,r55:55,r35:35,tri:60,tri80:80,sq:90,brz:80,thr:60}[kind]||80;
 const a1=(180-(lead||95))*Math.PI/180,a2=a1-ang*Math.PI/180,L=size||9;
 const u1=[Math.cos(a1),Math.sin(a1)],u2=[Math.cos(a2),Math.sin(a2)];
 if(kind==='tri'||kind==='thr')return[[0,0],[L*u1[0],L*u1[1]],[L*u2[0],L*u2[1]]];
 return[[0,0],[L*u1[0],L*u1[1]],[L*(u1[0]+u2[0]),L*(u1[1]+u2[1])],[L*u2[0],L*u2[1]]];
}
function fillPoly(ctx,pts,fill,stroke,w){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w||1.1;ctx.stroke();}}

/* инструмент в плоском виде: масштаб общий со сценой, поэтому габариты видны честно */
function drawTool2D(ctx,G,m,spec,op,point){
 const k=G.k,mm=v=>v*k,tipX=G.MX(point.z),tipY=G.MY(point.x),shape=spec.shape||(op==='boring'?'bore':op==='groove'?'groove':op==='thread'?'thread':['drill','centerdrill','tap'].includes(op)?'axial':'turn');
 const body=Math.max(8,spec.bodyD||20),work=Math.max(18,spec.workingLength||30),braze=!!spec.brazed;
 ctx.save();ctx.lineJoin='round';
 if(shape==='axial'){
  const r=Math.max(.6,(spec.diameter||6)/2),bodyR=Math.max(r,(spec.bodyD||spec.diameter||8)/2),ang=Math.max(20,Math.min(178,spec.pointAngle||118))*Math.PI/180,cone=r/Math.tan(ang/2);
  const y0=G.cy,x0=tipX;
  fillPoly(ctx,[[x0,y0],[x0+mm(cone),y0-mm(r)],[x0+mm(cone+work),y0-mm(r)],[x0+mm(cone+work),y0+mm(r)],[x0+mm(cone),y0+mm(r)]],FLAT.steel,'#dbe6ec',1.2);
  ctx.strokeStyle='rgba(10,20,28,.55)';ctx.lineWidth=1;for(let u=cone;u<cone+work;u+=Math.max(2,work/9)){ctx.beginPath();ctx.moveTo(x0+mm(u),y0-mm(r));ctx.lineTo(x0+mm(u+work/12),y0+mm(r));ctx.stroke();}
  fillPoly(ctx,[[x0+mm(cone+work),y0-mm(bodyR)],[x0+mm(cone+work+14),y0-mm(bodyR)],[x0+mm(cone+work+14),y0+mm(bodyR)],[x0+mm(cone+work),y0+mm(bodyR)]],FLAT.chuck,FLAT.chuckEdge,1.1);
  ctx.restore();return;
 }
 const inner=shape==='bore'||shape==='groovein'||shape==='threadin',sign=inner?1:-1; /* наружный инструмент выше поверхности, внутренний ниже */
 ctx.translate(tipX,tipY);
 if(shape==='groove'||shape==='groovein'){
  const wI=Math.max(.5,spec.insertWidth||3),bladeH=Math.min(work,26);
  fillPoly(ctx,[[-mm(wI/2),0],[mm(wI/2),0],[mm(wI/2),sign*mm(bladeH)],[-mm(wI/2),sign*mm(bladeH)]],braze?FLAT.braze:FLAT.carbide,'#fff2b4',1.1);
  fillPoly(ctx,[[-mm(wI/2+1.5),sign*mm(bladeH)],[mm(wI/2+1.5),sign*mm(bladeH)],[mm(work),sign*mm(bladeH+body*.5)],[mm(work),sign*mm(bladeH+body)],[-mm(wI/2+1.5),sign*mm(bladeH+body)]],FLAT.chuck,FLAT.chuckEdge,1.2);
 }else if(shape==='thread'||shape==='threadin'){
  fillPoly(ctx,insertPoly('thr',90,7).map(p=>[mm(p[0]),sign*mm(p[1])]),braze?FLAT.braze:FLAT.carbide,'#fff2b4',1.1);
  fillPoly(ctx,[[mm(2),sign*mm(5)],[mm(work),sign*mm(5)],[mm(work),sign*mm(5+body)],[mm(2),sign*mm(5+body)]],FLAT.chuck,FLAT.chuckEdge,1.2);
 }else if(shape==='bore'){
  const barR=Math.max(3,body/2);
  fillPoly(ctx,[[mm(1),0],[mm(work),-mm(barR*.4)],[mm(work),mm(barR*1.6)],[mm(1),mm(barR*1.1)]],FLAT.chuck,FLAT.chuckEdge,1.2);
  fillPoly(ctx,insertPoly(spec.insert||'r80',spec.lead||95,7).map(p=>[mm(p[0]),mm(p[1])]),braze?FLAT.braze:FLAT.carbide,'#fff2b4',1.1);
 }else{
  const L=Math.max(6,Math.min(11,(spec.nose||.8)*6+7));
  fillPoly(ctx,[[mm(2),-mm(2)],[mm(work),-mm(2)],[mm(work),-mm(2+body)],[mm(2),-mm(2+body)]],FLAT.chuck,FLAT.chuckEdge,1.2);
  fillPoly(ctx,insertPoly(spec.insert||'r80',spec.lead||95,L).map(p=>[mm(p[0]),-mm(p[1])]),braze?FLAT.braze:FLAT.carbide,'#fff2b4',1.15);
  if(braze){ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(mm(1),-mm(1.5));ctx.lineTo(mm(L*.8),-mm(L*.5));ctx.stroke();}
 }
 ctx.restore();
}

/* предпросмотр выбранного инструмента в карточке станции — силуэт выбранного инструмента */
function drawToolPreview(canvas,spec,op){
 if(!canvas||!canvas.getContext)return;
 const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(120,canvas.clientWidth||210),hgt=Math.max(60,canvas.clientHeight||84);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(hgt*dpr);
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,w,hgt);ctx.fillStyle='#0a0e12';ctx.fillRect(0,0,w,hgt);
 const axial=['drill','centerdrill','tap'].includes(op),inner=spec.shape==='bore'||spec.shape==='groovein'||spec.shape==='threadin';
 const spanZ=Math.max(34,(spec.workingLength||30)+28),spanX=Math.max(24,(spec.bodyD||20)+16);
 const k=Math.min((w-22)/spanZ,(hgt-16)/spanX);
 const cy=axial?hgt/2:inner?hgt*.34:hgt*.7,tipX=13;
 const G={k,cy,MX:z=>tipX+z*k,MY:x=>cy-x/2*k,clip:{x:0,y:0,w,h:hgt}};
 if(!axial){ctx.fillStyle='#161d23';if(inner)ctx.fillRect(0,0,w,cy);else ctx.fillRect(0,cy,w,hgt-cy);
  ctx.strokeStyle='#42535f';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.stroke();
  ctx.fillStyle='#5d6f7c';ctx.font='500 8px "IBM Plex Mono",monospace';ctx.fillText(inner?'стенка отверстия':'поверхность детали',6,inner?14:hgt-6);
 }else{ctx.strokeStyle='#42535f';ctx.lineWidth=1;ctx.setLineDash([8,4,2,4]);ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#5d6f7c';ctx.font='500 8px "IBM Plex Mono",monospace';ctx.fillText('ось вращения',6,hgt-6);}
 try{drawTool2D(ctx,G,null,spec,op,{x:0,z:0});}catch(_){}
}
function refreshToolPreview(card){
 if(!card)return;const canvas=card.querySelector('canvas[data-tool-preview]');if(!canvas)return;
 const get=name=>card.querySelector(`[data-tool-field="${name}"]`),num=name=>n(get(name)&&get(name).value);
 const kind=get('kind')&&get('kind').value||'cnmg',lib=TOOL_LIBRARY[kind]||TOOL_LIBRARY.cnmg;
 const spec={...lib,kind,diameter:num('diameter'),workingLength:num('workingLength'),bodyD:num('bodyD'),nose:num('nose'),pointAngle:num('pointAngle'),insertWidth:num('insertWidth')||lib.insertWidth||3};
 drawToolPreview(canvas,spec,get('operation')&&get('operation').value||lib.operation);
}

function drawPath2D(ctx,G,result){
 if(!viewState.showPath||!result||!result.segments||!result.segments.length)return;
 const cur=simState?simState.segment:-1;let flagged=0;
 result.segments.forEach((seg,index)=>{
  if(seg.rapid&&!viewState.showRapid)return;
  if(seg.arc&&!viewState.showArcs)return;
  if(seg.synthetic&&result.cfg&&result.cfg.showCycles===false)return;
  const pts=seg.points&&seg.points.length?seg.points:[seg.from,seg.to];
  ctx.save();ctx.beginPath();ctx.rect(G.clip.x,G.clip.y,G.clip.w,G.clip.h);ctx.clip();
  ctx.strokeStyle=seg.suspicious?'#ff4438':seg.rapid?'#4da3ff':seg.arc?(seg.cw?'#ffd64d':'#ff8a34'):'#55d58a';
  ctx.lineWidth=seg.suspicious?2.6:index===cur?2.8:1.5;ctx.globalAlpha=seg.suspicious?1:index===cur?1:.8;
  if(seg.rapid)ctx.setLineDash([6,5]);
  ctx.beginPath();pts.forEach((p,i)=>{const X=G.MX(p.z),Y=G.MY(p.x);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.stroke();ctx.setLineDash([]);
  const last=pts[pts.length-1],bx=G.MX(last.z),by=G.MY(last.x);
  if(viewState.showDots){ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(bx,by,index===cur?3.4:2,0,Math.PI*2);ctx.fill();}
  if(seg.suspicious&&flagged<8){flagged++;ctx.fillStyle='#ff4438';ctx.beginPath();ctx.arc(bx,by,4.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='600 7px "IBM Plex Mono",monospace';ctx.fillText(String(seg.line),bx+6,by-5);}
  ctx.restore();
 });
}

/* геометрия сцены отдельно от отрисовки: нужна и для мыши, и для щипка */
function flatGeom(W,H,m,zoom,panX,panY){
 const b=flatBounds(m),padL=46,padR=14,padT=12,padB=24;
 const spanZ=Math.max(1,b.zMax-b.zMin),spanR=Math.max(1,b.rMax*2.3);
 const k=Math.min((W-padL-padR)/spanZ,(H-padT-padB)/spanR)*Math.max(.15,zoom||1);
 const cy=padT+(H-padT-padB)/2+(panY||0);
 const left=padL+((W-padL-padR)-spanZ*k)/2,ox=left-b.zMin*k+(panX||0);
 return{k,cy,ox,b,padL,padR,padT,padB,
  MX:z=>ox+z*k,MY:x=>cy-x/2*k,
  invZ:sx=>(sx-ox)/k,invX:sy=>(cy-sy)*2/k,
  clip:{x:padL-6,y:0,w:W-padL-padR+20,h:H-padB+8}};
}

function draw2D(canvas,m,time){
 if(!canvas)return;const S=canvasSpace(canvas,false),ctx=S.ctx,W=S.w,H=S.h;
 ctx.clearRect(0,0,W,H);ctx.fillStyle=FLAT.bg;ctx.fillRect(0,0,W,H);
 if(!m){ctx.fillStyle=FLAT.text;ctx.font='500 11px "IBM Plex Mono",monospace';ctx.fillText('Откройте NC-программу',16,H/2);return;}
 const c=m.cfg,G=flatGeom(W,H,m,viewState.zoom||1,viewState.panX||0,viewState.panY||0);
 const b=G.b,k=G.k,cy=G.cy,padL=G.padL,padR=G.padR,padT=G.padT,padB=G.padB;
 const yUp=r=>cy-r*k,yDn=r=>cy+r*k;

 /* сетка и линейки */
 if(viewState.showGrid){
  const stepZ=niceStep(52,k),stepR=niceStep(34,k);
  ctx.lineWidth=1;ctx.font='500 8px "IBM Plex Mono",monospace';ctx.textBaseline='middle';
  for(let z=Math.ceil(b.zMin/stepZ)*stepZ;z<=b.zMax+.001;z+=stepZ){const X=G.MX(z);if(X<padL-8||X>W-2)continue;ctx.strokeStyle=Math.abs(z)<1e-6?FLAT.grid2:FLAT.grid;ctx.beginPath();ctx.moveTo(X,padT-6);ctx.lineTo(X,H-padB);ctx.stroke();ctx.fillStyle=FLAT.text;ctx.textAlign='center';ctx.fillText(String(Math.round(z)),X,H-padB+9);}
  for(let r=stepR;r<=b.rMax*1.15;r+=stepR){[yUp(r),yDn(r)].forEach(Y=>{if(Y<2||Y>H-padB)return;ctx.strokeStyle=FLAT.grid;ctx.beginPath();ctx.moveTo(padL-8,Y);ctx.lineTo(W-2,Y);ctx.stroke();});const Y=yUp(r);if(Y>8&&Y<H-padB){ctx.fillStyle=FLAT.text;ctx.textAlign='right';ctx.fillText('⌀'+Math.round(r*2),padL-11,Y);}}
  ctx.textAlign='left';
 }
 /* зона зажима */
 const zClamp=-Math.max(0,c.length-c.grip),rJaw=c.stockD/2+Math.max(4,c.stockD*.12);
 if(viewState.showStock&&zClamp>b.zMin-1){
  const x0=G.MX(b.zMin-2),x1=G.MX(zClamp),ytop=yUp(rJaw),ybot=yDn(rJaw);
  ctx.save();ctx.beginPath();ctx.rect(x0,ytop,x1-x0,ybot-ytop);ctx.clip();
  ctx.fillStyle=FLAT.chuck;ctx.fillRect(x0,ytop,x1-x0,ybot-ytop);
  ctx.strokeStyle='rgba(120,140,155,.35)';ctx.lineWidth=1;
  for(let d=-(ybot-ytop);d<x1-x0;d+=9){ctx.beginPath();ctx.moveTo(x0+d,ybot);ctx.lineTo(x0+d+(ybot-ytop),ytop);ctx.stroke();}
  ctx.restore();ctx.strokeStyle=FLAT.chuckEdge;ctx.lineWidth=1.3;ctx.strokeRect(x0,ytop,x1-x0,ybot-ytop);
  ctx.fillStyle=FLAT.text;ctx.font='500 8px "IBM Plex Mono",monospace';ctx.fillText('ЗАЖИМ',x0+6,ytop+11);
 }
 /* исходная заготовка пунктиром и текущий металл в разрезе */
 if(viewState.showStock){
  const zA=G.MX(-c.length),zB=G.MX(0),rs=c.stockD/2;
  ctx.setLineDash([5,4]);ctx.strokeStyle=FLAT.blankEdge;ctx.lineWidth=1;
  ctx.strokeRect(zA,yUp(rs),zB-zA,yDn(rs)-yUp(rs));ctx.setLineDash([]);
  const mat=m.material;
  if(mat&&mat.z&&mat.z.length){
   [1,-1].forEach(sd=>{
    const Y=r=>sd>0?yUp(r):yDn(r);
    ctx.beginPath();
    for(let i=0;i<mat.z.length;i++){const X=G.MX(mat.z[i]);i?ctx.lineTo(X,Y(mat.outer[i])):ctx.moveTo(X,Y(mat.outer[i]));}
    for(let i=mat.z.length-1;i>=0;i--)ctx.lineTo(G.MX(mat.z[i]),Y(mat.inner[i]));
    ctx.closePath();ctx.fillStyle=FLAT.metal;ctx.fill();ctx.strokeStyle=FLAT.metalEdge;ctx.lineWidth=1.25;ctx.stroke();
   });
  }
 }
 /* осевая линия */
 ctx.strokeStyle=FLAT.axis;ctx.lineWidth=1;ctx.setLineDash([9,4,2,4]);ctx.beginPath();ctx.moveTo(padL-10,cy);ctx.lineTo(W-2,cy);ctx.stroke();ctx.setLineDash([]);
 /* точка нуля детали */
 const z0=G.MX(0);if(z0>padL-10&&z0<W){ctx.strokeStyle='#ff8a34';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(z0,cy-7);ctx.lineTo(z0,cy+7);ctx.moveTo(z0-7,cy);ctx.lineTo(z0+7,cy);ctx.stroke();ctx.fillStyle='#ff8a34';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText('Z0 X0',z0+9,cy-9);}

 drawPath2D(ctx,G,gcodeResult);

 if(viewState.showTool){
  const active=m.nc?activeSegment():null;
  const spec=active&&active.toolSpec||{...(TOOL_LIBRARY[c.tool]||TOOL_LIBRARY.cnmg),kind:c.tool,nose:c.nose,operation:c.operation};
  const lib=TOOL_LIBRARY[spec.kind]||TOOL_LIBRARY[c.tool]||TOOL_LIBRARY.cnmg;
  const full={...lib,...spec},op=active&&active.operation||c.operation,point=programPoint(m);
  if(Number.isFinite(point.x)&&Number.isFinite(point.z)){
   ctx.save();ctx.beginPath();ctx.rect(G.clip.x,G.clip.y,G.clip.w,G.clip.h);ctx.clip();
   drawTool2D(ctx,G,m,full,op,point);ctx.restore();
   const label=`${active&&active.toolStation?'T'+String(active.toolStation).padStart(2,'0')+' ':''}${String(full.kind||c.tool).toUpperCase()}`;
   const lx=Math.min(W-92,Math.max(padL,G.MX(point.z)+10)),ly=Math.max(14,G.MY(point.x)-Math.min(60,G.k*22));
   ctx.fillStyle='rgba(5,8,11,.86)';ctx.strokeStyle='rgba(129,150,162,.35)';rounded(ctx,lx,ly,86,16,5);ctx.fill();ctx.stroke();
   ctx.fillStyle='#f1bd72';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText(label.slice(0,14),lx+6,ly+11);
  }
 }
 /* подписи осей */
 ctx.fillStyle=FLAT.text;ctx.font='500 8px "IBM Plex Mono",monospace';ctx.fillText('Z, мм',W-46,H-padB+9);ctx.fillText('⌀X',6,padT+4);
}

function drawLathe(canvas,m,banner,time){
 if(!canvas||!m)return;const S=canvasSpace(canvas,banner),ctx=S.ctx,w=S.w,height=S.h,col=palette();ctx.clearRect(0,0,w,height);
 const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#101820');bg.addColorStop(.58,col.bg);bg.addColorStop(1,'#050709');ctx.fillStyle=bg;ctx.fillRect(0,0,w,height);
 ctx.strokeStyle=col.grid;ctx.lineWidth=1;ctx.globalAlpha=.55;for(let i=0;i<9;i++){const y=height*.14+i*height*.095;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}for(let i=0;i<12;i++){const x=i*w/11;ctx.beginPath();ctx.moveTo(x,height*.15);ctx.lineTo(w*.5+(x-w*.5)*1.35,height);ctx.stroke();}ctx.globalAlpha=1;
 const c=m.cfg,zoom=banner?1:(viewState.zoom||1),maxRp=height*(banner?.27:.25),scale=maxRp/(c.stockD/2+5)*zoom,base0=w*(banner?.54:.235),base1=w*(banner?.93:.91),mid=(base0+base1)/2,half=(base1-base0)/2*zoom,g={x0:mid-half,x1:mid+half,cy:height*(banner?.56:.53),scale};
 ctx.save();if(!banner&&!viewState.showStock)ctx.globalAlpha=0;drawChuck(ctx,g,m,col);
 const samples=banner?34:64,top=[],bottom=[];for(let i=0;i<=samples;i++){const t=i/samples,x=g.x0+(g.x1-g.x0)*t,r=currentOuter(m,t)*scale;top.push([x,g.cy-r]);bottom.push([x,g.cy+r]);}
 const body=ctx.createLinearGradient(0,g.cy-maxRp,0,g.cy+maxRp);body.addColorStop(0,'#b9c3c9');body.addColorStop(.18,'#71828d');body.addColorStop(.52,'#2f3d46');body.addColorStop(.78,'#697a84');body.addColorStop(1,'#1d272e');bodyPath(ctx,top,bottom);ctx.fillStyle=body;ctx.fill();ctx.save();bodyPath(ctx,top,bottom);ctx.clip();
 const shine=(Math.sin(m.spin)+1)/2;ctx.globalAlpha=.15+.14*shine;ctx.strokeStyle='#e6f2f7';ctx.lineWidth=Math.max(2,height*.012);ctx.beginPath();ctx.moveTo(g.x0,g.cy-maxRp*.58);ctx.lineTo(g.x1,g.cy-maxRp*.58);ctx.stroke();ctx.globalAlpha=.12;ctx.strokeStyle=col.orange;ctx.beginPath();ctx.moveTo(g.x0,g.cy+maxRp*(.15+shine*.4));ctx.lineTo(g.x1,g.cy+maxRp*(.15+shine*.4));ctx.stroke();ctx.restore();ctx.globalAlpha=1;
 bodyPath(ctx,top,bottom);ctx.strokeStyle=col.edge;ctx.lineWidth=1.2;ctx.stroke();
 drawInnerTunnel(ctx,g,m,col,samples);
 const frontR=currentOuter(m,1)*scale,ellipse=Math.max(5,height*.026);ctx.fillStyle='#52636d';ctx.beginPath();ctx.ellipse(g.x1,g.cy,ellipse,frontR,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#bac5cb';ctx.stroke();
 const innerR=currentInner(m,1)*scale;if(innerR>1){const bore=ctx.createRadialGradient(g.x1,g.cy,1,g.x1,g.cy,innerR);bore.addColorStop(0,'#010203');bore.addColorStop(.76,'#05080a');bore.addColorStop(1,'#31424b');ctx.fillStyle=bore;ctx.beginPath();ctx.ellipse(g.x1+1,g.cy,ellipse*.64,innerR,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#8da0aa';ctx.stroke();}
 drawOuterLayer(ctx,g,m,col);
 if(!banner&&!m.nc){ctx.strokeStyle='rgba(255,107,0,.24)';ctx.lineWidth=1;for(let p=1;p<=Math.min(20,m.totalPasses);p++){const r=(c.operation==='boring'?c.boreD/2+p*c.depth:c.stockD/2-p*c.depth)*scale;if(r<=0||r>maxRp)continue;ctx.beginPath();ctx.moveTo(g.x0+(g.x1-g.x0)*c.grip/c.length,g.cy-r);ctx.lineTo(g.x1,g.cy-r);ctx.stroke();}}
 ctx.restore();
 if(!banner)drawGcodePath(ctx,g,gcodeResult,col);
 if(banner||viewState.showTool)drawTool(ctx,g,m,time,col,banner);
 if(!banner){ctx.strokeStyle='rgba(255,255,255,.15)';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(g.x0,g.cy);ctx.lineTo(g.x1+40,g.cy);ctx.stroke();ctx.setLineDash([]);}
}

function initBanner(){
 const canvas=$('#latheSimBannerCanvas');if(!canvas)return;stopBanner();bannerStart=Date.now();const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,cfg={...defaults(),contour:'step',targetD:42,stepD:52,stepLen:46,depth:2.5,rpm:900,coolant:false},model=buildModel(cfg);
 const tick=()=>{if(!$('#latheSimBannerCanvas')){bannerFrame=0;return;}const elapsed=Date.now()-bannerStart,duration=1850,totalCycle=duration*model.totalPasses,cycle=elapsed%totalCycle;model.pass=Math.floor(cycle/duration);model.progress=reduced?.48:(cycle%duration)/duration;model.spin=reduced?.8:elapsed*.005;model.running=!reduced;drawLathe(canvas,model,true,Date.now());if(!reduced)bannerFrame=requestAnimationFrame(tick);};tick();
}
function stopBanner(){if(bannerFrame){cancelAnimationFrame(bannerFrame);bannerFrame=0;}}
function stopSimulation(){haltRun();if(resizeWatch){resizeWatch.disconnect();resizeWatch=null;}
 const stage=document.querySelector('.lsim-stage');if(stage)stage.classList.remove('full');
 document.body.classList.remove('lsim-full-open');}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('lsim-full-open'))toggleFullscreen(false);});

const previousBind=bind;bind=function(){previousBind();bindSimulator();};
const previousRender=render;render=function(){stopBanner();stopSimulation();if(tab==='work'&&folder==='simx'){showSimulator();return;}previousRender();if(tab==='work'&&!folder)initBanner();};

window.RazryadLatheSim={TOOL_LIBRARY,TOOL_GROUPS,drawToolPreview,draw2D,defaults,validate,buildModel,targetOuter,stripGComments,parseGcode,arcPath,stockProfile,inferStock,applySegmentCut,buildPlayback,detectToolCatalog,toolHintFromText,openWithCode,consumeHandoff};
try{if(new URLSearchParams(location.search).get('open')==='backplot'||history.state&&history.state.razryadBackplotRoute){tab='work';folder='simx';history.replaceState({...history.state,razryadBackplotRoute:true},'',location.pathname);}}catch(_){}
render();
})();
