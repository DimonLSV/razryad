/* РАЗРЯД 0.993 — единый проверяемый Эмулятор CNC: плоский разрез токарной программы */
(function(){
const STORE='razryad-lathe-sim-v99';
const VIEW_STORE='razryad-cnc-emulator-view-v1';
const PROFILE='razryad-machine-profile-v99';
const TOOL_STORE='razryad-lathe-tools-v992';
let bannerFrame=0,simFrame=0,bannerStart=Date.now(),simState=null,lastTick=0,resizeWatch=null,gcodeResult=null,viewState=loadView();
const root=document.querySelector('.device');

function defaults(){return{dialect:'haas',operation:'external',stock:'solid',contour:'step',stockD:60,length:120,boreD:20,targetD:45,stepD:54,stepLen:42,chuck:'3jaw',grip:25,tool:'cnmg',nose:0.8,depth:2,feed:0.25,rpm:800,speed:2,coolant:true,chips:true,arcCenterDiameter:true,showCycles:true,toolConfigs:{}};}
function profile(){try{return JSON.parse(localStorage.getItem(PROFILE)||'null')||{name:'Haas ST-20',maxRpm:4000}}catch(_){return{name:'Haas ST-20',maxRpm:4000}}}
function load(){try{return{...defaults(),...(JSON.parse(localStorage.getItem(STORE)||'null')||{})}}catch(_){return defaults()}}
function save(v){try{localStorage.setItem(STORE,JSON.stringify(v))}catch(_){}}
function loadView(){const base={showRapid:true,showDots:true,showArcs:true,showStock:true,showTool:true,showPath:true,showCycles:true,showGrid:true,flat:true,zoom:1,panX:0,panY:0,codeTheme:'cimco',autoStock:true,toolScale:'real'};try{return{...base,...(JSON.parse(localStorage.getItem(VIEW_STORE)||'null')||{})}}catch(_){return base}}
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
/* Насколько резцу позволено уйти за ось при подрезке торца: X-0,5…X-2 — штатная
   практика, чтобы не осталась пуговка. Больше этого — уже описка в знаке, и такой
   кадр не снимает металл, а помечается ошибкой. */
const AXIS_OVERRUN=5;

/* ============================================================
   Подсветка G-кода по цветам CIMCO Edit.
   Значения взяты из Cfg/Iso.mac (секция [COLOR]): там цвет каждого адреса
   записан как COLORREF 0x00BBGGRR, старший байт — жирность.
   Светлая схема повторяет CIMCO один в один; тёмная сохраняет те же оттенки,
   но поднимает светлоту — иначе тёмно-синий X на чёрном фоне не читается.
   ============================================================ */
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

/* Каталог инструмента: группа, геометрия для проверок и силуэт для 2D-отрисовки.
   shape — как рисовать: turn (наружный), bore (расточной), groove, thread, axial.
   insert — форма пластины, lead — главный угол в плане, hand — правый/левый. */
const TOOL_GROUPS=[['ext','Резцы наружные · сменная пластина'],['bore','Резцы расточные · сменная пластина'],['groove','Канавочные и отрезные'],['thr','Резьбовые'],['brazed','Напайные резцы (ГОСТ)'],['axial','Осевой инструмент']];
const TOOL_LIBRARY={
 /* Наружные резцы со сменной пластиной. Размеры по каталогу ISO:
    shankH×shankW — сечение державки, holder — полная длина, workingLength — рабочий вылет,
    edge — длина режущей кромки пластины, lead — главный угол в плане φ. */
 cnmg:{name:'PCLNR 2525 M12 + CNMG 120408 · проходной упорный 95°',group:'ext',operation:'external',
  diameter:0,workingLength:40,bodyD:25,shankH:25,shankW:25,holder:150,edge:12.9,thick:4.76,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'r80',lead:95,hand:'R',note:'Основной черновой и получистовой. Ромб 80°, работает к патрону и в упор.'},
 dnmg:{name:'PDJNR 2525 M15 + DNMG 150608 · проходной 93°',group:'ext',operation:'external',
  diameter:0,workingLength:40,bodyD:25,shankH:25,shankW:25,holder:150,edge:15.5,thick:6.35,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'r55',lead:93,hand:'R',note:'Ромб 55°: универсал под контур и небольшие обратные углы.'},
 tnmg:{name:'PTGNR 2525 M16 + TNMG 160408 · проходной 91°',group:'ext',operation:'external',
  diameter:0,workingLength:40,bodyD:25,shankH:25,shankW:25,holder:150,edge:16.5,thick:4.76,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'tri',lead:91,hand:'R',note:'Треугольник 60°: три кромки, выгоден по цене на черновой.'},
 wnmg:{name:'MWLNR 2525 M08 + WNMG 080408 · проходной 95°',group:'ext',operation:'external',
  diameter:0,workingLength:40,bodyD:25,shankH:25,shankW:25,holder:150,edge:8.7,thick:4.76,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'tri80',lead:95,hand:'R',note:'Тригон 80°: шесть кромок, жёсткая вершина для тяжёлой черновой.'},
 vnmg:{name:'SVJBR 2020 K16 + VBMT 160404 · профильный 93°',group:'ext',operation:'external',
  diameter:0,workingLength:35,bodyD:20,shankH:20,shankW:20,holder:125,edge:16.6,thick:4.76,minBore:0,nose:.4,pointAngle:0,
  shape:'turn',insert:'r35',lead:93,hand:'R',note:'Ромб 35°: заходит в узкие галтели и обратные конусы, но кромка слабая.'},
 dcmt:{name:'SDJCR 2020 K11 + DCMT 11T304 · чистовой 93°',group:'ext',operation:'external',
  diameter:0,workingLength:35,bodyD:20,shankH:20,shankW:20,holder:125,edge:11.6,thick:3.97,minBore:0,nose:.4,pointAngle:0,
  shape:'turn',insert:'r55',lead:93,hand:'R',note:'Позитивная пластина: лёгкое резание, чистовые проходы и тонкие детали.'},
 face:{name:'MSKNR 2525 M12 + SNMG 120408 · подрезной 75°',group:'ext',operation:'external',
  diameter:0,workingLength:38,bodyD:25,shankH:25,shankW:25,holder:150,edge:12.7,thick:4.76,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'sq',lead:75,hand:'R',note:'Квадрат 90°, четыре кромки. Торцевание и снятие корки.'},
 /* Расточные оправки: минимальный диаметр отверстия из каталога, он же в проверке столкновений. */
 ccmt:{name:'S16Q-SCLCR 09 + CCMT 09T304 · расточной 95°',group:'bore',operation:'boring',
  diameter:0,workingLength:80,bodyD:16,shankH:16,shankW:16,holder:180,edge:9.7,thick:3.97,minBore:20,nose:.4,pointAngle:0,
  shape:'bore',insert:'r80',lead:95,hand:'R',note:'Стальная оправка ⌀16. Вылет до 4 диаметров, отверстие от ⌀20.'},
 ccmt25:{name:'S25S-SCLCR 09 + CCMT 09T308 · расточной 95°',group:'bore',operation:'boring',
  diameter:0,workingLength:110,bodyD:25,shankH:25,shankW:25,holder:250,edge:9.7,thick:3.97,minBore:32,nose:.8,pointAngle:0,
  shape:'bore',insert:'r80',lead:95,hand:'R',note:'Оправка ⌀25 для глубокой расточки. Отверстие от ⌀32.'},
 sducr:{name:'S12M-SDUCR 07 + DCMT 070204 · расточной 93°',group:'bore',operation:'boring',
  diameter:0,workingLength:60,bodyD:12,shankH:12,shankW:12,holder:150,edge:7.7,thick:2.38,minBore:16,nose:.4,pointAngle:0,
  shape:'bore',insert:'r55',lead:93,hand:'R',note:'Тонкая оправка ⌀12 под малые отверстия от ⌀16.'},
 svucr:{name:'S16Q-SVUCR 11 + VCMT 110304 · профильный расточной',group:'bore',operation:'boring',
  diameter:0,workingLength:80,bodyD:16,shankH:16,shankW:16,holder:180,edge:11,thick:3.97,minBore:20,nose:.2,pointAngle:0,
  shape:'bore',insert:'r35',lead:93,hand:'R',note:'Ромб 35° внутри: галтели и поднутрения в отверстии.'},
 /* Канавочные и отрезные: ширина пластины и предельная глубина реза — главные размеры. */
 mgmn:{name:'MGEHR 2020-3 + MGMN300 · канавка 3 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:30,bodyD:20,shankH:20,shankW:20,holder:125,minBore:0,nose:.2,pointAngle:0,
  insertWidth:3,maxDepth:15,shape:'groove',lead:90,hand:'R',note:'Наружная канавка шириной 3 мм, глубина до 15 мм.'},
 mgmn2:{name:'MGEHR 2020-2 + MGMN200 · канавка 2 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:26,bodyD:20,shankH:20,shankW:20,holder:125,minBore:0,nose:.2,pointAngle:0,
  insertWidth:2,maxDepth:12,shape:'groove',lead:90,hand:'R',note:'Узкая канавка 2 мм: стопорные кольца и проточки под шлифовку.'},
 cutoff:{name:'Отрезной MGEHR 2525-3 · лезвие 3 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:45,bodyD:25,shankH:25,shankW:25,holder:150,minBore:0,nose:.2,pointAngle:0,
  insertWidth:3,maxDepth:32,shape:'groove',lead:90,hand:'R',note:'Отрезка прутка до ⌀64. Лезвие узкое, боковая нагрузка недопустима.'},
 mgivr:{name:'MGIVR 2016-2 + MGMN200 · внутренняя канавка',group:'groove',operation:'groove',
  diameter:0,workingLength:60,bodyD:16,shankH:16,shankW:16,holder:150,minBore:22,nose:.2,pointAngle:0,
  insertWidth:2,maxDepth:8,shape:'groovein',lead:90,hand:'R',note:'Канавка в отверстии от ⌀22, глубина до 8 мм.'},
 /* Резьбовые: профиль 60°, шаг задаёт пластина. */
 thread:{name:'SER 2020 K16 + 16ER · резьбовой наружный',group:'thr',operation:'thread',
  diameter:0,workingLength:35,bodyD:20,shankH:20,shankW:20,holder:125,minBore:0,nose:.1,pointAngle:60,
  shape:'thread',insert:'thr',lead:90,hand:'R',note:'Наружная метрическая. Шаг определяется пластиной, а не программой.'},
 threadin:{name:'SNR 0020 K16 + 16IR · резьбовой внутренний',group:'thr',operation:'thread',
  diameter:0,workingLength:90,bodyD:20,shankH:20,shankW:20,holder:200,minBore:25,nose:.1,pointAngle:60,
  shape:'threadin',insert:'thr',lead:90,hand:'R',note:'Внутренняя резьба в отверстии от ⌀25.'},
 /* Напайные резцы по ГОСТ: державка 25×16, твердосплавная пластина припаяна. */
 brazed:{name:'Напайной проходной прямой 25×16 · ГОСТ 18878',group:'brazed',operation:'external',
  diameter:0,workingLength:38,bodyD:16,shankH:16,shankW:25,holder:140,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'brz',lead:45,hand:'R',brazed:true,note:'Прямой проходной, φ 45°. После переточки нужна повторная привязка.'},
 brazed_bent:{name:'Напайной проходной отогнутый 25×16 · ГОСТ 18877',group:'brazed',operation:'external',
  diameter:0,workingLength:38,bodyD:16,shankH:16,shankW:25,holder:140,minBore:0,nose:1,pointAngle:0,
  shape:'turn',insert:'brz',lead:45,hand:'R',brazed:true,note:'Отогнутая головка: точение и подрезка торца одним резцом.'},
 brazed_up:{name:'Напайной проходной упорный 25×16 · ГОСТ 18879',group:'brazed',operation:'external',
  diameter:0,workingLength:38,bodyD:16,shankH:16,shankW:25,holder:140,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'brz',lead:90,hand:'R',brazed:true,note:'φ 90°: цилиндр и перпендикулярный уступ, почти не отжимает деталь.'},
 brazed_face:{name:'Напайной подрезной торцовый 25×16 · ГОСТ 18880',group:'brazed',operation:'external',
  diameter:0,workingLength:36,bodyD:16,shankH:16,shankW:25,holder:140,minBore:0,nose:.8,pointAngle:0,
  shape:'turn',insert:'brz',lead:75,hand:'R',brazed:true,note:'Торцевание от центра к периферии.'},
 brazed_bore:{name:'Напайной расточной проходной 20×20 · ГОСТ 18882',group:'brazed',operation:'boring',
  diameter:0,workingLength:70,bodyD:20,shankH:20,shankW:20,holder:170,minBore:26,nose:.8,pointAngle:0,
  shape:'bore',insert:'brz',lead:60,hand:'R',brazed:true,note:'Расточка сквозных отверстий от ⌀26.'},
 brazed_cut:{name:'Напайной отрезной 25×16 · ГОСТ 18874',group:'brazed',operation:'groove',
  diameter:0,workingLength:40,bodyD:16,shankH:16,shankW:25,holder:140,minBore:0,nose:.2,pointAngle:0,
  insertWidth:4,maxDepth:25,shape:'groove',lead:90,hand:'R',brazed:true,note:'Лезвие 4 мм. Отрезка и широкие канавки.'},
 brazed_thr:{name:'Напайной резьбовой 25×16 · ГОСТ 18885',group:'brazed',operation:'thread',
  diameter:0,workingLength:36,bodyD:16,shankH:16,shankW:25,holder:140,minBore:0,nose:.1,pointAngle:60,
  shape:'thread',insert:'brz',lead:90,hand:'R',brazed:true,note:'Профиль 60° затачивается по шаблону.'},
 /* Осевой инструмент: диаметр задаёт оператор, угол при вершине определяет форму дна. */
 drill:{name:'Сверло спиральное HSS 118° (Р6М5)',group:'axial',operation:'drill',
  diameter:10,workingLength:87,bodyD:10,holder:133,minBore:0,nose:0,pointAngle:118,
  shape:'axial',note:'Универсальное. Глубже 3⌀ только с выводом стружки, циклом G83 или G74.'},
 drill_carb:{name:'Сверло твердосплавное 140°',group:'axial',operation:'drill',
  diameter:10,workingLength:60,bodyD:10,holder:103,minBore:0,nose:0,pointAngle:140,
  shape:'axial',note:'Самоцентрирующееся, скорость втрое выше HSS. Требует жёсткости и СОЖ.'},
 drill_smp:{name:'Сверло со сменными пластинами 180°',group:'axial',operation:'drill',
  diameter:20,workingLength:60,bodyD:20,holder:120,minBore:0,nose:0,pointAngle:178,
  shape:'axial',note:'От ⌀16. Плоское дно, большой съём, обязателен подвод СОЖ через тело.'},
 centerdrill:{name:'Сверло центровочное ⌀4 · тип A 60°',group:'axial',operation:'centerdrill',
  diameter:4,workingLength:11,bodyD:10,holder:56,minBore:0,nose:0,pointAngle:60,
  shape:'axial',note:'Центровое отверстие под задний центр и как направление под сверло.'},
 tap:{name:'Метчик машинный M10×1,5',group:'axial',operation:'tap',
  diameter:10,workingLength:30,bodyD:10,holder:100,minBore:8.5,nose:0,pointAngle:0,
  shape:'axial',note:'Отверстие под резьбу ⌀8,5. Обороты постоянные, подача равна шагу.'},
 reamer:{name:'Развёртка машинная ⌀12 H7',group:'axial',operation:'drill',
  diameter:12,workingLength:52,bodyD:12,holder:151,minBore:11.8,nose:0,pointAngle:170,
  shape:'axial',note:'Снимает 0,1–0,3 мм. Отверстие должно быть предварительно расточено.'}
};
/* ============================================================
   Геометрия режущей части в миллиметрах — один источник и для рисунка,
   и для съёма металла, поэтому картинка и снятый металл разойтись не могут.

   Локальные координаты (u, v): u — вдоль Z, v — по радиусу наружу.
   Начало координат — программная точка кадра X/Z. У токарной пластины это
   не пересечение кромок, а угол габаритного прямоугольника дуги при вершине:
   касательные к дуге, параллельные Z и X. Поэтому цилиндр и торец выходят
   ровно на заданный размер, а конус и дуга — со смещением на радиус вершины,
   которое и компенсируют G41/G42.
   ============================================================ */

/* угол при вершине по форме пластины ISO: C 80° · D 55° · S 90° · T 60° · V 35° · W 80° */
const INSERT_EPS={r80:80,r55:55,r35:35,tri:60,tri80:80,sq:90,brz:80,thr:60};
function insertEps(spec){const v=Number(spec&&spec.eps);if(Number.isFinite(v)&&v>0)return v;return INSERT_EPS[spec&&spec.insert]||80;}
function toolShape(spec,op){
 return spec&&spec.shape||(op==='boring'?'bore':op==='groove'?'groove':op==='thread'?'thread':
  ['drill','centerdrill','tap'].includes(op)?'axial':'turn');
}
/* дуга окружности от угла a до угла b против часовой стрелки */
function arcPts(cu,cv,r,a,b,steps){
 const out=[];let hi=b;while(hi<a)hi+=Math.PI*2;
 /* Шаг мелкий намеренно: по хордам этой дуги строится огибающая, и на грубом шаге
    нижняя точка кромки не ложится ровно на v=0 — точёный цилиндр выходил бы на
    пару микрон больше заданного. Дуга считается один раз и кешируется. */
 const n=Math.max(8,steps||Math.ceil((hi-a)/0.02));
 for(let i=0;i<=n;i++){const t=a+(hi-a)*i/n;out.push([cu+Math.cos(t)*r,cv+Math.sin(t)*r]);}
 return out;
}

/* Режущая кромка проходного и расточного резца: главная кромка → дуга при
   вершине → вспомогательная. φ — главный угол в плане, ε — угол при вершине. */
function turnEdge(lead,eps,nose,reach){
 const r=Math.max(.02,nose),a1=(180-lead)*Math.PI/180,a2=a1-eps*Math.PI/180;
 const n1=[-Math.sin(a1),Math.cos(a1)],n2=[Math.sin(a2),-Math.cos(a2)];
 const cu=r,cv=r; /* центр дуги: на расстоянии rε от обеих касательных, поэтому (rε, rε) */
 const t1=[cu+r*n1[0],cv+r*n1[1]],t2=[cu+r*n2[0],cv+r*n2[1]];
 /* центр дуги (cu,cv) нужен компенсации G41/G42 — возвращаем его вместе с кромкой */
 const d1=[Math.cos(a1),Math.sin(a1)],d2=[Math.cos(a2),Math.sin(a2)];
 const L=Math.max(2,reach||10);
 return[[t1[0]+d1[0]*L,t1[1]+d1[1]*L]]
  .concat(arcPts(cu,cv,r,Math.atan2(n1[1],n1[0]),Math.atan2(n2[1],n2[0])))
  .concat([[t2[0]+d2[0]*L,t2[1]+d2[1]*L]]);
}
/* Канавочная и отрезная пластина: дно шириной по каталогу, углы скруглены.
   Программная точка — левый угол пластины, как задаёт корректор MGEHR. */
function grooveEdge(width,depth,nose,ref){
 const w=Math.max(.3,width),h=Math.max(1,depth),r=Math.max(.02,Math.min(nose,w/2.2));
 const shift=ref==='center'?-w/2:ref==='right'?-w:0;
 return[[shift,h]]
  .concat(arcPts(shift+r,r,r,Math.PI,Math.PI*1.5))
  .concat(arcPts(shift+w-r,r,r,Math.PI*1.5,Math.PI*2))
  .concat([[shift+w,h]]);
}
/* Резьбовая пластина: профиль стандартного угла, вершина скруглена.
   Программная точка — фактическая вершина: G76 задаёт внутренний Ø резьбы,
   и инструмент должен на него выйти. */
function threadEdge(angle,nose,height){
 const half=Math.max(10,Math.min(80,(angle||60)/2))*Math.PI/180,r=Math.max(.02,nose),h=Math.max(1,height||3);
 const cv=r/Math.sin(half),drop=cv-r,flank=Math.tan(half);
 const side=Math.PI/2-half;
 return[[-h*flank,h+drop]]
  .concat(arcPts(0,cv,r,Math.PI+side,Math.PI*2-side))
  .concat([[h*flank,h+drop]]).map(p=>[p[0],p[1]-drop]);
}
/* Осевой инструмент: заборный конус по углу при вершине, дальше цилиндр. */
function axialEdge(diameter,pointAngle,flute){
 const r=Math.max(.05,diameter/2),ang=Math.max(20,Math.min(178,pointAngle||118))*Math.PI/180;
 const cone=r/Math.tan(ang/2),len=Math.max(cone+1,flute||30);
 return[[0,0],[cone,r],[len,r]];
}

/* Полный силуэт инструмента: режущая кромка, замкнутая пластина и державка. */
function insertGeometry(spec,op){
 const lib=TOOL_LIBRARY[spec&&spec.kind]||null,g={...(lib||{}),...(spec||{})};
 const shape=toolShape(g,op);
 const nose=Math.max(0,Number(g.nose)||0);
 const shank=Math.max(4,Number(g.shankH)||Number(g.bodyD)||20);
 const work=Math.max(8,Number(g.workingLength)||30);
 const ic=Math.max(3,Number(g.ic)||Number(g.edge)||10);
 const hand=String(g.hand||'R').toUpperCase();
 const inner=shape==='bore'||shape==='groovein'||shape==='threadin';
 let edge,cut,holder,mode=inner?'inner':'outer';

 if(g.insert==='round'){
  /* круглая пластина RCMT/RPMT: вся кромка — дуга радиуса ic/2, углов в плане нет */
  const r=Math.max(.5,(Number(g.nose)||ic/2));
  edge=arcPts(r,r,r,Math.PI,Math.PI*2);
  cut=arcPts(r,r,r,0,Math.PI*2);
  holder=[[1.2,r*.6],[work,r*.6],[work,r*.6+shank],[1.2,r*.6+shank]];
  if(inner){const m=p=>[p[0],-p[1]];edge=edge.map(m);cut=cut.map(m);holder=holder.map(m);}
  return{shape,mode,edge,cut,holder,hand,shank,work,ic,nose:r,
   noseCentre:[r,inner?-r:r],brazed:!!g.brazed};
 }
 if(shape==='axial'){
  edge=axialEdge(Number(g.diameter)||0,Number(g.pointAngle)||118,work);
  const r=Math.max(.05,(Number(g.diameter)||0)/2),bodyR=Math.max(r,(Number(g.bodyD)||r*2)/2),end=edge[edge.length-1][0];
  return{shape,mode:'axis',edge,hand,shank,work,ic,nose,brazed:!!g.brazed,
   cut:edge.concat(edge.slice().reverse().map(p=>[p[0],-p[1]])),
   holder:[[end,bodyR],[end+14,bodyR],[end+14,-bodyR],[end,-bodyR]]};
 }

 if(shape==='groove'||shape==='groovein'){
  const w=Math.max(.3,Number(g.insertWidth)||3),depth=Math.max(2,Number(g.maxDepth)||12);
  edge=grooveEdge(w,depth,nose,g.ref||'left');
  const uA=edge[0][0],uB=edge[edge.length-1][0];
  cut=edge.concat([[uB,depth],[uA,depth]]);
  holder=[[uA-1,depth],[uB+1,depth],[uB+1,depth+shank],[uA-1,depth+shank]];
 }else if(shape==='thread'||shape==='threadin'){
  const height=Math.max(1.5,Number(g.profileHeight)||3);
  edge=threadEdge(Number(g.pointAngle)||60,nose||.1,height);
  cut=edge.slice();
  holder=[[-1.5,height],[work,height],[work,height+shank],[-1.5,height+shank]];
 }else{
  const lead=Math.max(30,Math.min(120,Number(g.lead)||95)),eps=insertEps(g),L=Math.min(ic,12);
  edge=turnEdge(lead,eps,nose,L);
  /* тело пластины: кромки заканчиваются вершинами, четвёртая вершина ромба
     достраивается через центр дуги — так силуэт выходит каталожного размера */
  const e1=edge[0],e2=edge[edge.length-1],tri=eps<=61;
  cut=tri?edge.slice():edge.concat([[e1[0]+e2[0]-nose,e1[1]+e2[1]-nose]]);
  const seat=Math.max(e1[1],e2[1])*.3;
  holder=[[1.2,seat],[work,seat],[work,seat+shank],[1.2,seat+shank]];
 }
 /* внутренний инструмент режет из отверстия наружу — тот же силуэт, отражённый по радиусу */
 if(inner){const m=p=>[p[0],-p[1]];edge=edge.map(m);cut=cut.map(m);holder=holder.map(m);}
 /* левый инструмент — зеркало по Z */
 if(hand==='L'){const m=p=>[-p[0],p[1]];edge=edge.map(m);cut=cut.map(m);holder=holder.map(m);}
 /* центр дуги при вершине относительно программной точки: у наружного правого
    резца это (rε, rε), у внутреннего и левого — с соответствующим знаком */
 const cn=shape==='groove'||shape==='groovein'||shape==='thread'||shape==='threadin'
  ?[0,inner?-nose:nose]:[hand==='L'?-nose:nose,inner?-nose:nose];
 return{shape,mode,edge,cut,holder,hand,shank,work,ic,nose,noseCentre:cn,brazed:!!g.brazed};
}

/* ------------------------------------------------------------
   Огибающая режущей кромки: для каждого смещения du вдоль Z — крайний
   радиус, которого кромка там достаёт. Ею и вычитаем металл, поэтому
   радиус при вершине, ширина канавки и профиль резьбы получаются сами.

   Вперёд огибающую ограничиваем зоной у вершины: дальше металл выносит
   уже не кромка, а корпус державки, а это отдельная модель и отдельная
   проверка столкновений.
   ------------------------------------------------------------ */
const ENV_STEP=.2,ENV_NONE=1e9;
const ENV_CACHE=new Map();
function profileEnvelope(geom){
 const key=geom.mode+'|'+geom.edge.map(p=>p[0].toFixed(3)+','+p[1].toFixed(3)).join(';');
 const hit=ENV_CACHE.get(key);if(hit)return hit;
 const axis=geom.mode==='axis',sign=geom.mode==='outer'?1:-1;
 /* назад — только скруглённая вершина, вперёд — вспомогательная кромка до 8 мм */
 const back=axis?0:Math.max(2,geom.nose*2+1.5),fwd=axis?Infinity:Math.max(3,Math.min(geom.ic,8));
 let lo=Infinity,hi=-Infinity;
 geom.edge.forEach(p=>{lo=Math.min(lo,p[0]);hi=Math.max(hi,p[0]);});
 if(!Number.isFinite(lo)){lo=0;hi=0;}
 lo=Math.max(lo,-back);hi=Math.min(hi,fwd);
 if(hi<lo)hi=lo;
 const u0=Math.floor(lo/ENV_STEP)*ENV_STEP,n=Math.max(2,Math.ceil((hi-u0)/ENV_STEP)+1);
 const v=new Float64Array(n).fill(ENV_NONE);
 /* храним крайнее значение со знаком: наружный резец опускает радиус, остальные поднимают */
 const put=(u,val)=>{const i=Math.round((u-u0)/ENV_STEP);if(i<0||i>=n)return;
  const w=val*sign;if(w<v[i])v[i]=w;};
 for(let i=1;i<geom.edge.length;i++){
  const p=geom.edge[i-1],q=geom.edge[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]);
  const steps=Math.max(1,Math.ceil(len/(ENV_STEP*.3)));
  for(let j=0;j<=steps;j++){const t=j/steps;put(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t);}
 }
 let extreme=ENV_NONE,extremeAt=0,first=-1,lastAt=-1;
 for(let i=0;i<n;i++){if(v[i]===ENV_NONE)continue;if(first<0)first=i;lastAt=i;
  if(v[i]<extreme){extreme=v[i];extremeAt=i;}}
 const env={u0,step:ENV_STEP,n,v,sign,first,last:lastAt,
  extreme:extreme===ENV_NONE?0:extreme*sign,extremeAt};
 if(ENV_CACHE.size>200)ENV_CACHE.clear();
 ENV_CACHE.set(key,env);
 return env;
}
/* значение огибающей в произвольной точке; NaN — инструмента здесь нет */
function envAt(env,du){
 const x=(du-env.u0)/env.step;
 if(x<env.first-.5||x>env.last+.5)return NaN;
 const i=Math.max(env.first,Math.min(env.last,Math.floor(x))),j=Math.min(env.last,i+1);
 const a=env.v[i],b=env.v[j];
 if(a===ENV_NONE&&b===ENV_NONE)return NaN;
 if(a===ENV_NONE)return b*env.sign;
 if(b===ENV_NONE)return a*env.sign;
 return (a+(b-a)*Math.max(0,Math.min(1,x-i)))*env.sign;
}
/* геометрия и огибающая для кадра, с кэшем по фактическим размерам инструмента */
const GEOM_CACHE=new Map();
function toolEnvelope(spec,op){
 const key=[spec&&spec.kind,op,spec&&spec.nose,spec&&spec.diameter,spec&&spec.pointAngle,
  spec&&spec.insertWidth,spec&&spec.maxDepth,spec&&spec.workingLength,spec&&spec.bodyD,spec&&spec.ref].join('|');
 let geom=GEOM_CACHE.get(key);
 if(!geom){geom=insertGeometry(spec,op);if(GEOM_CACHE.size>200)GEOM_CACHE.clear();GEOM_CACHE.set(key,geom);}
 return{geom,env:profileEnvelope(geom)};
}

/* ------------------------------------------------------------
   Каталог до основных исполнений ISO. Семейства, которые отличаются только
   размером, собираем таблицей: описание у них общее, меняются вписанная
   окружность пластины, сечение и вылет державки. Все размеры каталожные —
   именно они идут и в рисунок, и в проверку столкновений, и в съём металла.
   ------------------------------------------------------------ */
(function extendToolCatalog(){
 const add=(key,v)=>{if(!TOOL_LIBRARY[key])TOOL_LIBRARY[key]=v;};

 /* --- проходные со сменной пластиной: форма, угол в плане, правое и левое исполнение --- */
 const TURN=[
  /* ключ, обозначение державки, пластина, форма, ε, ic, φ, rε, толщина, сечение, длина, вылет, примечание */
  ['ccmt09','SCLCR 2020 K09','CCMT 09T304','r80',80,9.7,95,.4,3.97,20,125,35,'Позитивная пластина ⌀9,7: лёгкое резание, чистовые проходы и тонкие детали.'],
  ['ccmt12','SCLCR 2525 M12','CCMT 120408','r80',80,12.7,95,.8,4.76,25,150,40,'Позитив ⌀12,7 под получистовую: меньше сил резания, чем у негатива.'],
  ['snmg45','MSSNR 2525 M12','SNMG 120408','sq',90,12.7,45,.8,4.76,25,150,40,'Квадрат под φ 45°: точение и торцевание одним резцом, толстая стружка.'],
  ['vbmt11','SVJBR 1616 H11','VBMT 110304','r35',35,11,93,.4,3.97,16,125,32,'Ромб 35° на лёгкой державке 16×16: узкие галтели и мелкие детали.'],
  ['vcmt16','SVJCR 2020 K16','VCMT 160404','r35',35,16.6,107.5,.4,4.76,20,125,35,'φ 107,5°: копирование сложного контура и обратные конусы до 25°.'],
  ['dnmg107','SDJCR 2525 M15','DNMG 150604','r55',55,15.5,107.5,.4,6.35,25,150,40,'Ромб 55° под копирование: заходит в поднутрения, кромка слабее упорной.'],
  ['tnmg_l','PTGNL 2525 M16','TNMG 160408','tri',60,16.5,91,.8,4.76,25,150,40,'Треугольник, левое исполнение: работа от патрона к торцу.'],
  ['cnmg_l','PCLNL 2525 M12','CNMG 120408','r80',80,12.7,95,.8,4.76,25,150,40,'Основной черновой в левом исполнении: подача от патрона.'],
  ['dnmg_l','PDJNL 2525 M15','DNMG 150608','r55',55,15.5,93,.8,6.35,25,150,40,'Универсал 93° в левом исполнении.'],
  ['wnmg_l','MWLNL 2525 M08','WNMG 080408','tri80',80,8.7,95,.8,4.76,25,150,40,'Тригон в левом исполнении: шесть кромок на тяжёлой черновой.']
 ];
 TURN.forEach(([key,code,ins,form,eps,ic,lead,nose,thick,shank,holder,work,note])=>add(key,{
  name:code+' + '+ins+' · '+(key.endsWith('_l')?'левый ':'')+'проходной '+lead+'°',
  group:'ext',operation:'external',diameter:0,workingLength:work,bodyD:shank,shankH:shank,shankW:shank,
  holder,edge:ic,ic,eps,thick,minBore:0,nose,pointAngle:0,shape:'turn',insert:form,lead,
  hand:key.endsWith('_l')?'L':'R',note}));

 add('rcmt12',{name:'SRDCN 2525 M12 + RCMT 1204 · круглая пластина ⌀12',
  group:'ext',operation:'external',diameter:0,workingLength:40,bodyD:25,shankH:25,shankW:25,holder:150,
  edge:12,ic:12,eps:0,thick:4.76,minBore:0,nose:6,pointAngle:0,shape:'turn',insert:'round',lead:90,hand:'R',
  note:'Круглая пластина: самая прочная кромка и лучшая шероховатость, но большие радиальные силы. Радиус вершины равен половине ⌀.'});

 /* --- расточные оправки: главный размер — минимальный ⌀ отверстия --- */
 const BORE=[
  ['s08k','S08K-SCLCR 06','CCMT 06T204',8,10,60,100,6.4,.2,'Тонкая стальная оправка ⌀8: отверстия от ⌀10, вылет не более 3⌀.'],
  ['s10k','S10K-SCLCR 06','CCMT 06T204',10,12,70,125,6.4,.4,'Оправка ⌀10 под мелкие отверстия от ⌀12.'],
  ['s12scl','S12M-SCLCR 09','CCMT 09T304',12,16,70,150,9.7,.4,'Оправка ⌀12: рабочая лошадка для отверстий от ⌀16.'],
  ['s20r','S20R-SCLCR 09','CCMT 09T308',20,25,100,200,9.7,.8,'Оправка ⌀20 для глубокой расточки от ⌀25.'],
  ['s32t','S32T-PCLNR 12','CNMG 120408',32,40,140,300,12.7,.8,'Тяжёлая оправка ⌀32 с негативом: черновая расточка от ⌀40.'],
  ['s16sdq','S16Q-SDQCR 07','DCMT 070204',16,20,80,180,7.7,.4,'φ 107,5° внутри: копирование контура в отверстии.'],
  ['s16stf','S16Q-STFCR 11','TCMT 110204',16,20,80,180,11,.4,'Треугольная пластина внутри: три кромки, выгодна на серии.']
 ];
 BORE.forEach(([key,code,ins,bar,minBore,work,holder,ic,nose,note])=>add(key,{
  name:code+' + '+ins+' · расточной',group:'bore',operation:'boring',
  diameter:0,workingLength:work,bodyD:bar,shankH:bar,shankW:bar,holder,edge:ic,ic,
  eps:ins.startsWith('T')?60:ins.startsWith('D')?55:80,thick:3.97,minBore,nose,pointAngle:0,
  shape:'bore',insert:ins.startsWith('T')?'tri':ins.startsWith('D')?'r35':'r80',
  lead:ins.startsWith('D')?107.5:95,hand:'R',note}));

 /* --- канавочные и отрезные: ширина пластины и предельная глубина --- */
 const GROOVE=[[1,'MGMN100',6,16,125,32],[1.5,'MGMN150',8,16,125,32],[2.5,'MGMN250',13,20,125,30],
  [4,'MGMN400',18,25,150,40],[5,'MGMN500',20,25,150,45],[6,'MGMN600',22,25,150,45]];
 GROOVE.forEach(([w,ins,depth,shank,holder,work])=>add('mgmn'+String(w).replace('.','_'),{
  name:'MGEHR '+shank+shank+'-'+w+' + '+ins+' · канавка '+String(w).replace('.',',')+' мм',
  group:'groove',operation:'groove',diameter:0,workingLength:work,bodyD:shank,shankH:shank,shankW:shank,
  holder,minBore:0,nose:Math.min(.4,w/6),pointAngle:0,insertWidth:w,maxDepth:depth,shape:'groove',
  lead:90,hand:'R',ref:'left',note:'Наружная канавка '+String(w).replace('.',',')+' мм, глубина до '+depth+' мм. Боковая нагрузка недопустима.'}));
 add('mgehl3',{name:'MGEHL 2020-3 + MGMN300 · канавка 3 мм, левый',group:'groove',operation:'groove',
  diameter:0,workingLength:30,bodyD:20,shankH:20,shankW:20,holder:125,minBore:0,nose:.2,pointAngle:0,
  insertWidth:3,maxDepth:15,shape:'groove',lead:90,hand:'L',ref:'right',
  note:'Левое исполнение: программная точка — правый угол пластины.'});
 add('cutoff2',{name:'Отрезной MGEHR 2020-2 · лезвие 2 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:40,bodyD:20,shankH:20,shankW:20,holder:125,minBore:0,nose:.15,pointAngle:0,
  insertWidth:2,maxDepth:22,shape:'groove',lead:90,hand:'R',ref:'left',
  note:'Отрезка прутка до ⌀44. Узкое лезвие: подача плавная, без остановки в резе.'});
 add('cutoff4',{name:'Отрезной MGEHR 2525-4 · лезвие 4 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:50,bodyD:25,shankH:25,shankW:25,holder:150,minBore:0,nose:.3,pointAngle:0,
  insertWidth:4,maxDepth:40,shape:'groove',lead:90,hand:'R',ref:'left',
  note:'Отрезка прутка до ⌀80. Широкое лезвие держит подачу, но требует жёсткости.'});
 add('mgivr3',{name:'MGIVR 2520-3 + MGMN300 · внутренняя канавка 3 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:80,bodyD:20,shankH:20,shankW:20,holder:180,minBore:26,nose:.2,pointAngle:0,
  insertWidth:3,maxDepth:10,shape:'groovein',lead:90,hand:'R',ref:'left',
  note:'Канавка в отверстии от ⌀26, глубина до 10 мм.'});
 add('facegroove',{name:'Торцевой канавочный GX24 · 3 мм',group:'groove',operation:'groove',
  diameter:0,workingLength:35,bodyD:25,shankH:25,shankW:25,holder:150,minBore:0,nose:.2,pointAngle:0,
  insertWidth:3,maxDepth:20,shape:'groove',lead:90,hand:'R',ref:'left',
  note:'Кольцевая канавка по торцу. Радиус канавки задан державкой — сверьте его с чертежом.'});

 /* --- резьбовые: профиль задаёт пластина, а не программа --- */
 const THREAD=[
  ['thr11er','SER 1616 H11','11ER',60,16,125,30,'Наружная метрика мелкого шага 0,5–1,5 мм.'],
  ['thr22er','SER 2525 M22','22ER',60,25,150,40,'Наружная метрика крупного шага 3–6 мм.'],
  ['thr_w','SER 2020 K16','16ER W','55',20,125,35,'Дюймовая BSW/BSP: профиль 55°, шаг в нитках на дюйм.'],
  ['thr_tr','SER 2525 M22','22ER TR',30,25,150,40,'Трапецеидальная Tr: профиль 30°, обязательно несколько проходов.'],
  ['thr_npt','SER 2020 K16','16ER NPT',60,20,125,35,'Коническая дюймовая NPT 1:16: конус задаётся программой, профиль 60°.']
 ];
 THREAD.forEach(([key,code,ins,ang,shank,holder,work,note])=>add(key,{
  name:code+' + '+ins+' · резьбовой наружный',group:'thr',operation:'thread',
  diameter:0,workingLength:work,bodyD:shank,shankH:shank,shankW:shank,holder,minBore:0,nose:.1,
  pointAngle:Number(ang)||60,profileHeight:3,shape:'thread',insert:'thr',lead:90,hand:'R',note}));
 add('threadin22',{name:'SNR 0032 R22 + 22IR · резьбовой внутренний крупный',group:'thr',operation:'thread',
  diameter:0,workingLength:120,bodyD:32,shankH:32,shankW:32,holder:250,minBore:40,nose:.15,pointAngle:60,
  profileHeight:3,shape:'threadin',insert:'thr',lead:90,hand:'R',
  note:'Внутренняя метрика крупного шага в отверстии от ⌀40.'});

 /* --- напайные по ГОСТ --- */
 add('brazed_groove',{name:'Напайной прорезной 16×10 · ГОСТ 18874',group:'brazed',operation:'groove',
  diameter:0,workingLength:30,bodyD:10,shankH:10,shankW:16,holder:100,minBore:0,nose:.2,pointAngle:0,
  insertWidth:3,maxDepth:12,shape:'groove',lead:90,hand:'R',ref:'left',brazed:true,
  note:'Прорезной напайной: узкие канавки под стопорные кольца.'});
 add('brazed_bore_up',{name:'Напайной расточной упорный 20×20 · ГОСТ 18883',group:'brazed',operation:'boring',
  diameter:0,workingLength:70,bodyD:20,shankH:20,shankW:20,holder:170,edge:12,ic:12,eps:80,minBore:28,
  nose:.8,pointAngle:0,shape:'bore',insert:'brz',lead:95,hand:'R',brazed:true,
  note:'Расточка глухих отверстий от ⌀28 с подрезкой дна.'});

 /* --- осевой инструмент --- */
 const AXIAL=[
  ['drill_short','Сверло спиральное короткой серии HSS 118°','drill',10,52,98,118,0,'Жёсткое, до 3⌀ без вывода стружки. Лучший выбор, когда глубина позволяет.'],
  ['drill_long','Сверло спиральное длинной серии HSS 118°','drill',10,134,180,118,0,'Глубже 5⌀ только циклом G83 с полным выводом и СОЖ под давлением.'],
  ['spotdrill','Центровочное твердосплавное 90°','centerdrill',8,20,60,90,0,'Намечает точку под сверло и снимает фаску отверстия за один заход.'],
  ['centerdrill_b','Сверло центровочное ⌀4 · тип B 60/120°','centerdrill',4,11,56,60,0,'Тип B: конус 60° под центр плюс защитная фаска 120°.'],
  ['countersink90','Зенковка коническая 90°','drill',16,20,70,90,0,'Фаска под потайную головку. Обороты вдвое ниже сверления, иначе гранит.'],
  ['countersink120','Зенковка коническая 120°','drill',20,16,70,120,0,'Фаска под сварку и снятие заусенца в отверстии.'],
  ['reamer16','Развёртка машинная ⌀16 H7','drill',16,60,170,170,11.8,'Снимает 0,15–0,3 мм. Отверстие должно быть расточено, подача постоянная.'],
  ['tap_m6','Метчик машинный M6×1','tap',6,25,80,0,5,'Отверстие под резьбу ⌀5,0. Подача строго равна шагу.'],
  ['tap_m16','Метчик машинный M16×2','tap',16,40,120,0,14,'Отверстие под резьбу ⌀14,0. Момент большой — держите жёсткость.'],
  ['tap_fine','Метчик машинный M12×1,25','tap',12,32,100,0,10.8,'Мелкий шаг: отверстие ⌀10,8, стружка короче, но метчик капризнее.']
 ];
 AXIAL.forEach(([key,name,op,d,work,holder,ang,minBore,note])=>add(key,{
  name,group:'axial',operation:op,diameter:d,workingLength:work,bodyD:d,holder,minBore,nose:0,
  pointAngle:ang,shape:'axial',note}));
})();

function toolStation(value){const tv=Math.abs(Math.round(Number(value)||0));return tv>=100?Math.floor(tv/100):tv;}
function operationForKind(kind,fallback){return TOOL_LIBRARY[kind]&&TOOL_LIBRARY[kind].operation||fallback||'external';}
function defaultToolConfig(station,cfg,hint){const fallback={...(cfg||defaults())},stored=loadToolStore()[station]||{},kind=stored.kind||hint&&hint.kind||fallback.tool||'cnmg',base=TOOL_LIBRARY[kind]||TOOL_LIBRARY.cnmg,operation=stored.operation||hint&&hint.operation||(Number(station)===0?fallback.operation:operationForKind(kind,fallback.operation));return{station:Number(station)||0,code:hint&&hint.code||'',kind,operation,diameter:Number(stored.diameter??base.diameter)||0,workingLength:Number(stored.workingLength??base.workingLength)||0,bodyD:Number(stored.bodyD??base.bodyD)||0,minBore:Number(stored.minBore??base.minBore)||0,nose:Number(stored.nose??base.nose??fallback.nose)||0,pointAngle:Number(stored.pointAngle??base.pointAngle)||0,insertWidth:Number(stored.insertWidth??base.insertWidth)||3,maxDepth:Number(stored.maxDepth??base.maxDepth)||0,confirmed:stored.confirmed===true};}
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
function normalizeToolConfigs(cfg,catalog){const supplied=cfg&&cfg.toolConfigs||{},out={};(catalog||[]).forEach(item=>{const saved=supplied[item.station]||supplied[String(item.station)]||{},base=defaultToolConfig(item.station,cfg,item),kind=saved.kind||base.kind,lib=TOOL_LIBRARY[kind]||TOOL_LIBRARY.cnmg;out[item.station]={...base,...saved,station:item.station,code:item.code||base.code,kind,operation:saved.operation||base.operation||lib.operation,diameter:Number(saved.diameter??base.diameter),workingLength:Number(saved.workingLength??base.workingLength),bodyD:Number(saved.bodyD??base.bodyD),minBore:Number(saved.minBore??base.minBore),nose:Number(saved.nose??base.nose),pointAngle:Number(saved.pointAngle??base.pointAngle),insertWidth:Number(saved.insertWidth??base.insertWidth),maxDepth:Number(saved.maxDepth??base.maxDepth)||0,confirmed:saved.confirmed==null?base.confirmed:saved.confirmed===true};});return out;}

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

function validate(raw,forNc){
 const c={...defaults(),...raw},p=profile(),errors=[],warnings=[];
 if(!(c.stockD>=5&&c.stockD<=500))errors.push('Диаметр заготовки: 5–500 мм.');
 if(!(c.length>=10&&c.length<=1200))errors.push('Длина заготовки: 10–1200 мм.');
 if(!(c.grip>0&&c.grip<c.length))errors.push('Длина зажима должна быть меньше длины заготовки.');
 if(!(c.depth>0&&c.depth<=10))errors.push('Глубина резания должна быть больше 0 и не более 10 мм на сторону.');
 if(!(c.feed>0&&c.feed<=2))errors.push('Подача должна быть в диапазоне 0–2 мм/об.');
 if(!(c.rpm>0))errors.push('Обороты должны быть больше нуля.');
 if(p.maxRpm&&c.rpm>p.maxRpm)errors.push(`S${c.rpm} выше лимита профиля станка S${p.maxRpm}.`);
 if(!forNc)if(c.operation==='boring'){
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
/* Компенсация радиуса вершины G41/G42.
   Программная точка кадра — теоретическая вершина, то есть угол габаритного
   прямоугольника дуги. Чтобы кромка легла точно на контур, центр дуги должен
   стоять на нормали к контуру на расстоянии rε, а значит саму точку надо
   сдвинуть на (rε·n − c), где c — положение центра дуги относительно вершины.
   Без G41/G42 сдвига нет, и на конусе и дуге остаётся тот самый припуск,
   ради которого компенсацию и включают. */
function compensatedToolPath(points,mode,nose,centre){
 if(!mode||!(nose>0)||!points||points.length<2)return(points||[]).map(p=>({...p}));
 const c=centre||[nose,nose];
 return points.map((p,i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  const dz=b.z-a.z,dr=(b.x-a.x)/2,len=Math.hypot(dz,dr);
  if(!len)return{...p};
  const uz=dz/len,ur=dr/len;
  /* инструмент слева от направления при G41 и справа при G42 */
  const nz=mode===42?ur:-ur,nr=mode===42?-uz:uz;
  return{z:p.z+nose*nz-c[0],x:p.x+(nose*nr-c[1])*2};
 });
}

function parseGcode(code,rawCfg){
 const cfg={...defaults(),arcCenterDiameter:true,showCycles:true,...(rawCfg||{})},p=profile(),issues=[],segments=[],seen=new Set();
 const fanuc=cfg.dialect==='fanuc',dialectName=fanuc?'Fanuc':'Haas';
 const lines=String(code||'').split(/\r?\n/),records=lines.map((source,index)=>{const clean=stripGComments(source),parsed=parseWords(clean);return{source,index,line:index+1,clean,out:parsed.out,all:parsed.all,gs:parsed.all.filter(w=>w.key==='G').map(w=>Math.round(w.value)),ms:parsed.all.filter(w=>w.key==='M').map(w=>Math.round(w.value))};});
 const labels=new Map(),duplicateLabels=[];records.forEach(r=>{if(Number.isFinite(r.out.N)){const key=Math.round(r.out.N);if(labels.has(key))duplicateLabels.push({label:key,line:r.line});else labels.set(key,r.index);}});
 const catalog=detectToolCatalog(code,cfg),toolConfigs=normalizeToolConfigs({...cfg,toolConfigs:cfg.toolConfigs||{}},catalog);cfg.toolConfigs=toolConfigs;
 const add=(type,text,line,segment)=>{const key=`${type}:${text}:${line||0}`;if(seen.has(key))return;seen.add(key);issues.push({type,text,line:line||0});if(segment){segment.suspicious=true;(segment.reasons||(segment.reasons=[])).push(text);}};
 duplicateLabels.forEach(x=>add('bad',`Номер кадра N${x.label} повторяется: диапазоны P/Q неоднозначны.`,x.line));
 /* кадры контура между P и Q принадлежат циклу и не должны исполняться повторно как обычные ходы */
 const definitionLines=new Set();records.forEach(r=>{const cyc=r.gs.find(g=>[70,71,72,73].includes(g));if(cyc==null||!Number.isFinite(r.out.P)||!Number.isFinite(r.out.Q))return;const a=labels.get(Math.round(r.out.P)),b=labels.get(Math.round(r.out.Q));if(a==null||b==null||b<a){if(a==null)add('bad',`G${cyc}: кадр P${Math.round(r.out.P)} не найден.`,r.line);if(b==null)add('bad',`G${cyc}: кадр Q${Math.round(r.out.Q)} не найден.`,r.line);if(a!=null&&b!=null&&b<a)add('bad','Диапазон P/Q задан в обратном порядке.',r.line);return;}for(let i=a;i<=b;i++)definitionLines.add(i);});
 const freeLenAll=Math.max(1,cfg.length-cfg.grip);
 const stationSpec=station=>toolConfigs[station]||defaultToolConfig(station,cfg,{code:station?String(station).padStart(2,'0')+'01':''});
 let pos={x:cfg.stockD+12,z:6},motion='G00',unit=1,spindleMode='G97',g50=false,spindleOn=false,spindleStart=false,end=false,g99=false,g18=false,compMode=0,rpm=cfg.rpm,feed=cfg.feed,toolCode='',station=0,g71Depth=0,g71Retract=.5,g72Depth=0,g72Retract=.5,g73ShiftX=0,g73ShiftZ=0,g73Passes=1,g74Retract=.5,g75Retract=.5,g76Setup=null,g90Modal=null;
 const collisionMat=blankStock({...cfg,toolConfigs});
 const toPoint=(from,out,u=unit)=>{const to={...from};if(Number.isFinite(out.X))to.x=out.X*u;if(Number.isFinite(out.Z))to.z=out.Z*u;if(Number.isFinite(out.U))to.x=from.x+out.U*u;if(Number.isFinite(out.W))to.z=from.z+out.W*u;return to;};
 /* Fanuc задаёт глубины циклов в микронах без точки, Haas — в миллиметрах с точкой.
    В режиме Fanuc считаем микронами всегда; в режиме Haas доверяем десятичной точке. */
 const micron=(value,u=unit,word)=>{const v=Math.abs(Number(value)||0);if(!v)return 0;
  if(fanuc)return(word&&word.hasDecimal?v:v/1000)*u;
  return(word&&word.hasDecimal?v:v>50?v/1000:v)*u;};
 const wordOf=(r,key)=>r&&r.all&&r.all.find(w=>w.key===key)||null;
 const makeSegment=(from,to,opt={})=>{const spec=opt.toolSpec||stationSpec(opt.station==null?station:opt.station),m=opt.motion||motion,arc=m==='G02'||m==='G03',rapid=opt.rapid==null?m==='G00':!!opt.rapid,words=opt.words||{},rawPoints=opt.points||(arc?arcPath(from,to,words,m==='G02',cfg,opt.unit||unit):null)||[{...from},{...to}],activeComp=opt.compMode==null?compMode:opt.compMode,pts=!rapid&&activeComp?compensatedToolPath(rawPoints,activeComp,Math.max(0,spec.nose||0),(insertGeometry(spec,opt.operation||spec.operation||cfg.operation).noseCentre)):rawPoints,segment={from:{...pts[0]},to:{...pts[pts.length-1]},programmedFrom:{...from},programmedTo:{...to},programmedPoints:activeComp?rawPoints:null,points:pts,motion:m,line:opt.line||0,source:opt.source||'',clean:opt.clean||'',rapid,arc,cw:m==='G02',cutting:opt.cutting==null?(!rapid&&spindleOn):!!opt.cutting,spindle:spindleOn,rpm:opt.rpm||rpm,feed:opt.feed||feed,toolCode:opt.toolCode==null?toolCode:opt.toolCode,toolStation:spec.station||0,toolSpec:{...spec},operation:opt.operation||spec.operation||cfg.operation,compMode:activeComp,geometryCompensated:!!(!rapid&&activeComp&&spec.nose>0),cycle:opt.cycle||'',threadPitch:Number(opt.threadPitch)||0,threadStart:Number.isFinite(opt.threadStart)?opt.threadStart:null,synthetic:!!opt.synthetic,suspicious:false,reasons:[]};if(arc&&!(opt.points||arcPath(from,to,words,m==='G02',cfg,opt.unit||unit)))add('bad','Дуга G02/G03 не построена: проверьте R либо I/K и конечную точку.',segment.line,segment);return segment;};
 /* Столкновение быстрого хода ищем по всему силуэту пластины, а не по одному числу.
    Скалярный допуск «радиус при вершине» пропускал настоящий удар: при ходе вдоль Z
    самая низкая точка кромки приходится не на плоскость программной точки, а на
    rε дальше по Z, и там резец достаёт ровно до заданного радиуса. Зато он честно
    гасит ложную тревогу на отводе из реза, где скруглённый торец прохода оставлен
    самим же резцом. Возвращает true, если металл стоит выше силуэта. */
 const envHit=(segment,q,internal)=>{
  let t;try{t=toolEnvelope(segment.toolSpec||stationSpec(segment.toolStation),segment.operation);}catch(_){return null;}
  const env=t&&t.env;if(!env||!Number.isFinite(env.first))return null;
  const r=Math.abs(q.x)/2,last=collisionMat.z.length-1;
  /* Идём по узлам сетки заготовки и берём смещение кромки для этого узла — ровно так,
     как считает съём. Если перебирать шаг огибающей и потом округлять до узла, привязка
     разъезжается: скруглённый торец собственного прохода попадает в соседний узел и
     отвод из реза считается ударом. */
  const k0=Math.max(0,Math.min(last,Math.floor((q.z+env.u0+cfg.length)/cfg.length*last)));
  const k1=Math.max(0,Math.min(last,Math.ceil((q.z+env.u0+env.n*env.step+cfg.length)/cfg.length*last)));
  for(let k=k0;k<=k1;k++){
   const z=collisionMat.z[k];
   if(z>-.02||z<-freeLenAll)continue;
   const off=envAt(env,z-q.z);
   if(!Number.isFinite(off))continue;
   const toolR=r+off,outer=collisionMat.outer[k],inner=collisionMat.inner[k];
   if(internal){if(toolR>inner+.05&&toolR<outer-.05)return true;}
   else if(toolR<outer-.05&&(inner<=.05||toolR>inner+.05))return true;
  }
  return false;
 };
 const inspectAndPush=segment=>{
  const belowAxis=Math.min(segment.to.x,...segment.points.map(q=>q.x));
  /* уход за ось на пару миллиметров — штатная подрезка торца; глубже это уже описка в знаке */
  if(belowAxis<-AXIS_OVERRUN)add('bad','Отрицательная координата X: похоже на ошибку знака, резец уходит за ось на '+Math.abs(belowAxis).toFixed(1)+' мм.',segment.line,segment);
  /* предупреждаем один раз — по конечной точке кадра; отвод, начатый за осью, повторять незачем */
  else if(segment.to.x<0)add('warn','Резец переходит через ось (X'+segment.to.x.toFixed(2)+'): для подрезки торца это нормально, но проверьте вылет и корректор.',segment.line);
const spec=segment.toolSpec||stationSpec(segment.toolStation),op=segment.operation,freeLen=Math.max(1,cfg.length-cfg.grip),axial=['drill','centerdrill','tap'].includes(op),samples=segmentSamples(segment);if(segment.compMode&&!(spec.nose>0))add('bad','G41/G42 требует задать радиус вершины для активного инструмента.',segment.line,segment);
  if(axial&&samples.some(q=>q.z<=.05&&Math.abs(q.x)>.15))add('bad',`${op==='tap'?'Метчик':'Сверло'} идёт не по оси X0.`,segment.line,segment);
  if(axial&&Math.min(segment.from.z,segment.to.z)<-Math.max(.1,spec.workingLength||0))add('bad',`Рабочая длина инструмента ${spec.workingLength||0} мм меньше заданной глубины.`,segment.line,segment);
  for(const q of samples){const r=Math.abs(q.x)/2,k=Math.max(0,Math.min(collisionMat.z.length-1,Math.round((q.z+cfg.length)/cfg.length*(collisionMat.z.length-1)))),outer=collisionMat.outer[k],inner=collisionMat.inner[k];
   if(q.z<-freeLen&&r<cfg.stockD/2+Math.max(12,(spec.bodyD||0)/2)){add('bad','Траектория или корпус инструмента входит в заданную зону зажима/патрона.',segment.line,segment);break;}
   if(axial){const toolR=Math.max(0,(spec.diameter||0)/2),bodyR=Math.max(toolR,(spec.bodyD||0)/2);if(toolR<=0)add('bad','Для осевого инструмента не задан диаметр.',segment.line,segment);if(toolR>=outer-.2)add('bad','Диаметр осевого инструмента не оставляет стенку заготовки.',segment.line,segment);if(segment.rapid&&!segment.cycle&&q.z<0&&inner+0.05<toolR){add('bad','Быстрый ход осевого инструмента входит в неснятый металл.',segment.line,segment);break;}if(q.z<-(spec.workingLength||0)&&bodyR>inner+.05){add('bad','Корпус/патрон инструмента касается торца или отверстия.',segment.line,segment);break;}if(op==='tap'&&q.z<0&&inner+0.05<(spec.minBore||spec.diameter*.8)/2){add('bad','Отверстие под метчик меньше заданного минимального диаметра.',segment.line,segment);break;}}
   else if(op==='groove'&&spec.minBore&&inner*2+.05<spec.minBore&&q.z<=0){add('bad',`Внутреннему канавочному резцу нужно отверстие не меньше Ø${spec.minBore} мм.`,segment.line,segment);break;}
   else if(op==='boring'){if(spec.minBore&&inner*2+0.05<spec.minBore&&q.z<=0)add('bad',`Расточная оправка требует отверстие не меньше Ø${spec.minBore} мм.`,segment.line,segment);const hit=segment.rapid&&q.z<-.02&&q.z>=-freeLen&&envHit(segment,q,true)===true;if(hit){add('bad','Быстрый ход расточного резца пересекает текущую стенку отверстия.',segment.line,segment);break;}}
   else{const hit=segment.rapid&&q.z<-.02&&q.z>=-freeLen&&envHit(segment,q,false)===true;if(hit){add('bad','Быстрый ход G00 пересекает текущую поверхность заготовки.',segment.line,segment);break;}}
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
  if(gs.includes(18))g18=true;if(gs.includes(0))motion='G00';if(gs.includes(1))motion='G01';if(gs.includes(2))motion='G02';if(gs.includes(3))motion='G03';if(gs.some(g=>[0,1,2,3,70,71,72,73,74,75,76,81,83].includes(g)))g90Modal=null;
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
   if(Number.isFinite(out.K)&&gs.some(g=>[70,71].includes(g)))add('warn','Число повторов на Haas задаётся адресом L, а не K.',r.line);
  }
  if(gs.includes(28)||gs.includes(53))add('warn','G28/G53 показан только как программная линия: машинный ноль и реальная безопасная позиция проверяются на стойке.',r.line);
  if(Number.isFinite(out.S)&&spindleMode==='G97'&&p.maxRpm&&out.S>p.maxRpm)add('bad',`S${out.S} выше лимита профиля станка S${p.maxRpm}.`,r.line);
  if(gs.includes(71)&&!Number.isFinite(out.P)&&!Number.isFinite(out.Q)){if(Number.isFinite(out.U))g71Depth=Math.abs(out.U*unit);if(Number.isFinite(out.D))g71Depth=Math.abs(out.D*unit);if(Number.isFinite(out.R))g71Retract=Math.abs(out.R*unit);if(!g71Depth)add('bad','Первый кадр G71 должен задать глубину U/D.',r.line);return;}
  if(gs.includes(71)&&Number.isFinite(out.P)&&Number.isFinite(out.Q)){const contour=contourFor(r,spec);if(!contour.length)return;const pts=[];contour.forEach((s,i)=>{(s.points||[s.from,s.to]).forEach((q,j)=>{if(i||j)pts.push({...q});else pts.push({...q});});});let zDir=0,nonMonotonic=false;for(let i=1;i<pts.length;i++){const dz=pts[i].z-pts[i-1].z;if(Math.abs(dz)<1e-6)continue;const d=Math.sign(dz);if(zDir&&d!==zDir)nonMonotonic=true;zDir=zDir||d;}if(nonMonotonic){add('bad','G71 Type II с обратным ходом Z заблокирован: требуется монотонный контур Type I.',r.line);return;}const allowance=Math.abs(Number(out.U)||0)*unit,depth=Math.abs(Number(out.D)||g71Depth||cfg.depth),stepX=Math.max(.02,depth*2),
   /* сторону снятия определяет геометрия: если старт снаружи контура — наружная обработка,
      если внутри — расточка. Тип инструмента при этом только сверяется. */
   maxCx=Math.max(...pts.map(q=>q.x)),minCx=Math.min(...pts.map(q=>q.x)),
   external=pos.x>=maxCx-.001?true:pos.x<=minCx+.001?false:op!=='boring',
   targetXs=pts.map(q=>q.x+(external?allowance:-allowance)),limit=external?Math.min(...targetXs):Math.max(...targetXs),start={...pos};if(external!==(op!=='boring'))add('warn',external?'Контур снимается снаружи, а станции назначена расточка: сверьте тип инструмента.':'Контур снимается изнутри, а станции назначен наружный резец: сверьте тип инструмента.',r.line);
   let level=start.x,pass=0;while((external?level-stepX>limit+.001:level+stepX<limit-.001)&&pass<80){level+=external?-stepX:stepX;const cutPts=pts.map(q=>({z:q.z,x:external?Math.max(q.x+allowance,level):Math.min(q.x-allowance,level)})),entry=cutPts[0];if(Math.hypot(entry.z-pos.z,(entry.x-pos.x)/2)>.001)addLinear(pos,entry,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G71',synthetic:true});addPolyline(cutPts,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:`${r.clean} (ПРОХОД ${pass+1})`,toolSpec:spec,operation:op,cycle:'G71',synthetic:true});const last=cutPts.at(-1),away={x:last.x+(external?1:-1)*Math.max(.2,g71Retract*2),z:last.z};addLinear(last,away,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G71',synthetic:true});addLinear(away,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G71',synthetic:true});pos={...start};pass++;}if(pass>=80)add('bad','G71 потребовал более 80 проходов: проверьте глубину U/D и диаметры.',r.line);else if(!pass)add('warn','G71 не создал черновых слоёв: заготовка уже близка к контуру или неверна операция инструмента.',r.line);return;}
  if(gs.includes(70)){if(!Number.isFinite(out.P)||!Number.isFinite(out.Q)){add('bad','G70 должен содержать P и Q.',r.line);return;}const contour=contourFor(r,spec);if(!contour.length)return;for(const cs of contour){const seg={...cs,toolSpec:{...spec},cutting:cs.motion!=='G00'&&spindleOn,spindle:spindleOn,cycle:'G70',synthetic:true,suspicious:false,reasons:[]};inspectAndPush(seg);pos={...(cs.programmedTo||cs.to)};}return;}
  /* Простые токарные циклы в четыре хода. G90 точение, G94 подрезка торца, G92 резьба.
     В системе кодов B те же циклы называются G77, G78 и G79 — принимаем оба написания.
     Кадр без G-кода, но с координатами, повторяет предыдущий цикл: так задают проходы. */
  const simpleCode=gs.includes(90)||gs.includes(77)?'G90':gs.includes(94)||gs.includes(79)?'G94':gs.includes(92)||gs.includes(78)?'G92':null;
  const simpleRepeat=!simpleCode&&g90Modal&&!gs.length;
  if((simpleCode||simpleRepeat)&&['X','Z','U','W'].some(k=>Number.isFinite(out[k]))){
   const kind=simpleCode||g90Modal.kind;
   /* G92 без подачи и без активного резьбового цикла — это установка координат, а не резьба */
   if(kind==='G92'&&simpleCode&&!Number.isFinite(out.F)&&!(g90Modal&&g90Modal.kind==='G92')&&!Number.isFinite(feed)){
    add('warn','G92 без подачи прочитан как установка системы координат, а не как цикл резьбы.',r.line);return;}
   if(Number.isFinite(out.I)||Number.isFinite(out.K)&&kind!=='G92'){
    add('bad',`Конусный ${kind} с I/K заблокирован: направление и квадрант конуса неоднозначны.`,r.line);return;}
   const start={...pos},w={...out},prev=g90Modal&&g90Modal.kind===kind?g90Modal:null;
   if(!Number.isFinite(w.Z)&&!Number.isFinite(w.W)&&prev)w.Z=prev.z/unit;
   if(!Number.isFinite(w.X)&&!Number.isFinite(w.U)&&prev)w.X=prev.x/unit;
   const to=toPoint(start,w,unit);
   const mk=(a,b,rapid,cut)=>{if(Math.hypot(b.z-a.z,(b.x-a.x)/2)<.001)return;
    addLinear(a,b,{motion:rapid?'G00':'G01',rapid,cutting:cut&&spindleOn,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,operation:kind==='G92'?'thread':op,cycle:kind,synthetic:true,
     threadPitch:kind==='G92'?Math.abs(Number(w.F||feed)*unit)||0:0,threadStart:start.z});};
   if(kind==='G94'){ /* подрезка: подвод по Z, рез по X, отвод по Z, возврат по X */
    const zIn={x:start.x,z:to.z};mk(start,zIn,true,false);mk(zIn,{x:to.x,z:to.z},false,true);
    mk({x:to.x,z:to.z},{x:to.x,z:start.z},false,false);mk({x:to.x,z:start.z},start,true,false);
   }else{ /* точение и резьба: врезание по X, проход по Z, отвод по X, возврат по Z */
    const xIn={x:to.x,z:start.z};mk(start,xIn,true,false);mk(xIn,to,false,true);
    mk(to,{x:start.x,z:to.z},kind==='G92',false);mk({x:start.x,z:to.z},start,true,false);
   }
   g90Modal={kind,z:to.z,x:to.x};pos=start;return;}
  if(gs.includes(75)&&!Number.isFinite(out.X)){if(Number.isFinite(out.R))g75Retract=Math.abs(out.R*unit);return;}
  if(gs.includes(75)&&Number.isFinite(out.X)){if(op!=='groove')add('warn','G75 назначен инструменту не как канавочная операция.',r.line);
   /* полная глубина канавки известна сразу: сравниваем с вылетом пластины по каталогу */
   const gDepth=Math.abs(pos.x-out.X*unit)/2;
   if(spec.maxDepth&&gDepth>spec.maxDepth+.05)add('bad',`Канавка глубиной ${gDepth.toFixed(1)} мм: пластина шириной ${spec.insertWidth||3} мм рассчитана максимум на ${spec.maxDepth} мм.`,r.line);const start={...pos},targetZ=Number.isFinite(out.Z)?out.Z*unit:start.z,zDir=Math.sign(targetZ-start.z)||-1,zStep=Math.max(.01,Number.isFinite(out.K)?Math.abs(out.K*unit):Number.isFinite(out.Q)&&out.Q!==0?micron(out.Q,unit,wordOf(r,'Q')):Math.abs(targetZ-start.z)||1),zList=[];let zz=start.z,guardZ=0;while((zDir<0?zz>targetZ+.001:zz<targetZ-.001)&&guardZ++<100){zList.push(zz);zz=zDir<0?Math.max(targetZ,zz-zStep):Math.min(targetZ,zz+zStep);}zList.push(targetZ);const target=out.X*unit,dir=Math.sign(target-start.x)||-1,peck=Math.max(.02,Number.isFinite(out.I)?Math.abs(out.I*unit)*2:Number.isFinite(out.P)?micron(out.P,unit,wordOf(r,'P'))*2:Math.abs(target-start.x));for(const z of zList){const approach={x:start.x,z};if(Math.hypot(approach.z-pos.z,(approach.x-pos.x)/2)>.001)addLinear(pos,approach,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});let cur=start.x,guard=0;while((dir<0?cur>target+.001:cur<target-.001)&&guard++<100){const next=dir<0?Math.max(target,cur-peck):Math.min(target,cur+peck),a={x:cur,z},b={x:next,z};addLinear(a,b,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});if(next!==target){const back={x:next-dir*g75Retract*2,z};addLinear(b,back,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});addLinear(back,b,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});}cur=next;}pos={x:target,z};addLinear(pos,approach,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});pos=approach;}if(Math.hypot(pos.z-start.z,(pos.x-start.x)/2)>.001)addLinear(pos,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G75',synthetic:true});pos=start;return;}
  if(gs.includes(76)&&!Number.isFinite(out.X)){g76Setup={...out,line:r.line};return;}
  if(gs.includes(76)&&Number.isFinite(out.X)&&Number.isFinite(out.Z)){if(op!=='thread')add('warn','G76 назначен инструменту не как резьбовая операция.',r.line);const start={...pos},targetX=out.X*unit,targetZ=out.Z*unit,height=Number.isFinite(out.K)?Math.abs(out.K*unit):Number.isFinite(out.P)&&out.P>20?micron(out.P,unit,wordOf(r,'P')):Math.abs(start.x-targetX)/2,first=Number.isFinite(out.D)?Math.abs(out.D*unit):Number.isFinite(out.Q)?micron(out.Q,unit,wordOf(r,'Q')):height/2.5,rawPasses=first>0?Math.ceil((height/first)*(height/first)):6,passes=Math.max(3,Math.min(24,rawPasses));if(!(height>0&&first>0))add('bad','G76: не удалось определить высоту профиля и глубину первого прохода.',r.line);if(rawPasses>24)add('warn',`G76 расчётно требует ${rawPasses} проходов; в эмуляторе показаны первые 24.`,r.line);for(let i=1;i<=passes;i++){const q=i/passes,level=start.x-(start.x-targetX)*Math.sqrt(q),entry={x:level,z:start.z};addLinear(i===1?start:{x:start.x,z:start.z},entry,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G76',synthetic:true});const endPt={x:level,z:targetZ};addLinear(entry,endPt,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:`${r.clean} (ПРОХОД ${i})`,toolSpec:spec,cycle:'G76',synthetic:true,threadPitch:Math.abs(Number(out.F)*unit)||0,threadStart:start.z});const clear={x:start.x+2,z:targetZ};addLinear(endPt,clear,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G76',synthetic:true});addLinear(clear,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G76',synthetic:true});}pos=start;return;}
  if(gs.includes(74)&&!Number.isFinite(out.Z)){if(Number.isFinite(out.R))g74Retract=Math.abs(out.R*unit);return;}
  const axialCycle=gs.find(g=>[81,83].includes(g))||(gs.includes(74)&&Number.isFinite(out.Z)&&['drill','centerdrill','tap'].includes(op)?74:0);
  if(gs.includes(74)&&Number.isFinite(out.Z)&&!axialCycle){add('bad','G74 неоднозначен: назначьте станции сверление либо используйте поддерживаемую отдельную операцию торцевой канавки.',r.line);return;}
  if(axialCycle){if(!['drill','centerdrill','tap'].includes(op)){add('bad',`G${axialCycle} требует назначить станции осевой инструмент.`,r.line);return;}const start={...pos},axisX=Number.isFinite(out.X)?out.X*unit:start.x,rPlane=Number.isFinite(out.R)?out.R*unit:Math.max(1,start.z),depth=Number.isFinite(out.Z)?out.Z*unit:NaN;if(!Number.isFinite(depth)){add('bad',`G${axialCycle}: не задана глубина Z.`,r.line);return;}if(Number.isFinite(out.Q)&&out.Q<=0)add('bad',`G${axialCycle}: шаг Q должен быть больше нуля.`,r.line);const hasVariable=['I','J','K'].some(k=>Number.isFinite(out[k]));if(Number.isFinite(out.Q)&&hasVariable)add('bad',`G${axialCycle}: нельзя одновременно задавать Q и I/J/K.`,r.line);if(hasVariable&&(!(out.I>0)||!(out.K>0)||Number(out.J)<0))add('bad',`G${axialCycle}: для переменного клевка нужны I>0, J≥0 и K>0.`,r.line);let at={x:axisX,z:start.z};if(Math.hypot(at.z-pos.z,(at.x-pos.x)/2)>.001)addLinear(pos,at,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});if(Math.abs(at.z-rPlane)>.001){const q={x:axisX,z:rPlane};addLinear(at,q,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});at=q;}let peck=axialCycle===81?Math.abs(depth-rPlane):Math.max(.05,Number.isFinite(out.Q)?micron(out.Q,unit,wordOf(r,'Q')):hasVariable?Math.abs(out.I*unit):Math.min(Math.abs(depth-rPlane),Math.max(1,(spec.diameter||5)*1.5)));const minPeck=hasVariable?Math.max(.05,Math.abs(out.K*unit)):peck,peckDrop=hasVariable?Math.max(0,Math.abs((out.J||0)*unit)):0,dir=Math.sign(depth-rPlane)||-1;let z=at.z,guard=0;while((dir<0?z>depth+.001:z<depth-.001)&&guard++<200){const next=dir<0?Math.max(depth,z-peck):Math.min(depth,z+peck),tip={x:axisX,z:next};addLinear({x:axisX,z},tip,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});z=next;peck=Math.max(minPeck,peck-peckDrop);if(z!==depth){const retract={x:axisX,z:axialCycle===83?rPlane:z-dir*Math.max(.2,g74Retract)};addLinear(tip,retract,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});addLinear(retract,{x:axisX,z},{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});}}const retract={x:axisX,z:rPlane};addLinear({x:axisX,z:depth},retract,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:`G${axialCycle}`,synthetic:true});pos=retract;return;}
  /* G72 — черновой поперечный: слои снимаются плоскостями по Z, от торца вглубь.
     Первый кадр задаёт глубину слоя W (или D) и отход R, второй — диапазон P/Q и припуски. */
  if(gs.includes(72)&&!Number.isFinite(out.P)&&!Number.isFinite(out.Q)){
   if(Number.isFinite(out.W))g72Depth=Math.abs(out.W*unit);
   if(Number.isFinite(out.D))g72Depth=Math.abs(out.D*unit);
   if(Number.isFinite(out.R))g72Retract=Math.abs(out.R*unit);
   if(!g72Depth)add('bad','Первый кадр G72 должен задать глубину слоя W/D.',r.line);
   return;}
  if(gs.includes(72)&&Number.isFinite(out.P)&&Number.isFinite(out.Q)){
   const contour=contourFor(r,spec);if(!contour.length)return;
   const pts=[];contour.forEach(s=>(s.points||[s.from,s.to]).forEach(q=>pts.push({...q})));
   let dir=0,bad=false;for(let i=1;i<pts.length;i++){const dx=pts[i].x-pts[i-1].x;if(Math.abs(dx)<1e-6)continue;const d=Math.sign(dx);if(dir&&d!==dir)bad=true;dir=dir||d;}
   if(bad){add('bad','G72 требует монотонный по X контур: обратный ход заблокирован.',r.line);return;}
   const allowZ=Math.abs(Number(out.W)||0)*unit,allowX=Math.abs(Number(out.U)||0)*unit;
   const depth=Math.abs(Number(out.D)||g72Depth||cfg.depth),step=Math.max(.05,depth);
   const start={...pos},targetZs=pts.map(q=>q.z+allowZ),limit=Math.min(...targetZs);
   let level=start.z,pass=0;
   while(level-step>limit+.001&&pass<80){
    level-=step;
    const cutPts=pts.map(q=>({z:Math.max(q.z+allowZ,level),x:q.x+(op==='boring'?-allowX:allowX)}));
    const entry=cutPts[0];
    if(Math.hypot(entry.z-pos.z,(entry.x-pos.x)/2)>.001)
     addLinear(pos,entry,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G72',synthetic:true});
    addPolyline(cutPts,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:`${r.clean} (ПРОХОД ${pass+1})`,toolSpec:spec,operation:op,cycle:'G72',synthetic:true});
    /* отход из реза: сперва вдоль Z от стенки, затем по X наружу и только потом возврат */
    const last=cutPts[cutPts.length-1],away={x:last.x,z:last.z+Math.max(.2,g72Retract)},clear={x:start.x,z:away.z};
    addLinear(last,away,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G72',synthetic:true});
    addLinear(away,clear,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G72',synthetic:true});
    addLinear(clear,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G72',synthetic:true});
    pos={...start};pass++;}
   if(pass>=80)add('bad','G72 потребовал более 80 слоёв: проверьте глубину W/D.',r.line);
   else if(!pass)add('warn','G72 не создал черновых слоёв: заготовка уже близка к контуру.',r.line);
   return;}
  /* G73 — повтор контура со сходящимся смещением: заготовка уже близка к форме детали. */
  if(gs.includes(73)&&!Number.isFinite(out.P)&&!Number.isFinite(out.Q)){
   if(Number.isFinite(out.U))g73ShiftX=Math.abs(out.U*unit);
   if(Number.isFinite(out.I))g73ShiftX=Math.abs(out.I*unit);
   if(Number.isFinite(out.W))g73ShiftZ=Math.abs(out.W*unit);
   if(Number.isFinite(out.K))g73ShiftZ=Math.abs(out.K*unit);
   if(Number.isFinite(out.R))g73Passes=Math.max(1,Math.min(60,Math.round(Math.abs(out.R))));
   if(Number.isFinite(out.D))g73Passes=Math.max(1,Math.min(60,Math.round(Math.abs(out.D))));
   return;}
  if(gs.includes(73)&&Number.isFinite(out.P)&&Number.isFinite(out.Q)){
   const contour=contourFor(r,spec);if(!contour.length)return;
   const pts=[];contour.forEach(s=>(s.points||[s.from,s.to]).forEach(q=>pts.push({...q})));
   const shiftX=Number.isFinite(out.I)?Math.abs(out.I*unit):g73ShiftX,shiftZ=Number.isFinite(out.K)?Math.abs(out.K*unit):g73ShiftZ;
   const n=Math.max(1,Math.min(60,Number.isFinite(out.R)?Math.round(Math.abs(out.R)):g73Passes));
   if(!(shiftX>0||shiftZ>0)){add('bad','G73: не заданы припуски смещения U/W (I/K).',r.line);return;}
   const allowX=Math.abs(Number(out.U)||0)*unit,allowZ=Math.abs(Number(out.W)||0)*unit,start={...pos},outer=op!=='boring';
   for(let i=0;i<n;i++){
    const q=n>1?1-i/(n-1):0; /* от полного смещения к нулю */
    const cutPts=pts.map(p=>({z:p.z+allowZ+shiftZ*q,x:p.x+(outer?1:-1)*(allowX+shiftX*2*q)}));
    const entry=cutPts[0];
    addLinear(pos,entry,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G73',synthetic:true});
    addPolyline(cutPts,{motion:'G01',rapid:false,cutting:spindleOn,line:r.line,source:r.source,clean:`${r.clean} (ПРОХОД ${i+1})`,toolSpec:spec,operation:op,cycle:'G73',synthetic:true});
    const last=cutPts[cutPts.length-1],off={x:last.x+(outer?2:-2),z:last.z},clear={x:off.x,z:start.z};
    addLinear(last,off,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G73',synthetic:true});
    addLinear(off,clear,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G73',synthetic:true});
    addLinear(clear,start,{motion:'G00',rapid:true,cutting:false,line:r.line,source:r.source,clean:r.clean,toolSpec:spec,cycle:'G73',synthetic:true});
    pos={...start};}
   return;}
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

/* Заготовка — радиальное поле по Z: outer[k] и inner[k] на равномерной сетке z[k].
   Шаг держим около 0,5 мм: этого хватает и на фаску, и на дно сверла, а типизированные
   массивы дают дешёвое копирование — оно нужно на каждом кадре анимации. */
function blankStock(cfg,count){
 const len=Math.max(1,Number(cfg.length)||1);
 count=count||Math.min(1401,Math.max(181,Math.round(len*2)+1));
 const z=new Float64Array(count),outer=new Float64Array(count),inner=new Float64Array(count);
 const bore=Math.max(0,Number(cfg.boreD)||0);
 /* Отверстие в заготовке есть у трубы и у заведомо просверленной детали под расточку.
    Просто ненулевое поле «исходный Ø» дырку в прутке не делает — иначе сверление
    показывалось бы по сквозному отверстию, которого на станке нет. */
 const ri=(cfg.stock==='tube'||cfg.operation==='boring')&&bore>0?bore/2:0,r0=Math.max(ri+.1,(Number(cfg.stockD)||1)/2);
 for(let i=0;i<count;i++){z[i]=-len+i*len/(count-1);outer[i]=r0;inner[i]=ri;}
 return{z,outer,inner,step:len/(count-1)};
}
/* z общий для всех копий: сетка не меняется, копируем только металл */
function cloneStock(mat){return{z:mat.z,outer:Float64Array.from(mat.outer),inner:Float64Array.from(mat.inner),step:mat.step};}
/* Диапазонный экстремум огибающей. Она унимодальна — падает к вершине и
   растёт после неё, — поэтому минимум на отрезке берётся без перебора. */
function envRange(env,duLo,duHi){
 const lo=Math.max(env.first,Math.ceil((duLo-env.u0)/env.step));
 const hi=Math.min(env.last,Math.floor((duHi-env.u0)/env.step));
 if(hi<lo||env.first<0)return NaN;
 if(env.extremeAt>=lo&&env.extremeAt<=hi)return env.extreme;
 return env.v[env.extremeAt<lo?lo:hi]*env.sign;
}

/* Съём металла одним кадром. Заготовка — радиальное поле по Z; из него
   вычитается развёртка режущей кромки, взятая из того же силуэта, что и
   рисуется на сцене. Отсюда сами собой получаются радиус при вершине,
   ширина канавки, профиль резьбы и конус на дне отверстия.
   portion<1 — кадр пройден частично. */
function applySegmentCut(mat,seg,cfg,portion=1){
 if(!seg||!seg.cutting||portion<=0)return mat;
 const pts=seg.points&&seg.points.length>1?seg.points:[seg.from,seg.to];
 if(pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)||p.x<-AXIS_OVERRUN))return mat;
 const op=seg.operation||cfg.operation,spec=seg.toolSpec||defaultToolConfig(seg.toolStation||0,cfg);
 /* метчик режет резьбу в готовом отверстии и диаметра не прибавляет */
 if(op==='tap')return mat;
 const {geom,env}=toolEnvelope(spec,op);
 if(env.first<0)return mat;
 const outer=geom.mode==='outer';
 const last=mat.z.length-1,step=mat.step||cfg.length/Math.max(1,last);
 const kAt=z=>Math.max(0,Math.min(last,Math.round((z-mat.z[0])/step)));
 const free=-Math.max(1,cfg.length-cfg.grip),limit=Math.max(0,Math.min(1,portion));
 const zLo=free-.05,zHi=.05;
 const envLo=env.u0+env.first*env.step,envHi=env.u0+env.last*env.step;

 /* один узел сетки */
 const put=(k,cand)=>{
  if(!Number.isFinite(cand))return;
  if(outer){if(cand<mat.outer[k])mat.outer[k]=Math.max(mat.inner[k],cand);}
  else if(cand>mat.inner[k])mat.inner[k]=Math.min(cand,mat.outer[k]);
 };

 /* пройденная часть траектории: длину считаем по радиусу, а не по диаметру */
 const spans=[];let total=0;
 for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i].z-pts[i-1].z,(pts[i].x-pts[i-1].x)/2);spans.push(d);total+=d;}

 const profileStep=step,faceAtZero=Math.abs(seg.to.z-seg.from.z)<1e-6&&Math.abs(seg.to.z)<=profileStep*.55;
 if(faceAtZero)return mat;

 /* Подрезка торца выносит слой и дальше вылета кромки — там металл сметает уже
    корпус державки. Ближнюю зону формирует огибающая, поэтому здесь начинаем
    за её пределом и обрываемся на первой нетронутой ступени выше точки входа. */
 const faceSlab=(p,q,take,shift)=>{
  if(!outer||op==='groove'||op==='thread')return false;
  if(Math.abs(q.z-p.z)>=.05||Math.abs(q.x-p.x)<=.05)return false;
  if(q.x>p.x)return false; /* движение от оси наружу — это отвод, а не подрезка */
  const zc=q.z,rA=Math.abs(p.x)/2,rB=Math.abs(q.x)/2;
  const rMin=Math.min(rA,rB)+(shift||0),rMax=Math.max(rA,rB);
  if(zc>.05||zc<free-.05)return false;
  const kc=kAt(zc);
  if(rMax<mat.outer[kc]-.05)return false; /* резец вошёл сбоку, а не с торца */
  const reach=Math.max(0,rMin+(rMax-rMin)*(1-Math.max(0,Math.min(1,take))));
  for(let k=kAt(zc+envHi);k<=last&&mat.z[k]<=.05;k++){
   if(mat.outer[k]>rMax+.05)break; /* дальше стоит ступень выше входа резца */
   if(reach<mat.outer[k])mat.outer[k]=Math.max(mat.inner[k],reach);
  }
  return true;
 };

 let remain=total*limit;
 for(let i=1;i<pts.length&&remain>1e-8;i++){
  const p=pts[i-1],q=pts[i],d=spans[i-1],take=Math.min(1,d?remain/d:1);
  const dz=q.z-p.z,dx=q.x-p.x,dr=dx/2,len=Math.hypot(dz,dr),normalR=len?dz/len:0;
  const shift=0; /* компенсация уже внесена в точки траектории */
  const endZ=p.z+dz*take,endX=p.x+dx*take;
  const zA=Math.min(p.z,endZ),zB=Math.max(p.z,endZ);
  const kA=Math.max(0,kAt(zA+envLo)),kB=Math.min(last,kAt(zB+envHi));

  if(op==='thread'&&seg.threadPitch>0&&Math.abs(dz)>1e-6){
   /* Винтовая канавка: в осевом разрезе это ряд впадин через шаг, а не сплошная
      проточка до внутреннего Ø. Накладываем профиль пластины на витках. */
   const pitch=Math.max(.2,seg.threadPitch),base=Number.isFinite(seg.threadStart)?seg.threadStart:pts[0].z;
   const from=Math.ceil((zA-base)/pitch),to=Math.floor((zB-base)/pitch);
   for(let m=from;m<=to;m++){
    const zc=base+m*pitch;
    if(zc<zA-1e-6||zc>zB+1e-6)continue;
    const t=Math.abs(dz)>1e-9?(zc-p.z)/dz:0;
    const r0=Math.max(0,Math.abs(p.x+dx*t)/2+shift);
    const j0=Math.max(0,kAt(zc+envLo)),j1=Math.min(last,kAt(zc+envHi));
    for(let k=j0;k<=j1;k++){
     const z=mat.z[k];if(z>zHi||z<zLo)continue;
     const e=envAt(env,z-zc);
     if(Number.isFinite(e))put(k,r0+e);
    }
   }
  }else if(Math.abs(dx)<1e-9){
   /* Проход постоянного радиуса — а это почти вся программа. Для каждого узла
      берём экстремум огибающей на отрезке сразу, без перебора точек. */
   const r0=Math.max(0,Math.abs(p.x)/2+shift);
   for(let k=kA;k<=kB;k++){
    const z=mat.z[k];if(z>zHi||z<zLo)continue;
    const e=envRange(env,z-zB,z-zA);
    if(Number.isFinite(e))put(k,r0+e);
   }
  }else{
   /* Конус и дуга: радиус меняется, идём по точкам вдоль хода и накладываем
      огибающую. Такие участки короткие, перебор здесь недорог.
      Сетку точек привязываем к началу кадра и считаем от ПОЛНОЙ длины, а не от
      пройденной: иначе выборка частичного прохода не вложена в выборку полного,
      попадает между его точками и снимает на десяток микрон больше — при
      перемотке деталь чуть менялась бы на конусах и дугах. */
   const full=Math.hypot(dz,dr);
   const steps=Math.max(1,Math.ceil(full/Math.min(.25,step)));
   const cutAt=t=>{
    const z0=p.z+dz*t,r0=Math.max(0,Math.abs(p.x+dx*t)/2+shift);
    const j0=Math.max(0,kAt(z0+envLo)),j1=Math.min(last,kAt(z0+envHi));
    for(let k=j0;k<=j1;k++){
     const z=mat.z[k];if(z>zHi||z<zLo)continue;
     const e=envAt(env,z-z0);
     if(Number.isFinite(e))put(k,r0+e);
    }
   };
   for(let j=0;j<=steps;j++){
    const t=j/steps;
    if(t>take+1e-12)break;
    cutAt(t);
   }
   /* и всегда сама текущая точка инструмента: там он стоит на самом деле */
   if(take>1e-12)cutAt(take);
  }
  faceSlab(p,q,take,shift);
  remain-=d*take;
 }
 return mat;
}
function stockProfile(result,cfg,upto,partial){const mat=blankStock(cfg),segs=result&&result.segments||[],end=Math.max(0,Math.min(segs.length,Number.isFinite(upto)?upto:segs.length));for(let i=0;i<end;i++)applySegmentCut(mat,segs[i],cfg,1);if(segs[end]&&partial>0)applySegmentCut(mat,segs[end],cfg,partial);return mat;}
/* Полный пересчёт программы стоит десятки миллисекунд, а кадров в секунду — шестьдесят.
   Держим снимок металла на границе кадра и опорные снимки через равные промежутки:
   вперёд идём доливая по одному кадру, назад — от ближайшей опоры. */
function makeCutter(result,cfg){
 const segs=result&&result.segments||[],stride=Math.max(24,Math.ceil(segs.length/40));
 const marks=[{index:0,mat:blankStock(cfg)}];
 let cur=cloneStock(marks[0].mat),curIndex=0;
 const advanceTo=index=>{
  /* стартуем с ближайшего опорного снимка: и назад, и при прыжке далеко вперёд
     это ограничивает доигрывание одним промежутком между опорами */
  let best=marks[0];for(let i=marks.length-1;i>=0;i--)if(marks[i].index<=index){best=marks[i];break;}
  if(curIndex>index||curIndex<best.index){cur=cloneStock(best.mat);curIndex=best.index;}
  while(curIndex<index&&segs[curIndex]){
   applySegmentCut(cur,segs[curIndex],cfg,1);curIndex++;
   if(curIndex%stride===0&&marks[marks.length-1].index<curIndex)marks.push({index:curIndex,mat:cloneStock(cur)});
  }
  return cur;
 };
 return{
  segments:segs.length,
  at(index,partial){
   const end=Math.max(0,Math.min(segs.length,Number.isFinite(index)?index:segs.length)),base=advanceTo(end);
   if(!(partial>0)||!segs[end])return base;
   const view=cloneStock(base);applySegmentCut(view,segs[end],cfg,partial);return view;
  }
 };
}
/* Итог по детали: считаем только там, где металл ещё есть — срезанный торец
   не должен показываться как «минимальный наружный Ø 0». */
function summarizeGeometry(mat,cfg,segments){
 const free=-Math.max(1,cfg.length-cfg.grip),solid=[];
 for(let i=0;i<mat.z.length;i++)if(mat.z[i]>=free-.001&&mat.z[i]<=.05&&mat.outer[i]-mat.inner[i]>.05)solid.push(i);
 let minWall=0,maxHoleD=0,minOuterD=cfg.stockD,partLen=0;
 if(solid.length){
  minWall=Infinity;minOuterD=Infinity;
  solid.forEach(i=>{minWall=Math.min(minWall,mat.outer[i]-mat.inner[i]);maxHoleD=Math.max(maxHoleD,mat.inner[i]*2);minOuterD=Math.min(minOuterD,mat.outer[i]*2);});
  partLen=(mat.z[solid[solid.length-1]]-mat.z[solid[0]]);
 }
 let gripClear=Infinity;
 (segments||[]).forEach(seg=>(seg.points||[seg.from,seg.to]).forEach(q=>{
  if(q.z>=free&&q.x/2<cfg.stockD/2+Math.max(12,(seg.toolSpec&&seg.toolSpec.bodyD||0)/2))gripClear=Math.min(gripClear,q.z-free);}));
 return{minWall:Number((minWall===Infinity?0:minWall).toFixed(3)),maxHoleD:Number(maxHoleD.toFixed(3)),
  minOuterD:Number((minOuterD===Infinity?cfg.stockD:minOuterD).toFixed(3)),partLen:Number(partLen.toFixed(2)),
  gripClear:Number.isFinite(gripClear)?Number(gripClear.toFixed(3)):null};
}
/* Подбор заготовки по программе. Наружный Ø берём только по кадрам наружной обработки:
   сверление и расточка идут у оси и занизили бы пруток до диаметра отверстия. */
function inferStock(result,cfg){
 const segs=result&&result.segments||[],cut=segs.filter(s=>s.cutting),basis=cut.length?cut:segs;
 const inner=['drill','centerdrill','tap','boring'];
 const all=[],radial=[];
 basis.forEach(seg=>{
  const axial=inner.includes(seg.operation||'');
  (seg.points||[seg.to]).forEach(p=>{
   if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return;
   all.push(p);if(!axial)radial.push(p);});
 });
 if(!all.length)return{stockD:cfg.stockD,length:cfg.length,grip:cfg.grip};
 const maxX=Math.max(...(radial.length?radial:all).map(p=>Math.abs(p.x)));
 const minZ=Math.min(...all.map(p=>p.z));
 const calculatedD=Math.min(500,Math.max(5,Math.ceil((maxX+4)/5)*5));
 /* программа только по отверстию наружный размер не задаёт — оставляем введённый */
 const stockD=radial.length?calculatedD:Math.max(cfg.stockD,calculatedD);
 const grip=Math.max(10,Math.min(120,Number(cfg.grip)||25));
 const length=Math.min(1200,Math.max(10,Math.ceil((Math.abs(Math.min(0,minZ))+grip+10)/10)*10));
 return{stockD,length,grip:Math.min(grip,Math.max(10,length*.25))};
}
function buildPlayback(cfg,result){const m=buildModel(cfg);m.nc=result;m.segment=0;m.progress=0;m.direction=1;m.totalPasses=Math.max(1,result&&result.segments?result.segments.length:1);m.cutter=makeCutter(result,m.cfg);m.material=m.cutter.at(0,0);return m;}

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
 const flat=viewState.flat!==false,theme=viewState.codeTheme==='night'?'night':'cimco';
 const layer=(key,label,title)=>`<button data-lsim-view="${key}" aria-pressed="${pressed(key)}" title="${h(title)}">${label}</button>`;
 return `<div class="wrap lsim-wrap"><div class="card" data-lsim-back style="display:flex;align-items:center;gap:10px;padding:11px 13px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg><span style="font-family:Oswald;letter-spacing:.08em;text-transform:uppercase;font-size:12px">К рабочим инструментам</span></div>

 <div class="experimental-warning"><b>ЭКСПЕРИМЕНТАЛЬНЫЙ 2D-РЕЖИМ</b><span>Контур и столкновения могут быть показаны неточно для неподдерживаемых циклов, макросов и фактической оснастки. Проверьте итоговый профиль и каждый T; перед станком обязательны GRAPHICS и SINGLE BLOCK.</span></div>
 <div class="lsim-modebar" role="group" aria-label="Режимы эмулятора">
  <div class="lsim-moderow"><span>ВИД</span>
   <button data-lsim-mode="flat" aria-pressed="${flat}" title="Осевой разрез: виден снятый металл, отверстия и размеры">2D разрез</button>
   <button data-lsim-mode="solid" aria-pressed="${!flat}" title="Объёмная сцена: патрон, деталь и инструмент">2.5D объём</button></div>
  <div class="lsim-moderow"><span>СТОЙКА</span>
   <button data-lsim-dialect="haas" aria-pressed="${c.dialect!=='fanuc'}" title="Разбор циклов по правилам Haas">HAAS</button>
   <button data-lsim-dialect="fanuc" aria-pressed="${c.dialect==='fanuc'}" title="Разбор циклов по правилам Fanuc">FANUC</button></div>
  <div class="lsim-moderow"><span>КОД</span>
   <button data-lsim-codetheme="cimco" aria-pressed="${theme==='cimco'}" title="Цвета адресов как в CIMCO Edit, светлый фон">CIMCO</button>
   <button data-lsim-codetheme="night" aria-pressed="${theme==='night'}" title="Те же цвета адресов на тёмном фоне">ТЁМНАЯ</button></div>
  <small class="lsim-modehint" id="lsimDialectHint">${c.dialect==='fanuc'?'Fanuc: P/Q циклов в микронах, повтор K, G71 двумя кадрами':'Haas: P/Q как задано, глубина D и I/K в мм, повтор L'}</small>
 </div>

 <div class="card lsim-gcode-card"><div class="lsim-controls-title"><b>1. Программа</b><span>ЭМУЛЯТОР CNC · ${c.dialect==='fanuc'?'FANUC':'HAAS'}</span></div>
  <p class="lsim-help">Графика строится из кадров X/Z. <b>G0 не снимает металл</b>; циклы раскрываются в рабочие и возвратные ходы, а каждая станция T получает свою геометрию. Кадр с ошибкой подсвечивается прямо в тексте.</p>
  <div class="gk lsim-editor" data-gk-theme="${theme}"><div class="gk-gutter" id="lsimGutter" aria-hidden="true"></div><div class="gk-body"><pre class="gk-hl" id="lsimGcodeHL" aria-hidden="true"></pre><textarea id="lsimGcode" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" wrap="off" aria-label="Текст NC-программы" placeholder="O0100&#10;G21 G18 G40 G99&#10;G50 S2500&#10;G97 S800 M03&#10;T0101&#10;G00 X64. Z2.&#10;..."></textarea></div></div>
  <input id="lsimGFile" type="file" accept=".nc,.txt,.tap,.cnc,.mpf,text/plain" hidden>
  <div class="lsim-g-actions"><button class="btn ghost" id="lsimGFileBtn">Открыть NC</button><button class="btn ghost" id="lsimGDemo">Учебный пример</button><button class="btn ghost" id="lsimSampleTurn">Пример точения</button><button class="btn" id="lsimGAnalyze">Проверить и показать</button></div>
  <div id="lsimGReport" class="lsim-g-report" aria-live="polite"><span>После проверки программа, траектория и активный кадр будут синхронизированы.</span></div></div>

 <div id="lsimToolSetup" class="card lsim-tool-setup" hidden></div>

 <details class="lsim-layers" open><summary><span>Слои и масштаб</span><i>⌄</i></summary>
  <div class="lsim-layers-body">
   <div class="lsim-zoom"><button id="lsimZoomOut" title="Уменьшить">−</button><button id="lsimZoomFit" title="Показать всё">FIT</button><button id="lsimZoomIn" title="Увеличить">+</button><button id="lsimFull" title="Во весь экран" aria-pressed="false">⛶</button></div>
   <div class="lsim-view-buttons">${layer('showRapid','G0','Быстрые ходы G00 пунктиром')}${layer('showDots','ТОЧКИ','Конечные точки кадров')}${layer('showArcs','ДУГИ','Дуги G02/G03')}${layer('showStock','ЗАГОТОВКА','Заготовка, патрон и снятый металл')}${layer('showTool','РЕЗЕЦ','Инструмент в реальных габаритах')}${layer('showPath','ПУТЬ','Траектория инструмента')}${layer('showCycles','ЦИКЛЫ','Раскрытые проходы циклов G71/G75/G76/G83')}${layer('showGrid','СЕТКА','Сетка и линейки Ø и Z')}<button data-lsim-toolscale aria-pressed="${viewState.toolScale!=='schematic'}" title="Инструмент в реальном масштабе: державка 25×25 занимает столько же, сколько на станке">1:1</button></div>
  </div></details>

 <div class="lsim-stage"><canvas id="lsimCanvas" width="960" height="460" role="img" aria-label="Эмулятор CNC: разрез токарной программы: патрон, заготовка, снятие материала и активный инструмент">Ваш браузер не поддерживает Canvas.</canvas><div class="lsim-hud"><span>КАДР <b id="lsimPass">0 / 0</b></span><span>ПОЗИЦИЯ <b id="lsimPos">X— Z—</b></span><span>ШПИНДЕЛЬ <b id="lsimRpm">S${c.rpm}</b></span><span>ИНСТРУМЕНТ <b id="lsimActiveTool">T—</b></span></div><div class="lsim-axis"><span>−Z · ПАТРОН / ЗАЖИМ</span><span>Z0 · ТОРЕЦ</span></div>
  <div class="lsim-fsbar" aria-label="Управление в полном экране"><button type="button" data-fs="reset" title="В начало">|◀</button><button type="button" data-fs="back" title="Кадр назад">◀|</button><button type="button" data-fs="play" title="Пуск / пауза">▶</button><button type="button" data-fs="step" title="Кадр вперёд">|▶</button><button type="button" data-fs="fit" title="Показать всё">FIT</button><button type="button" data-fs="exit" title="Выйти из полного экрана">✕</button></div></div>
 <div class="lsim-stockline" id="lsimStockLine" aria-live="polite"></div>
 <div class="lsim-hint-gest">Тяните деталь пальцем · щипок или колесо — масштаб · двойное нажатие — сброс · ⛶ во весь экран</div>

 <div class="lsim-pass-track" aria-hidden="true"><i id="lsimTrack" style="width:0"></i></div><div class="lsim-legend"><span><i></i>текущая поверхность</span><span class="rapid"><i></i>G0 быстрый</span><span class="line"><i></i>G1 линия</span><span class="cw"><i></i>G2</span><span class="ccw"><i></i>G3</span><span class="insert"><i></i>пластина / напайка</span></div>
 <div class="lsim-transport"><div class="lsim-actions transport"><button class="btn ghost" id="lsimReset" title="В начало">|◀</button><button class="btn ghost" id="lsimReverse" title="Назад непрерывно">◀</button><button class="btn ghost" id="lsimBack" title="Предыдущий кадр">◀|</button><button class="btn ghost" id="lsimStep" title="Следующий кадр">|▶</button><button class="btn" id="lsimStart" title="Пуск / пауза" aria-pressed="false">▶</button><button class="btn ghost" id="lsimEnd" title="В конец">▶|</button></div><label class="lsim-speed"><span>Скорость</span><input id="lsimSpeed" data-lsim-field type="range" min="1" max="8" step="1" value="${c.speed}"><b id="lsimSpeedValue">×${c.speed}</b></label><div id="lsimStatus" class="lsim-status" aria-live="polite"></div></div>
 <div class="lsim-code-sync gk" data-gk-theme="${theme}"><div class="lsim-active-block"><span>АКТИВНЫЙ КАДР</span><b id="lsimActiveBlock">— программа не загружена —</b></div><div id="lsimCodeWindow" class="lsim-code-window"></div></div>

 <div class="card" style="margin-top:11px"><div class="lsim-controls-title"><b>2. Заготовка</b><span>${h(p.name)} · MAX S${n(p.maxRpm)||'—'}</span></div>
 <label class="lsim-autostock"><input type="checkbox" id="lsimAutoStock" data-lsim-field ${viewState.autoStock!==false?'checked':''}><span><b>Подбирать заготовку по программе</b><small>Размер берётся из траектории при каждой проверке NC — как автоматическая заготовка в CIMCO. Снимите галочку, чтобы задать размеры вручную.</small></span></label>
 <div class="lsim-form-grid">
  <label class="fld"><span>Тип заготовки</span><select id="lsimStock" data-lsim-field><option value="solid" ${c.stock==='solid'?'selected':''}>Круглый пруток</option><option value="tube" ${c.stock==='tube'?'selected':''}>Труба / отверстие</option><option value="forging" ${c.stock==='forging'?'selected':''}>Поковка</option></select></label>
  <label class="fld"><span>Патрон</span><select id="lsimChuck" data-lsim-field><option value="3jaw" ${c.chuck==='3jaw'?'selected':''}>3-кулачковый</option><option value="4jaw" ${c.chuck==='4jaw'?'selected':''}>4-кулачковый</option><option value="collet" ${c.chuck==='collet'?'selected':''}>Цанга</option></select></label>
  <label class="fld"><span>Ø заготовки, мм</span><input id="lsimStockD" data-lsim-field type="number" min="5" max="500" step="0.1" value="${c.stockD}"></label><label class="fld"><span>Длина, мм</span><input id="lsimLength" data-lsim-field type="number" min="10" max="1200" step="1" value="${c.length}"></label>
  <label class="fld"><span>Длина зажима, мм</span><input id="lsimGrip" data-lsim-field type="number" min="1" step="1" value="${c.grip}"></label>
  <label class="fld"><span id="lsimBoreLabel">Ø отверстия в заготовке, мм</span><input id="lsimBoreD" data-lsim-field type="number" min="0" step="0.1" value="${c.boreD}"></label>
 </div><button class="btn ghost" id="lsimFitStock">Подогнать заготовку по NC сейчас</button></div>

 <details class="card lsim-more"><summary><b>3. Учебная модель без NC</b><span>Резерв: контур, инструмент и режимы вручную</span></summary>
 <p class="lsim-help">Этот раздел нужен, только когда программы нет: эмулятор строит показательный контур по введённым размерам. Когда NC загружена, всё берётся из кадров.</p>
 <div class="lsim-form-grid">
  <label class="fld"><span>Операция</span><select id="lsimOperation" data-lsim-field><option value="external" ${c.operation==='external'?'selected':''}>Наружная проточка / торцевание</option><option value="boring" ${c.operation==='boring'?'selected':''}>Расточка отверстия</option><option value="groove" ${c.operation==='groove'?'selected':''}>Наружная канавка</option></select></label>
  <label class="fld" data-lsim-show="external"><span>Контур</span><select id="lsimContour" data-lsim-field><option value="straight" ${c.contour==='straight'?'selected':''}>Прямой цилиндр</option><option value="step" ${c.contour==='step'?'selected':''}>Ступенчатый вал</option><option value="chamfer" ${c.contour==='chamfer'?'selected':''}>Цилиндр с фаской 2×45°</option></select></label>
  <label class="fld"><span id="lsimTargetLabel">Целевой Ø, мм</span><input id="lsimTargetD" data-lsim-field type="number" min="1" step="0.1" value="${c.targetD}"></label>
  <label class="fld" data-lsim-show="step"><span>Второй Ø ступени, мм</span><input id="lsimStepD" data-lsim-field type="number" min="1" step="0.1" value="${c.stepD}"></label>
  <label class="fld" data-lsim-show="step,groove"><span id="lsimStepLabel">Длина ступени, мм</span><input id="lsimStepLen" data-lsim-field type="number" min="1" step="1" value="${c.stepLen}"></label>
  <label class="fld"><span>Резец / осевой инструмент</span><select id="lsimTool" data-lsim-field>${toolOptions(c.tool)}</select></label>
  <label class="fld"><span>Радиус вершины, мм</span><select id="lsimNose" data-lsim-field>${[.2,.4,.8,1.2,1.6].map(v=>'<option value="'+v+'" '+(Math.abs(c.nose-v)<1e-6?'selected':'')+'>'+String(v).replace('.',',')+'</option>').join('')}</select></label>
  <label class="fld"><span>Глубина ap, мм/сторону</span><input id="lsimDepth" data-lsim-field type="number" min="0.05" max="10" step="0.05" value="${c.depth}"></label>
  <label class="fld"><span>Подача F, мм/об</span><input id="lsimFeed" data-lsim-field type="number" min="0.01" max="2" step="0.01" value="${c.feed}"></label>
  <label class="fld"><span>Обороты S, об/мин</span><input id="lsimRpmInput" data-lsim-field type="number" min="1" step="10" value="${c.rpm}"></label>
 </div><div class="lsim-checks"><label><input type="checkbox" id="lsimCoolant" data-lsim-field ${c.coolant?'checked':''}>Показывать СОЖ</label><label><input type="checkbox" id="lsimChips" data-lsim-field ${c.chips?'checked':''}>Показывать стружку</label><label><input type="checkbox" id="lsimDiameterArc" data-lsim-field ${c.arcCenterDiameter?'checked':''}>I в диаметральном режиме</label><label><input type="checkbox" id="lsimShowCycles" data-lsim-field ${c.showCycles?'checked':''}>Раскрывать циклы</label></div><button class="btn ghost" id="lsimBuild">Перестроить модель</button></details>

 <div class="lsim-disclaimer"><b>Эмулятор CNC — проверка формы и типовых опасностей, а не разрешение на Cycle Start.</b> Модель не знает фактические кулачки, вылет державки, корректор, заднюю бабку и машинный ноль. Обязательны Haas GRAPHICS, SINGLE BLOCK, низкий Rapid Override, проверка нулей и пробный проход над деталью.</div>${CREDIT}</div>`;
}

function showSimulator(){
 $('#ttl').textContent='Эмулятор CNC';$('#sub').textContent='Каждый T, циклы, сверление, снятие металла и опасные ходы';
 $('#searchbox').style.display='none';$('#chips').style.display='none';$('#mseg').style.display='none';drawNav();
 gcodeResult=null;ensureGkStyles();$('#screen').innerHTML=simulatorView();editorLine=-1;editorText=null;if(root){root.dataset.app='chpu';root.dataset.section='control';}
 bind();numFix();$('#screen').scrollTop=0;applyForm(false);syncEditor(true);consumeHandoff();
}

function consumeHandoff(){
 const item=window.RazryadEmulator&&window.RazryadEmulator.take?window.RazryadEmulator.take():null;
 if(!item||!item.code||!$('#lsimGcode'))return false;
 $('#lsimGcode').value=item.code;analyzePastedGcode(false);
 const report=$('#lsimGReport');if(report)report.insertAdjacentHTML('afterbegin',`<div class="lsim-import-source"><b>${h(item.title||'NC-программа')}</b><span>Передано из ${h(item.source||'приложения')}</span></div>`);
 toast('Код передан в эмулятор CNC');return true;
}

function openWithCode(code,meta){
 const item={code:String(code||'').trim(),title:meta&&meta.title||'NC-программа',source:meta&&meta.source||'РАЗРЯД',created:Date.now()};
 if(!item.code)return false;
 if(window.RazryadEmulator&&window.RazryadEmulator.store)window.RazryadEmulator.store(item);
 tab='work';folder='simx';geoCase=null;rank=null;filter='Все';deeper();try{history.replaceState({...history.state,razryadEmulatorRoute:true},'',location.href);}catch(_){}render();return true;
}

function readForm(){
 const val=id=>{const e=$(id);return e?e.value:''};
 return{dialect:load().dialect||'haas',operation:val('#lsimOperation'),stock:val('#lsimStock'),contour:val('#lsimContour'),stockD:n(val('#lsimStockD')),length:n(val('#lsimLength')),boreD:n(val('#lsimBoreD')),targetD:n(val('#lsimTargetD')),stepD:n(val('#lsimStepD')),stepLen:n(val('#lsimStepLen')),chuck:val('#lsimChuck'),grip:n(val('#lsimGrip')),tool:val('#lsimTool'),nose:n(val('#lsimNose')),depth:n(val('#lsimDepth')),feed:n(val('#lsimFeed')),rpm:n(val('#lsimRpmInput')),speed:n(val('#lsimSpeed'))||1,coolant:!!($('#lsimCoolant')&&$('#lsimCoolant').checked),chips:!!($('#lsimChips')&&$('#lsimChips').checked),arcCenterDiameter:!!($('#lsimDiameterArc')&&$('#lsimDiameterArc').checked),showCycles:!!($('#lsimShowCycles')&&$('#lsimShowCycles').checked),toolConfigs:collectToolConfigs()};
}

function updateVisibility(){
 const op=$('#lsimOperation')?$('#lsimOperation').value:'external',contour=$('#lsimContour')?$('#lsimContour').value:'straight',
  stock=$('#lsimStock')?$('#lsimStock').value:'solid';
 document.querySelectorAll('[data-lsim-show]').forEach(x=>{const keys=x.dataset.lsimShow.split(',');x.style.display=(keys.includes(op)||keys.includes(contour))?'':'none';});
 const target=$('#lsimTargetLabel');if(target)target.textContent=op==='boring'?'Целевой Ø расточки, мм':op==='groove'?'Ø дна канавки, мм':'Целевой Ø, мм';
 const step=$('#lsimStepLabel');if(step)step.textContent=op==='groove'?'Ширина канавки, мм':'Длина ступени, мм';
 /* поле отверстия имеет смысл только там, где оно у заготовки действительно есть */
 const boreLabel=$('#lsimBoreLabel'),boreField=$('#lsimBoreD'),hasBore=stock==='tube'||op==='boring';
 if(boreLabel)boreLabel.textContent=stock==='tube'?'Ø отверстия трубы, мм':op==='boring'?'Ø готового отверстия под расточку, мм':'Ø отверстия (у прутка его нет)';
 if(boreField&&boreField.parentElement)boreField.parentElement.classList.toggle('muted',!hasBore);
 const autoOn=viewState.autoStock!==false;
 ['#lsimStockD','#lsimLength','#lsimGrip'].forEach(id=>{const e=$(id);if(e&&e.parentElement)e.parentElement.classList.toggle('auto',autoOn);});
 const fit=$('#lsimFitStock');if(fit)fit.textContent=autoOn?'Пересчитать заготовку по NC':'Подогнать заготовку по NC сейчас';
 updateStockLine();
}

/* Что за заготовка на сцене и что из неё вышло — одной строкой под кадром. */
function updateStockLine(){
 const el=$('#lsimStockLine');if(!el)return;
 const c=simState?simState.cfg:readForm();
 const kind={solid:'пруток',tube:'труба',forging:'поковка'}[c.stock]||'пруток';
 const hasBore=(c.stock==='tube'||c.operation==='boring')&&n(c.boreD)>0;
 const g=gcodeResult&&gcodeResult.geometry;
 el.innerHTML='<span>ЗАГОТОВКА <b>Ø'+n(c.stockD)+' × '+n(c.length)+' мм</b> · '+kind+
  (hasBore?' · отверстие Ø'+n(c.boreD):'')+' · зажим '+n(c.grip)+' мм'+
  (viewState.autoStock!==false?' · <i>подбор по NC</i>':'')+'</span>'+
  (g?'<span>ДЕТАЛЬ <b>Ø'+g.minOuterD.toFixed(2)+'</b> · отверстие Ø'+g.maxHoleD.toFixed(2)+' · стенка '+g.minWall.toFixed(2)+' мм</span>':'');
}

/* Записать подобранную заготовку в форму: одно место для кнопки и для авторежима. */
function applyStockFit(fit){
 if(!fit)return false;
 const set=(id,v)=>{const e=$(id);if(e)e.value=v;};
 set('#lsimStockD',fit.stockD);set('#lsimLength',fit.length);set('#lsimGrip',Math.round(fit.grip));
 return true;
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
/* Список инструмента с отбором: каталог перевалил за семь десятков позиций,
   и без поиска по обозначению им уже неудобно пользоваться. */
function toolOptions(selected,query){
 const q=String(query||'').trim().toLowerCase();
 const match=(key,v)=>!q||key.toLowerCase().includes(q)||String(v.name).toLowerCase().includes(q);
 let html=TOOL_GROUPS.map(([g,label])=>{
  const list=Object.entries(TOOL_LIBRARY).filter(([key,v])=>v.group===g&&(key===selected||match(key,v)));
  if(!list.length)return'';
  return '<optgroup label="'+h(label)+'">'+list.map(([key,v])=>
   '<option value="'+key+'" '+(key===selected?'selected':'')+'>'+h(v.name)+'</option>').join('')+'</optgroup>';
 }).join('');
 if(!html)html='<option value="'+h(selected||'cnmg')+'" selected>— по запросу ничего не найдено —</option>';
 return html;
}
function collectToolConfigs(){const out={};document.querySelectorAll('.lsim-tool-card[data-station]').forEach(card=>{const get=name=>card.querySelector(`[data-tool-field="${name}"]`),station=Number(card.dataset.station),num=name=>n(get(name)&&get(name).value);out[station]={station,code:card.dataset.code||'',operation:get('operation')&&get('operation').value||'external',kind:get('kind')&&get('kind').value||'cnmg',diameter:num('diameter'),workingLength:num('workingLength'),bodyD:num('bodyD'),minBore:num('minBore'),nose:num('nose'),pointAngle:num('pointAngle'),insertWidth:num('insertWidth'),maxDepth:num('maxDepth'),confirmed:!!(get('confirmed')&&get('confirmed').checked)};});return out;}
function renderToolSetup(result){const box=$('#lsimToolSetup');if(!box)return;const tools=result&&result.tools||[];if(!tools.length){box.hidden=true;box.innerHTML='';return;}const existing=collectToolConfigs(),opItems=[['external','Наружная / торец'],['boring','Расточка'],['groove','Канавка'],['thread','Резьба'],['drill','Сверление'],['centerdrill','Центрование'],['tap','Метчик']];
 box.hidden=false;box.innerHTML=`<div class="lsim-controls-title"><b>2. Инструменты из программы</b><span>${tools.length} ${tools.length===1?'СТАНЦИЯ':'СТАНЦИИ'}</span></div><p class="lsim-help">Проверьте назначение каждого T. Диаметр, рабочая длина и корпус участвуют и в рисунке, и в проверке столкновений.</p><div class="lsim-tool-list">${tools.map((raw,index)=>{const t={...raw,...(existing[raw.station]||{})},code=t.code||String(t.station).padStart(2,'0')+'01';return`<section class="lsim-tool-card ${t.confirmed?'confirmed':''} ${index?'collapsed':''}" data-station="${t.station}" data-code="${h(code)}"><button type="button" class="lsim-tool-head"><span class="lsim-tool-badge">T${String(t.station).padStart(2,'0')}</span><b>${h(operationName(t.operation))}</b><small>${h(code)} · ${t.confirmed?'ПОДТВЕРЖДЁН':'ПРОВЕРИТЬ'}</small><i>⌄</i></button><div class="lsim-tool-fields">
 <label class="fld"><span>Операция T${String(t.station).padStart(2,'0')}</span><select data-tool-field="operation">${optionList(opItems,t.operation)}</select></label><label class="fld"><span>Инструмент · ${Object.keys(TOOL_LIBRARY).length} позиций</span><input class="lsim-tool-find" data-tool-find type="search" placeholder="CNMG · MGEHR · сверло · расточной" autocomplete="off"><select data-tool-field="kind">${toolOptions(t.kind)}</select></label>
 <label class="fld"><span>Ø режущей части, мм</span><input data-tool-field="diameter" type="number" min="0" step="0.1" value="${n(t.diameter)}"></label><label class="fld"><span>Рабочая длина / вылет, мм</span><input data-tool-field="workingLength" type="number" min="1" step="1" value="${n(t.workingLength)}"></label>
 <label class="fld"><span>Ø корпуса / державки, мм</span><input data-tool-field="bodyD" type="number" min="1" step="0.1" value="${n(t.bodyD)}"></label><label class="fld"><span>Минимальный Ø отверстия, мм</span><input data-tool-field="minBore" type="number" min="0" step="0.1" value="${n(t.minBore)}"></label>
 <label class="fld"><span>Радиус вершины, мм</span><input data-tool-field="nose" type="number" min="0" step="0.1" value="${n(t.nose)}"></label><label class="fld"><span>Угол сверла / профиля, °</span><input data-tool-field="pointAngle" type="number" min="0" max="175" step="1" value="${n(t.pointAngle)}"></label>
 <label class="fld"><span>Ширина пластины канавки, мм</span><input data-tool-field="insertWidth" type="number" min="0.2" step="0.1" value="${n(t.insertWidth)||3}"></label><label class="fld"><span>Предельная глубина канавки, мм</span><input data-tool-field="maxDepth" type="number" min="0" step="0.5" value="${n(t.maxDepth)||0}"></label>
 <label class="lsim-tool-confirm"><input data-tool-field="confirmed" type="checkbox" ${t.confirmed?'checked':''}><span>Назначение и габариты проверены оператором</span></label>
 <canvas class="lsim-tool-preview" data-tool-preview width="210" height="84" aria-label="Схема выбранного инструмента"></canvas>
 <p class="lsim-tool-note" data-tool-note>${h((TOOL_LIBRARY[t.kind]||{}).note||'')}</p>
 </div></section>`;}).join('')}</div>`;bindToolCards();document.querySelectorAll('.lsim-tool-card').forEach(refreshToolPreview);}
function bindToolCards(){document.querySelectorAll('.lsim-tool-card').forEach(card=>{
 const find=card.querySelector('[data-tool-find]'),pick=card.querySelector('[data-tool-field="kind"]');
 if(find&&pick)find.oninput=()=>{const cur=pick.value;pick.innerHTML=toolOptions(cur,find.value);pick.value=cur;};
 const head=card.querySelector('.lsim-tool-head');if(head)head.onclick=()=>{card.classList.toggle('collapsed');if(!card.classList.contains('collapsed'))requestAnimationFrame(()=>refreshToolPreview(card));};card.querySelectorAll('[data-tool-field]').forEach(field=>field.onchange=()=>{const all=collectToolConfigs(),spec=all[Number(card.dataset.station)],kind=TOOL_LIBRARY[spec.kind]||TOOL_LIBRARY.cnmg;if(field.dataset.toolField==='kind'){const op=card.querySelector('[data-tool-field="operation"]');if(op)op.value=kind.operation;const set=(name,value)=>{const e=card.querySelector(`[data-tool-field="${name}"]`);if(e)e.value=value;};set('diameter',kind.diameter);set('workingLength',kind.workingLength);set('bodyD',kind.bodyD);set('minBore',kind.minBore);set('nose',kind.nose);set('pointAngle',kind.pointAngle);set('insertWidth',kind.insertWidth||3);set('maxDepth',kind.maxDepth||0);const nt=card.querySelector('[data-tool-note]');if(nt)nt.textContent=kind.note||'';}const confirmed=card.querySelector('[data-tool-field="confirmed"]')?.checked;card.classList.toggle('confirmed',!!confirmed);const small=card.querySelector('.lsim-tool-head small');if(small)small.textContent=`${card.dataset.code} · ${confirmed?'ПОДТВЕРЖДЁН':'ПРОВЕРИТЬ'}`;const title=card.querySelector('.lsim-tool-head b'),op=card.querySelector('[data-tool-field="operation"]');if(title&&op)title.textContent=operationName(op.value);refreshToolPreview(card);saveToolStore(collectToolConfigs());applyForm(false);});});}

function renderGReport(result){
 const box=$('#lsimGReport');if(!box)return;
 if(!result){box.className='lsim-g-report';box.innerHTML='<span>Вставьте G-код и нажмите «Проверить и показать».</span>';return;}
 const s=result.stats,head=s.bad?`ПРОВЕРКА ЗАБЛОКИРОВАНА · ошибок: ${s.bad}`:s.warn?`НАГЛЯДНО, НО ПРОВЕРЬТЕ · замечаний: ${s.warn}`:'ТОЧНО РАСКРЫТО В ПОДДЕРЖИВАЕМОМ 2D-РЕЖИМЕ';
 const state=s.bad?'bad':s.warn?'warn':'good',baseItems=result.issues.length?result.issues.map(i=>`<li class="${i.type}" ${i.line?`data-lsim-jump="${i.line}"`:''}><b>${i.type==='bad'?'ОШИБКА':'ПРОВЕРИТЬ'}</b>${i.line?` · строка ${i.line}`:''}<span>${h(i.text)}</span></li>`).join(''):'<li class="good"><b>БАЗОВАЯ ПРОВЕРКА ПРОЙДЕНА</b><span>Перемещения разобраны. Сверьте контур, ноль детали и корректор инструмента.</span></li>',g=result.geometry,geometryItem=g?`<li class="good"><b>ИТОГОВАЯ 2D-ГЕОМЕТРИЯ</b><span>Минимальный наружный Ø ${g.minOuterD.toFixed(2)} мм · максимальное отверстие Ø ${g.maxHoleD.toFixed(2)} мм · минимальная стенка ${g.minWall.toFixed(2)} мм${g.gripClear==null?'':` · запас до зоны зажима по Z ${g.gripClear.toFixed(2)} мм`}</span></li>`:'',items=baseItems+geometryItem;
 box.className=`lsim-g-report ${state}`;box.innerHTML=`<div class="lsim-g-summary"><b>${head}</b><span>${h(result.dialect||"Haas")} · ${s.blocks} кадров · ${s.moves} ходов · ${s.cuts} режущих</span></div><ul>${items}</ul>`;
 box.querySelectorAll('[data-lsim-jump]').forEach(x=>x.onclick=()=>jumpToLine(Number(x.dataset.lsimJump)));
}

function activeSegment(){return simState&&simState.nc&&simState.nc.segments[simState.segment]||null;}
/* для подписи инструмента и HUD: когда прогон завершён, показываем последний кадр,
   иначе после M30 в кадре «инструмент» повисает прочерк, а на сцене — резец по умолчанию */
function displaySegment(){if(!simState||!simState.nc)return null;const segs=simState.nc.segments;return segs[simState.segment]||segs[segs.length-1]||null;}
/* Слой подсветки лежит ровно под кареткой: перерисовываем его только при смене
   текста или активной строки, иначе на каждом кадре анимации переписывался бы весь
   текст программы. */
let editorLine=-1,editorText=null;
function syncEditor(force){
 const ta=$('#lsimGcode'),hl=$('#lsimGcodeHL'),gut=$('#lsimGutter');
 if(!ta||!hl)return;
 const active=activeSegment(),line=active?active.line:0;
 if(force||ta.value!==editorText||line!==editorLine){
  const bad=new Set((gcodeResult&&gcodeResult.issues||[]).filter(x=>x.type==='bad'&&x.line).map(x=>x.line));
  hl.innerHTML=highlightGcodeLines(ta.value,{active:line,badLines:bad});
  if(gut)gut.innerHTML=gcodeGutter(ta.value,{active:line,badLines:bad});
  editorText=ta.value;editorLine=line;
 }
 hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft;if(gut)gut.scrollTop=ta.scrollTop;
}
/* прокрутить редактор к активному кадру, когда прогон ушёл за видимую часть */
function revealEditorLine(line){
 const ta=$('#lsimGcode'),hl=$('#lsimGcodeHL');if(!ta||!hl||!line)return;
 const row=hl.querySelectorAll('.gk-line')[line-1];if(!row)return;
 const top=row.offsetTop,height=row.offsetHeight||14;
 if(top<ta.scrollTop+2||top+height>ta.scrollTop+ta.clientHeight-2){
  ta.scrollTop=Math.max(0,top-ta.clientHeight/2);syncEditor();}
}
function syncCode(){
 const active=activeSegment(),block=$('#lsimActiveBlock'),win=$('#lsimCodeWindow');
 if(block)block.innerHTML=active?'<i>'+String(active.line).padStart(4,'0')+'</i> '+highlightGcode(active.clean):'— программа не загружена —';
 document.querySelectorAll('.lsim-tool-card').forEach(card=>card.classList.toggle('active',!!active&&Number(card.dataset.station)===Number(active.toolStation)));
 syncEditor();
 if(active&&simState&&simState.running)revealEditorLine(active.line);
 if(!win)return;
 if(!gcodeResult||!gcodeResult.lines){win.innerHTML='';return;}
 const line=active?active.line:1,start=Math.max(1,line-3),end=Math.min(gcodeResult.lines.length,line+3),
  badLines=new Set(gcodeResult.issues.filter(x=>x.type==='bad').map(x=>x.line));
 let html='';
 for(let i=start;i<=end;i++)html+='<button data-lsim-line="'+i+'" class="'+(i===line?'current ':'')+(badLines.has(i)?'bad':'')+'"><i>'+String(i).padStart(4,'0')+'</i><code>'+highlightGcode(gcodeResult.lines[i-1]||'')+'</code></button>';
 win.innerHTML=html;win.querySelectorAll('button').forEach(x=>x.onclick=()=>jumpToLine(Number(x.dataset.lsimLine)));
}
function jumpToLine(line){if(!simState||!simState.nc)return;const idx=simState.nc.segments.findIndex(s=>s.line>=line);simState.segment=idx<0?Math.max(0,simState.nc.segments.length-1):idx;simState.progress=0;simState.complete=false;haltRun();refreshMaterial();updateHud();paint();}
function refreshMaterial(){
 if(!simState||!simState.nc)return;
 if(!simState.cutter||simState.cutter.segments!==simState.nc.segments.length)simState.cutter=makeCutter(simState.nc,simState.cfg);
 simState.material=simState.cutter.at(simState.segment,simState.progress);
}

function analyzePastedGcode(announce){
 const area=$('#lsimGcode'),code=area?area.value.trim():'';
 if(!code){gcodeResult=null;renderGReport(null);syncEditor(true);if(announce)toast('Вставьте или откройте G-код');return false;}
 let cfg=readForm(),check=validate(cfg,true);if(check.errors.length){setStatus(check);return false;}
 /* первый разбор нужен, чтобы узнать станции T и габариты траектории */
 const discovered=parseGcode(code,cfg);renderToolSetup(discovered);
 if(viewState.autoStock!==false)applyStockFit(inferStock(discovered,readForm()));
 cfg=readForm();check=validate(cfg,true);
 if(check.errors.length){setStatus(check);return false;}
 save(cfg);
 gcodeResult=parseGcode(code,cfg);renderGReport(gcodeResult);
 simState=buildPlayback(cfg,gcodeResult);refreshMaterial();updateVisibility();updateHud();
 /* новая программа — новые габариты: масштаб и сдвиг от прошлой детали только мешают */
 viewState.zoom=1;viewState.panX=0;viewState.panY=0;saveView();
 paint();syncEditor(true);
 if(announce)toast(gcodeResult.stats.bad?'Найдено ошибок: '+gcodeResult.stats.bad:'Траектория построена');
 return true;
}

function applyForm(announce){
 if(!$('#lsimCanvas'))return false;updateVisibility();
 const hasNc=!!(gcodeResult&&$('#lsimGcode')&&$('#lsimGcode').value.trim());
 const cfg=readForm(),check=validate(cfg,hasNc);setStatus(check);if(check.errors.length)return false;
 save(cfg);lastTick=0;if(gcodeResult&&$('#lsimGcode')&&$('#lsimGcode').value.trim()){gcodeResult=parseGcode($('#lsimGcode').value,cfg);renderGReport(gcodeResult);simState=buildPlayback(cfg,gcodeResult);refreshMaterial();}else simState=buildModel(cfg);updateHud();paint();
 updateStockLine();
 if(announce)toast(gcodeResult?'Эмулятор CNC: '+gcodeResult.stats.moves+' перемещений':'Учебная модель: '+simState.totalPasses+' проходов');
 return true;
}

function bindSimulator(){
 if(!$('#lsimCanvas'))return;
 const back=document.querySelector('[data-lsim-back]');if(back)back.onclick=()=>{if(history.state&&history.state.razryadDepth)history.back();else{try{history.replaceState({...history.state,razryadEmulatorRoute:false},'',location.pathname);}catch(_){}folder=null;render();}};
 document.querySelectorAll('#nav [data-tab]').forEach(item=>item.onclick=()=>{tab=item.dataset.tab;folder=null;geoCase=null;rank=null;filter='Все';const q=$('#q');if(q)q.value='';try{history.replaceState({...history.state,razryadEmulatorRoute:false},'',location.pathname);}catch(_){}deeper();render();});
 document.querySelectorAll('[data-lsim-field]').forEach(x=>x.onchange=()=>{
  if(x.id==='lsimSpeed'){const v=$('#lsimSpeedValue');if(v)v.textContent='×'+x.value;if(simState)simState.cfg.speed=n(x.value)||1;return;}
  if(x.id==='lsimAutoStock'){viewState.autoStock=!!x.checked;saveView();updateVisibility();
   if(x.checked&&gcodeResult)analyzePastedGcode(false);else applyForm(false);
   toast(x.checked?'Заготовка подбирается по программе':'Размеры заготовки задаются вручную');return;}
  updateVisibility();applyForm(false);});
 $('#lsimBuild').onclick=()=>applyForm(true);
 $('#lsimGFileBtn').onclick=()=>$('#lsimGFile').click();
 $('#lsimGFile').onchange=e=>{const file=e.target.files&&e.target.files[0];if(!file)return;file.text().then(code=>{$('#lsimGcode').value=code;analyzePastedGcode(true);}).catch(()=>{renderGReport({stats:{bad:1,warn:0,blocks:0,moves:0},issues:[{type:'bad',text:'Не удалось прочитать файл. Сохраните программу как обычный текст.',line:0}]});});};
 $('#lsimGDemo').onclick=()=>{$('#lsimOperation').value='external';$('#lsimTool').value='cnmg';$('#lsimStockD').value=60;$('#lsimLength').value=120;$('#lsimGrip').value=25;$('#lsimTargetD').value=45;$('#lsimStepD').value=54;$('#lsimStepLen').value=42;updateVisibility();$('#lsimGcode').value=DEMO_GCODE;analyzePastedGcode(true);};
 $('#lsimSampleTurn').onclick=()=>{fetch('./samples/turning-demo.nc').then(r=>{if(!r.ok)throw Error();return r.text();}).then(code=>{$('#lsimOperation').value='external';$('#lsimTool').value='cnmg';updateVisibility();$('#lsimGcode').value=code;analyzePastedGcode(false);fitStockToNc(true);toast('Загружен учебный пример точения');}).catch(()=>toast('Учебный пример не найден в папке samples'));};
 $('#lsimGAnalyze').onclick=()=>analyzePastedGcode(true);
 const ta=$('#lsimGcode');
 if(ta){
  ta.addEventListener('input',()=>syncEditor());
  ta.addEventListener('scroll',()=>{const hl=$('#lsimGcodeHL'),gut=$('#lsimGutter');
   if(hl){hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft;}if(gut)gut.scrollTop=ta.scrollTop;});
  /* Tab внутри программы — отступ, а не уход с поля */
  ta.addEventListener('keydown',e=>{if(e.key!=='Tab'||e.shiftKey)return;e.preventDefault();
   const a=ta.selectionStart,b=ta.selectionEnd;ta.value=ta.value.slice(0,a)+'  '+ta.value.slice(b);
   ta.selectionStart=ta.selectionEnd=a+2;syncEditor();});
 }
 $('#lsimFitStock').onclick=()=>fitStockToNc(true);
 document.querySelectorAll('[data-lsim-mode]').forEach(x=>x.onclick=()=>{
  const wantFlat=x.dataset.lsimMode==='flat';
  if((viewState.flat!==false)===wantFlat)return;
  viewState.flat=wantFlat;saveView();
  document.querySelectorAll('[data-lsim-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.lsimMode==='flat')===wantFlat)));
  paint();toast(wantFlat?'Плоский разрез 2D':'Объёмный вид 2.5D');});
 const ts=document.querySelector('[data-lsim-toolscale]');
 if(ts)ts.onclick=()=>{viewState.toolScale=viewState.toolScale==='schematic'?'real':'schematic';saveView();
  ts.setAttribute('aria-pressed',String(viewState.toolScale!=='schematic'));
  document.querySelectorAll('.lsim-tool-card').forEach(refreshToolPreview);paint();
  toast(viewState.toolScale==='schematic'?'Инструмент показан схематично':'Инструмент в реальном масштабе');};
 document.querySelectorAll('[data-lsim-codetheme]').forEach(x=>x.onclick=()=>{
  const value=x.dataset.lsimCodetheme;if(viewState.codeTheme===value)return;
  viewState.codeTheme=value;saveView();
  document.querySelectorAll('[data-lsim-codetheme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lsimCodetheme===value)));
  document.querySelectorAll('.gk').forEach(box=>box.dataset.gkTheme=value);
  toast(value==='cimco'?'Схема цветов CIMCO Edit':'Те же цвета на тёмном фоне');});
 document.querySelectorAll('[data-lsim-view]').forEach(x=>x.onclick=()=>{const key=x.dataset.lsimView;
  if(key==='showCycles'){const box=$('#lsimShowCycles');if(box){box.checked=!box.checked;x.setAttribute('aria-pressed',String(box.checked));viewState.showCycles=box.checked;saveView();applyForm(false);return;}}
  viewState[key]=!viewState[key];x.setAttribute('aria-pressed',String(viewState[key]));saveView();paint();});
 document.querySelectorAll('[data-lsim-dialect]').forEach(x=>x.onclick=()=>{const value=x.dataset.lsimDialect;const cur=load();if(cur.dialect===value)return;save({...cur,dialect:value});
  document.querySelectorAll('[data-lsim-dialect]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lsimDialect===value)));
  const hint=$('#lsimDialectHint');if(hint)hint.textContent=value==='fanuc'?'Fanuc: P/Q циклов в микронах, повтор K, G71 двумя кадрами':'Haas: P/Q как задано, глубина D и I/K в мм, повтор L';
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
function fitStockToNc(announce){
 if(!gcodeResult)return announce&&toast('Сначала откройте NC');
 const fit=inferStock(gcodeResult,readForm());applyStockFit(fit);applyForm(false);
 if(announce)toast('Заготовка: Ø'+fit.stockD+' × '+fit.length+' мм');
 return true;
}
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
 const shown=seg||displaySegment();
 if($('#lsimActiveTool'))$('#lsimActiveTool').textContent=shown&&shown.toolStation?`T${String(shown.toolStation).padStart(2,'0')} · ${operationName(shown.operation)}`:shown?operationName(shown.operation):'T—';
 if($('#lsimTrack'))$('#lsimTrack').style.width=`${Math.max(0,Math.min(100,(simState.complete?100:ratio*100))).toFixed(1)}%`;syncCode();
}

function pointOnSegment(seg,q){const pts=seg&&seg.points&&seg.points.length?seg.points:[seg.from,seg.to],limit=Math.max(0,Math.min(1,q)),at=limit*(pts.length-1),i=Math.min(pts.length-2,Math.floor(at)),f=at-i,a=pts[Math.max(0,i)],b=pts[Math.max(1,i+1)];return{x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};}

function canvasSpace(canvas,banner){
 const rect=canvas.getBoundingClientRect?canvas.getBoundingClientRect():{width:banner?600:720,height:banner?182:360},w=Math.max(280,rect.width||600),hgt=Math.max(banner?150:160,rect.height||w/(banner?3.2:2.05)),dpr=Math.min(2,window.devicePixelRatio||1);
 const W=Math.round(w*dpr),H=Math.round(hgt*dpr);if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h:hgt};
}

/* Цвета ходов — как на бэкплоте CIMCO: G0 синий, G1 зелёный, G2 жёлтый, G3 оранжевый. */
const PATH_COLORS={rapid:'#4a86ff',line:'#41d977',cw:'#ffe14d',ccw:'#ff9330',bad:'#ff4438'};
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
 if(m.nc){const seg=activeSegment(),p=seg?pointOnSegment(seg,m.progress):(displaySegment()||{to:{x:m.cfg.stockD+10,z:4}}).to;return{x:g.x1+(p.z/m.cfg.length)*(g.x1-g.x0),t:Math.max(0,Math.min(1,(p.z+m.cfg.length)/m.cfg.length)),nc:true,program:p};}
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
 const c=m.cfg,q=toolPoint(g,m),active=m.nc?displaySegment():null,spec=active&&active.toolSpec||{...TOOL_LIBRARY[c.tool],kind:c.tool,nose:c.nose,operation:c.operation},op=active&&active.operation||c.operation,x=q.x,t=q.t;if(['drill','centerdrill','tap'].includes(op)){drawAxialTool(ctx,g,m,time,col,q,spec,op);return;}let tipY;
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
 result.segments.forEach((seg,index)=>{if(seg.rapid&&!viewState.showRapid)return;if(seg.arc&&!viewState.showArcs)return;if(seg.synthetic&&result.cfg&&result.cfg.showCycles===false)return;const pts=seg.points&&seg.points.length?seg.points:[seg.from,seg.to],first=map(pts[0]);if(!Number.isFinite(first.x+first.y))return;ctx.save();ctx.beginPath();ctx.rect(g.x0-42,g.cy-c.stockD/2*g.scale-48,g.x1-g.x0+120,c.stockD*g.scale+120);ctx.clip();ctx.strokeStyle=seg.suspicious?PATH_COLORS.bad:seg.rapid?PATH_COLORS.rapid:seg.arc?(seg.cw?PATH_COLORS.cw:PATH_COLORS.ccw):PATH_COLORS.line;ctx.lineWidth=seg.suspicious?2.7:index===simState?.segment?2.8:1.55;ctx.globalAlpha=seg.suspicious?1:index===simState?.segment?1:.78;if(seg.rapid)ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(first.x,first.y);for(let i=1;i<pts.length;i++){const q=map(pts[i]);ctx.lineTo(q.x,q.y);}ctx.stroke();ctx.setLineDash([]);
  const b=map(pts[pts.length-1]);if(viewState.showDots){ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(b.x,b.y,index===simState?.segment?3.6:2.2,0,Math.PI*2);ctx.fill();}if(seg.suspicious&&flagged<8){flagged++;ctx.fillStyle=PATH_COLORS.bad;ctx.beginPath();ctx.arc(b.x,b.y,4.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='600 7px "IBM Plex Mono",monospace';ctx.fillText(String(seg.line),b.x+6,b.y-5);}ctx.restore();});
}

/* ============================================================
   Плоский разрез 2D: сечение детали, траектория и инструмент.
   Ось Z горизонтально, +X вверх и вниз от осевой линии в диаметрах.
   ============================================================ */
const FLAT={bg:'#080b0e',grid:'#141d25',grid2:'#20303c',axis:'#5d6f7c',text:'#8fa0ac',
 blank:'#1a2229',blankEdge:'#3f4f5b',metal:'#3d4d59',metalEdge:'#a9bcc7',removed:'#161e25',
 chuck:'#212b33',chuckEdge:'#576976',steel:'#93a4b0',carbide:'#e8d397',braze:'#c08a4a'};

/* границы сцены: заготовка плюс рабочие ходы; парковочные G0 в подбор не берём */
/* Границы плоского вида. Быстрые ходы и отводы циклов уводят кадр за деталь,
   поэтому берём заготовку и только режущие перемещения. */
function flatBounds(m){
 const c=m.cfg;
 let zMin=-Math.max(10,c.length),zMax=Math.max(6,c.length*.08),rMax=Math.max(4,c.stockD/2);
 ((m.nc&&m.nc.segments)||[]).forEach(s=>{
  if(!s.cutting)return;
  (s.points||[s.from,s.to]).forEach(p=>{
   if(!Number.isFinite(p.z)||!Number.isFinite(p.x))return;
   zMin=Math.min(zMin,p.z);zMax=Math.max(zMax,p.z);rMax=Math.max(rMax,Math.abs(p.x)/2);});
 });
 /* Инструмент рисуется в натуральную величину, поэтому над деталью нужен запас:
    иначе пластина всё время срезана верхней кромкой кадра. Берём вылет самой
    пластины — державка может уходить за кадр, как и на бэкплоте станка. */
 if(viewState.showTool&&m.nc){
  const seg=displaySegment();
  if(seg&&seg.toolSpec){
   try{
    const g=insertGeometry(seg.toolSpec,seg.operation);
    const up=Math.max(...g.cut.map(p=>Math.abs(p[1])));
    if(Number.isFinite(up))rMax+=Math.min(up,rMax*.6);
   }catch(_){}
  }
 }
 return{zMin,zMax:Math.max(zMax,2),rMax};
}
function niceStep(px,k){const list=[.5,1,2,5,10,20,25,50,100,200,500];for(const s of list)if(s*k>=px)return s;return 1000;}
function programPoint(m){
 if(m.nc){const seg=activeSegment(),p=seg?pointOnSegment(seg,m.progress):(displaySegment()||{to:{x:m.cfg.stockD+10,z:4}}).to;return{...p};}
 const c=m.cfg,t=m.progress||0;return{x:currentOuter(m,1)*2,z:-Math.max(0,(c.length-c.grip))*t};
}
function fillPoly(ctx,pts,fill,stroke,w){if(!pts||pts.length<2)return;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w||1.1;ctx.stroke();}}

/* Инструмент на сцене рисуется тем же силуэтом, каким режет, и в том же масштабе:
   державка 25×25 занимает на детали Ø60 столько, сколько занимает на станке.
   Схематичный режим только уменьшает силуэт, геометрию он не подменяет. */
function toolDrawScale(geom,G){
 if(viewState.toolScale!=='schematic')return 1;
 const span=Math.max(...geom.holder.concat(geom.cut).map(p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))));
 const limit=Math.max(6,(G.clip?G.clip.h:180)*.22/Math.max(.001,G.k));
 return span>limit?limit/span:1;
}
function drawTool2D(ctx,G,m,spec,op,point){
 const geom=insertGeometry(spec,op),k=G.k*toolDrawScale(geom,G);
 const tipX=G.MX(point.z),tipY=G.MY(point.x);
 const to=pts=>pts.map(p=>[tipX+p[0]*k,tipY-p[1]*k]);
 ctx.save();ctx.lineJoin='round';
 fillPoly(ctx,to(geom.holder),FLAT.chuck,FLAT.chuckEdge,1.2);
 if(geom.shape==='axial'){
  /* спиральные канавки на теле сверла, чтобы его нельзя было спутать с оправкой */
  const body=to(geom.cut),r=Math.max(.05,(Number(spec.diameter)||0)/2)*k;
  fillPoly(ctx,body,FLAT.steel,'#dbe6ec',1.2);
  ctx.save();ctx.beginPath();body.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.clip();
  ctx.strokeStyle='rgba(10,20,28,.5)';ctx.lineWidth=1;
  const end=geom.cut.reduce((a,p)=>Math.max(a,p[0]),0)*k;
  for(let u=r;u<end;u+=Math.max(6,r*1.1)){ctx.beginPath();ctx.moveTo(tipX+u,tipY-r);ctx.lineTo(tipX+u+r*1.2,tipY+r);ctx.stroke();}
  ctx.restore();
 }else{
  fillPoly(ctx,to(geom.cut),geom.brazed?FLAT.braze:FLAT.carbide,'#fff2b4',1.15);
  if(geom.brazed){ /* линия пайки: напайной резец видно сразу */
   const a=to([[1,geom.nose*.6]])[0],b=to([[geom.ic*.5,geom.ic*.32]])[0];
   ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
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
 const geom=insertGeometry(spec,op),axial=geom.mode==='axis',inner=geom.mode==='inner';
 /* масштаб подбираем по габаритам силуэта, чтобы инструмент был виден целиком */
 let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
 geom.cut.concat(geom.holder).forEach(p=>{u0=Math.min(u0,p[0]);u1=Math.max(u1,p[0]);v0=Math.min(v0,p[1]);v1=Math.max(v1,p[1]);});
 const k=Math.min((w-20)/Math.max(6,u1-u0),(hgt-16)/Math.max(6,(v1-v0)*1.15));
 const tipX=10-u0*k,tipY=axial?hgt/2:inner?12-v1*k:hgt-10+ (-v0*k);
 const G={k,cy:tipY,MX:z=>tipX+z*k,MY:x=>tipY-x/2*k,clip:{x:0,y:0,w,h:hgt}};
 /* поверхность детали: сразу видно, с какой стороны инструмент работает */
 if(!axial){ctx.fillStyle='#161d23';if(inner)ctx.fillRect(0,0,w,Math.max(0,tipY));else ctx.fillRect(0,Math.min(hgt,tipY),w,hgt);
  ctx.strokeStyle='#42535f';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,tipY);ctx.lineTo(w,tipY);ctx.stroke();
  ctx.fillStyle='#5d6f7c';ctx.font='500 8px "IBM Plex Mono",monospace';ctx.fillText(inner?'стенка отверстия':'поверхность детали',6,inner?14:hgt-6);
 }else{ctx.strokeStyle='#42535f';ctx.lineWidth=1;ctx.setLineDash([8,4,2,4]);ctx.beginPath();ctx.moveTo(0,tipY);ctx.lineTo(w,tipY);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#5d6f7c';ctx.font='500 8px "IBM Plex Mono",monospace';ctx.fillText('ось вращения',6,hgt-6);}
 const keep=viewState.toolScale;viewState.toolScale='real';
 try{drawTool2D(ctx,G,null,spec,op,{x:0,z:0});}catch(_){}
 viewState.toolScale=keep;
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
 const cur=simState?simState.segment:-1,hideCycles=result.cfg&&result.cfg.showCycles===false;
 const x0=G.clip.x,x1=G.clip.x+G.clip.w,y0=G.clip.y,y1=G.clip.y+G.clip.h;
 let flagged=0;const marks=[];
 /* clip ставится один раз: на программе в тысячу кадров save/clip/restore на каждый
    отрезок съедал больше времени, чем сама отрисовка */
 ctx.save();ctx.beginPath();ctx.rect(x0,y0,G.clip.w,G.clip.h);ctx.clip();ctx.lineJoin='round';ctx.lineCap='round';
 result.segments.forEach((seg,index)=>{
  if(seg.rapid&&!viewState.showRapid)return;
  if(seg.arc&&!viewState.showArcs)return;
  if(seg.synthetic&&hideCycles)return;
  const pts=seg.points&&seg.points.length?seg.points:[seg.from,seg.to];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  const xy=pts.map(p=>{const X=G.MX(p.z),Y=G.MY(p.x);
   if(X<minX)minX=X;if(X>maxX)maxX=X;if(Y<minY)minY=Y;if(Y>maxY)maxY=Y;return[X,Y];});
  if(maxX<x0||minX>x1||maxY<y0||minY>y1)return; /* весь отрезок вне кадра */
  ctx.strokeStyle=seg.suspicious?PATH_COLORS.bad:seg.rapid?PATH_COLORS.rapid:seg.arc?(seg.cw?PATH_COLORS.cw:PATH_COLORS.ccw):PATH_COLORS.line;
  ctx.lineWidth=seg.suspicious?2.6:index===cur?2.8:1.4;
  ctx.globalAlpha=seg.suspicious?1:index===cur?1:.78;
  if(seg.rapid)ctx.setLineDash([6,5]);
  ctx.beginPath();xy.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();
  if(seg.rapid)ctx.setLineDash([]);
  const end=xy[xy.length-1];
  if(viewState.showDots){ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(end[0],end[1],index===cur?3.4:2,0,Math.PI*2);ctx.fill();}
  if(seg.suspicious&&flagged<8){flagged++;marks.push([end[0],end[1],seg.line]);}
 });
 ctx.globalAlpha=1;
 marks.forEach(([bx,by,line])=>{
  ctx.fillStyle=PATH_COLORS.bad;ctx.beginPath();ctx.arc(bx,by,4.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='600 7px "IBM Plex Mono",monospace';ctx.fillText(String(line),bx+6,by-5);
 });
 ctx.restore();
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
 /* Разрез: сперва контур исходной заготовки, затем снятый металл приглушённым тоном
    и только потом оставшийся. Так сразу видно, сколько ушло в стружку. */
 if(viewState.showStock){
  const zA=G.MX(-c.length),zB=G.MX(0),rs=c.stockD/2,mat=m.material;
  const half=sd=>sd>0?yUp:yDn;
  if(mat&&mat.z&&mat.z.length){
   [1,-1].forEach(sd=>{
    const Y=half(sd);
    /* снятый металл: между исходной заготовкой и текущей поверхностью */
    ctx.beginPath();
    for(let i=0;i<mat.z.length;i++){const X=G.MX(mat.z[i]);i?ctx.lineTo(X,Y(rs)):ctx.moveTo(X,Y(rs));}
    for(let i=mat.z.length-1;i>=0;i--)ctx.lineTo(G.MX(mat.z[i]),Y(mat.outer[i]));
    ctx.closePath();ctx.fillStyle=FLAT.removed;ctx.fill();
    /* снятое изнутри — отверстия и расточка */
    ctx.beginPath();
    for(let i=0;i<mat.z.length;i++){const X=G.MX(mat.z[i]);i?ctx.lineTo(X,Y(mat.inner[i])):ctx.moveTo(X,Y(mat.inner[i]));}
    for(let i=mat.z.length-1;i>=0;i--)ctx.lineTo(G.MX(mat.z[i]),Y(0));
    ctx.closePath();ctx.fillStyle=FLAT.removed;ctx.fill();
   });
   [1,-1].forEach(sd=>{
    const Y=half(sd);
    ctx.beginPath();
    for(let i=0;i<mat.z.length;i++){const X=G.MX(mat.z[i]);i?ctx.lineTo(X,Y(mat.outer[i])):ctx.moveTo(X,Y(mat.outer[i]));}
    for(let i=mat.z.length-1;i>=0;i--)ctx.lineTo(G.MX(mat.z[i]),Y(mat.inner[i]));
    ctx.closePath();ctx.fillStyle=FLAT.metal;ctx.fill();
    ctx.strokeStyle=FLAT.metalEdge;ctx.lineWidth=1.35;ctx.stroke();
   });
  }
  ctx.setLineDash([5,4]);ctx.strokeStyle=FLAT.blankEdge;ctx.lineWidth=1;
  ctx.strokeRect(zA,yUp(rs),zB-zA,yDn(rs)-yUp(rs));ctx.setLineDash([]);
 }
 /* осевая линия */
 ctx.strokeStyle=FLAT.axis;ctx.lineWidth=1;ctx.setLineDash([9,4,2,4]);ctx.beginPath();ctx.moveTo(padL-10,cy);ctx.lineTo(W-2,cy);ctx.stroke();ctx.setLineDash([]);
 /* точка нуля детали */
 const z0=G.MX(0);if(z0>padL-10&&z0<W){ctx.strokeStyle='#ff8a34';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(z0,cy-7);ctx.lineTo(z0,cy+7);ctx.moveTo(z0-7,cy);ctx.lineTo(z0+7,cy);ctx.stroke();ctx.fillStyle='#ff8a34';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText('Z0 X0',z0+9,cy-9);}

 drawPath2D(ctx,G,gcodeResult);

 if(viewState.showTool){
  /* после M30 активного кадра нет: показываем инструмент последнего кадра,
     иначе на сцене вместо сверла внезапно появляется резец из учебной формы */
  const active=m.nc?displaySegment():null;
  const spec=active&&active.toolSpec||{...(TOOL_LIBRARY[c.tool]||TOOL_LIBRARY.cnmg),kind:c.tool,nose:c.nose,operation:c.operation};
  const lib=TOOL_LIBRARY[spec.kind]||TOOL_LIBRARY[c.tool]||TOOL_LIBRARY.cnmg;
  const full={...lib,...spec},op=active&&active.operation||c.operation,point=programPoint(m);
  if(Number.isFinite(point.x)&&Number.isFinite(point.z)){
   ctx.save();ctx.beginPath();ctx.rect(G.clip.x,G.clip.y,G.clip.w,G.clip.h);ctx.clip();
   drawTool2D(ctx,G,m,full,op,point);ctx.restore();
   /* выноска у вершины: станция, тип инструмента и фактическая позиция в диаметрах */
   const label=(active&&active.toolStation?'T'+String(active.toolStation).padStart(2,'0')+' ':'')+String(full.kind||c.tool).toUpperCase();
   const coord='⌀'+point.x.toFixed(2)+'  Z'+point.z.toFixed(2);
   const boxW=Math.max(96,coord.length*5.6+14);
   const lx=Math.min(W-boxW-4,Math.max(padL,G.MX(point.z)+10)),ly=Math.max(14,G.MY(point.x)-Math.min(60,G.k*22));
   ctx.fillStyle='rgba(5,8,11,.88)';ctx.strokeStyle='rgba(129,150,162,.35)';rounded(ctx,lx,ly,boxW,27,5);ctx.fill();ctx.stroke();
   ctx.fillStyle='#f1bd72';ctx.font='600 8px "IBM Plex Mono",monospace';ctx.fillText(label.slice(0,16),lx+6,ly+11);
   ctx.fillStyle='#9fd8ff';ctx.fillText(coord,lx+6,ly+22);
   /* тонкая выноска от вершины к рамке, иначе непонятно, к какой точке относится подпись */
   ctx.strokeStyle='rgba(129,150,162,.45)';ctx.lineWidth=1;ctx.beginPath();
   ctx.moveTo(G.MX(point.z),G.MY(point.x));ctx.lineTo(lx+4,ly+27);ctx.stroke();
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
/* release=true — уходим с экрана: опорные снимки заготовки держать незачем */
function stopSimulation(release){haltRun();if(resizeWatch){resizeWatch.disconnect();resizeWatch=null;}
 if(release){simState=null;gcodeResult=null;}
 const stage=document.querySelector('.lsim-stage');if(stage)stage.classList.remove('full');
 document.body.classList.remove('lsim-full-open');}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('lsim-full-open'))toggleFullscreen(false);});

const previousBind=bind;bind=function(){previousBind();bindSimulator();};
const previousRender=render;render=function(){
 const toSim=tab==='work'&&folder==='simx';
 stopBanner();stopSimulation(!toSim);
 if(toSim){showSimulator();return;}
 previousRender();
 if(tab==='work'&&!folder)initBanner();
};

window.RazryadCNC={TOOL_LIBRARY,TOOL_GROUPS,toolOptions,insertGeometry,profileEnvelope,toolEnvelope,envAt,turnEdge,grooveEdge,threadEdge,axialEdge,GK_THEMES,highlightGcode,highlightGcodeLines,gcodeGutter,gkStyleSheet,ensureGkStyles,drawToolPreview,draw2D,defaults,validate,buildModel,targetOuter,stripGComments,parseGcode,arcPath,stockProfile,makeCutter,blankStock,cloneStock,inferStock,applySegmentCut,buildPlayback,detectToolCatalog,toolHintFromText,openWithCode,consumeHandoff};
try{if(new URLSearchParams(location.search).get('open')==='emulator'||history.state&&history.state.razryadEmulatorRoute){tab='work';folder='simx';history.replaceState({...history.state,razryadEmulatorRoute:true},'',location.pathname);}}catch(_){}
render();
})();
