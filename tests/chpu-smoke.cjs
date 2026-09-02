const fs=require('fs'),vm=require('vm');
class E{constructor(s=''){this.s=s;this.value='';this.innerHTML='';this.textContent='';this.checked=false;this.dataset={};this.style={};this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.parentElement=this;this.offsetWidth=400;this.clientWidth=400;this.width=900;this.height=260;}addEventListener(){}querySelector(){return null}querySelectorAll(){return[]}setAttribute(){}focus(){}click(){}appendChild(){}insertAdjacentHTML(){}remove(){}getBoundingClientRect(){return{width:400,height:220}}getContext(){return new Proxy({createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}},measureText(){return{width:10}}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)})}}
const els=new Map(),get=s=>{if(!els.has(s))els.set(s,new E(s));return els.get(s)};
const local=new Map(),localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
const document={querySelector:get,querySelectorAll:()=>[],createElement:t=>new E(t),head:new E('head'),body:new E('body'),addEventListener(){}};
const ctx=vm.createContext({console,document,localStorage,navigator:{},history:{pushState(){},back(){}},location:{href:''},Event:function(){},Blob,URL:{createObjectURL(){return'blob:x'},revokeObjectURL(){}},confirm:()=>true,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},innerWidth:412,innerHeight:800});ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.scrollTo=()=>{};
const html=fs.readFileSync('chpu.html','utf8'),scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
// Последний большой встроенный скрипт содержит данные и старые разделы.
vm.runInContext(scripts[scripts.length-1],ctx,{filename:'chpu-inline.js'});
vm.runInContext(fs.readFileSync('cnc-sim-core.js','utf8'),ctx,{filename:'cnc-sim-core.js'});
vm.runInContext(fs.readFileSync('operator-tools.js','utf8'),ctx,{filename:'operator-tools.js'});
vm.runInContext(fs.readFileSync('chpu-v99.js','utf8'),ctx,{filename:'chpu-v99.js'});
vm.runInContext(fs.readFileSync('lathe-sim-v99.js','utf8'),ctx,{filename:'lathe-sim-v99.js'});
const run=s=>vm.runInContext(s,ctx),assert=(v,m)=>{if(!v)throw new Error(m)};
assert(run("TABS.map(x=>x.id).join(',')")==='work,codes,gen,calc,learn,more','new bottom navigation is incorrect');
assert(run("TABS.find(x=>x.id==='more').n")==='Ещё','More tab was not restored');
assert(run("RazryadTools.searchIndex().some(x=>x.n==='Первая деталь')")===false,'obsolete first-part card is still on Work home');
assert(run("RazryadTools.searchIndex().some(x=>x.tab==='calc'&&x.folder==='geo'&&x.n.includes('Наружный'))")===true,'external contour shortcut was not added to Work home');
assert(run("RazryadTools.searchIndex().some(x=>x.tab==='calc'&&x.folder==='id'&&x.n.includes('Внутренний'))")===true,'internal contour shortcut was not added to Work home');
assert(run("RazryadTools.searchIndex().some(x=>x.tab==='calc'&&x.folder==='fit'&&x.n==='Допуски и посадки')")===true,'fits and tolerances card was not added to Work home');
assert(fs.readFileSync('operator-tools.js','utf8').includes("['calc:geo','Расчёт контура'"),'contour shortcut was not added to More hub');
assert(html.includes('function machineSwitch()')&&html.includes('Токарный режим')&&html.includes('Фрезерный режим'),'animated machine selector markup is missing');
assert(fs.readFileSync('v99.css','utf8').includes('@keyframes millSpin')&&fs.readFileSync('v99.css','utf8').includes('@keyframes latheCut'),'machine selector animations are missing');
assert(fs.readFileSync('operator-tools.js','utf8').includes('work-split'),'split contour card is missing');
assert(fs.readFileSync('operator-tools.js','utf8').includes('latheSimBannerCanvas'),'2.5D simulator banner is missing');
assert(fs.readFileSync('operator-tools.js','utf8').includes('ЭМУЛЯТОР CNC'),'requested emulator banner title is missing');
assert(run("RazryadTools.searchIndex().some(x=>x.folder==='simx'&&x.n==='Эмулятор CNC')")===true,'CNC emulator is missing from global navigation search');
assert(run("RazryadTools.workLayout().length")===10,'default customizable Work layout is invalid');
assert(run("RazryadTools.workLayout()[0]")==='work:simx','CNC emulator must be the first card on the Work home');
assert(fs.readFileSync('operator-tools.js','utf8').includes('setTimeout(()=>{timer=0;workBlockClickUntil')&&fs.readFileSync('operator-tools.js','utf8').includes('workEditorReset'),'long-press Work customization or factory reset is missing');
// V0.998 — фрезерный эмулятор X/Y/Z рядом с токарным
assert(html.includes('mill-sim-v99.js'),'milling emulator script is not loaded');
assert(fs.readFileSync('sw.js','utf8').includes('./mill-sim-v99.js'),'milling emulator is missing from the offline cache list');
assert(fs.readFileSync('operator-tools.js','utf8').includes("route:'work:millx'"),'milling emulator route is missing');
assert(run("RazryadTools.searchIndex().some(x=>x.folder==='millx')")===true,'milling emulator is missing from global navigation search');
assert(run("RazryadTools.workLayout().includes('work:millx')")===true,'milling emulator card is missing from the Work home');
{const mill=fs.readFileSync('mill-sim-v99.js','utf8');
 assert(mill.includes('function parseMillGcode')&&mill.includes('function applyMillCut')&&mill.includes('function makeMillCutter'),'milling engine is incomplete');
 assert(mill.includes('function bottomProfile')&&mill.includes("kind==='ball'")&&mill.includes("kind==='bull'")&&mill.includes("kind==='cone'"),'milling tool bottom profiles (ball/bull/cone) are missing');
 assert(mill.includes('const MILL_TOOLS=')&&mill.includes('millToolOptions'),'milling tool catalogue is missing');}
assert(run("RazryadCNC.validate({...RazryadCNC.defaults(),stockD:60,targetD:45}).errors.length")===0,'valid lathe simulator setup was rejected');
assert(run("RazryadCNC.validate({...RazryadCNC.defaults(),stockD:40,targetD:50}).errors.length")>0,'invalid external diameter was not rejected');
assert(run("RazryadCNC.buildModel({...RazryadCNC.defaults(),stockD:60,targetD:40,depth:2}).totalPasses")===5,'layer count in lathe simulator is incorrect');
assert(run("RazryadCNC.parseGcode('G21 G18 G40 G99\\nG50 S2500\\nG97 S800 M03\\nG00 X64 Z3\\nG01 X45 Z0 F0.2\\nZ-40\\nG00 X70\\nZ5\\nM30',RazryadCNC.defaults()).stats.bad")===0,'valid imported G-code was rejected');
assert(run("RazryadCNC.parseGcode('G21 G99\\nG96 S180 M03\\nG00 X70 Z2\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('G96'))")===true,'simulator checker missed G96 without G50');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X20 Z-10\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('пересекает текущую'))")===true,'simulator checker missed rapid travel through stock');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X72 Z-50\\nG00 X20 Z6\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('пересекает текущую'))")===true,'simulator checker missed a diagonal rapid crossing through stock');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG71 P100 Q200 U0.4 W0.1 D2 F0.2\\nG00 X70 Z5\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('кадр P100'))")===true,'simulator checker missed absent G71 contour labels');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG71 U2 R0.5\\nG71 P100 Q200 U0.4 W0.1 F0.2\\nN100 G00 X50 Z0\\nG01 Z-30\\nN200 X60\\nG00 X70\\nZ5\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('не содержит P/Q'))")===false,'valid two-line Fanuc G71 was rejected');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X50 Z0\\nG02 X40 Z-10 R10 F0.2\\nM30',RazryadCNC.defaults()).segments.find(x=>x.arc).points.length")>8,'G02/G03 must be rendered as an exact sampled arc, not a chord');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X50 Z0\\nG01 Z-40 F0.2\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0);return m.outer[Math.round(70/100*(m.outer.length-1))]})()")<=25.01,'G1 cutting path did not remove metal on the traversed Z range');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X20 Z-30\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0);return Math.min(...m.outer)})()")===30,'G0 rapid movement must never remove stock');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X64 Z3\\nG01 X50 Z0 F0.2\\nZ-40\\nG00 X52\\nZ0\\nM30',c);return r.stats.bad})()")===0,'safe rapid above an already turned surface was falsely rejected');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X62 Z1\\nG01 Z0 F0.2\\nX0\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0);return Math.min(...m.outer)})()")===30,'facing at Z0 must not collapse the radial stock profile');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X50 Z0\\nG02 X40 Z-10 I0 K-5 F0.2\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('Дуга G02/G03 не построена'))")===true,'invalid I/K arc was accepted without an error');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X64 Z2\\nG01 X-10 Z-20 F0.2\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0);return Math.min(...m.outer)})()")===30,'negative-X segment must be blocked from material removal instead of mirrored');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03\\nG00 X60 Z0\\nG90 X50 Z-40 F0.2\\nM30',RazryadCNC.defaults()).segments.some(x=>x.clean.includes('G90')&&x.cutting)")===true,'Haas lathe G90 was incorrectly inherited as a rapid motion');
assert(run("RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nG97 S800 M03\\nG00 X62 Z2\\nG90 X50 Z-40 F0.2\\nX46\\nG00 X80 Z10\\nM30',RazryadCNC.defaults()).segments.filter(x=>x.cycle==='G90'&&x.cutting).length")===2,'modal G90 did not expand both complete turning passes');
assert(run("(()=>{const r=RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nG97 S800 M03\\nG00 X62 Z2\\nG71 P100 Q130 U0.4 W0.1 D2 F0.25\\nN100 G00 X50\\nN110 G01 Z-20\\nN120 X40 Z-30\\nN130 Z-50\\nG70 P100 Q130\\nM30',RazryadCNC.defaults());return{rough:r.segments.filter(s=>s.cycle==='G71'&&s.cutting).length,finish:r.segments.filter(s=>s.cycle==='G70'&&s.cutting).length}})() ").rough>1,'G71 Type I was not expanded into roughing passes');
assert(run("RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nG97 S800 M03\\nG00 X62 Z2\\nG71 P100 Q130 U0.4 W0.1 D2 F0.25\\nN100 G00 X50\\nN110 G01 Z-20\\nN120 X40 Z-10\\nN130 Z-50\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('Type II'))")===true,'non-monotonic G71 Type II contour was not blocked');
assert(run("(()=>{const c={...RazryadCNC.defaults(),operation:'boring',stockD:60,boreD:20,targetD:24,length:100,grip:20,tool:'ccmt'};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S700 M03\\nG00 X18 Z2\\nG01 X24 Z0 F0.12\\nZ-35\\nG00 Z2\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0);return {bad:r.stats.bad,inner:m.inner[Math.round(75/100*(m.inner.length-1))]}})() ").bad===0,'safe rapid inside an existing bore was falsely rejected');
assert(run("(()=>{const c={...RazryadCNC.defaults(),operation:'boring',stockD:60,boreD:20,targetD:24,length:100,grip:20,tool:'ccmt'};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S700 M03\\nG00 X18 Z2\\nG01 X24 Z0 F0.12\\nZ-35\\nG00 Z2\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0);return m.inner[Math.round(75/100*(m.inner.length-1))]})()")>=11.99,'boring path did not enlarge the hole on the traversed Z range');
assert(run("(()=>{const c={...RazryadCNC.defaults(),operation:'boring',stockD:60,boreD:20,targetD:24,length:100,grip:20};const r=RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S700 M03\\nG00 X18 Z2\\nG01 X24 Z0 F0.12\\nZ-35\\nM30',c);return RazryadCNC.inferStock(r,c).stockD})()")>=60,'auto-stock for pure boring must preserve the entered outer diameter');
const demoTurning=fs.readFileSync(fs.existsSync('samples/turning-demo.nc')?'samples/turning-demo.nc':'samples/turning-demo.nc','utf8');ctx.demoTurning=demoTurning;
assert(run("RazryadCNC.parseGcode(demoTurning,{...RazryadCNC.defaults(),stockD:500,length:500,grip:60}).segments.length")>50,'demo turning sample was not parsed into a useful toolpath');
assert(run("RazryadCNC.parseGcode(demoTurning,{...RazryadCNC.defaults(),stockD:500,length:500,grip:60}).issues.some(x=>x.text.includes('несколько инструментов'))")===false,'T0100 offset cancel was incorrectly counted as a second tool');
assert(run("RazryadCNC.parseGcode('G21 G99 G50 S2000\\nG97 S800 M03 T0101\\nG00 X64 Z2\\nG01 X50 Z-20 F0.2\\nT0202\\nG00 X70 Z2\\nM30',RazryadCNC.defaults()).issues.some(x=>x.text.includes('несколько инструментов'))")===true,'mixed tool program did not receive the split-operation warning');
assert(run("RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0101 G97 S800 M03\\nG00 X64 Z2\\nG01 X50 Z-10 F0.2\\nT0202\\nG00 X0 Z3\\nG83 Z-20 Q5 R1 F0.1\\nT0303\\nG00 X8 Z1\\nG01 X12 Z0 F0.12\\nZ-15\\nM30',{...RazryadCNC.defaults(),toolConfigs:{1:{kind:\"cnmg\",operation:\"external\"},2:{kind:\"drill\",operation:\"drill\",diameter:10,workingLength:40,bodyD:10,pointAngle:118},3:{kind:\"ccmt\",operation:\"boring\",workingLength:40,bodyD:8,minBore:10,nose:.4}}}).tools.length")===3,'three T stations did not create three independent tool configurations');
assert(run("(()=>{localStorage.removeItem('razryad-lathe-tools-v992');const t=RazryadCNC.detectToolCatalog('T0101 (PCLNR CNMG EXTERNAL)\\nT0202 (DRILL 10MM)\\nT0303 (SCLCR BORING)',RazryadCNC.defaults());return t.map(x=>x.operation).join(',')})()")==='external,drill,boring','tool comments did not preselect external, drill and boring tools');
assert(run("(()=>{localStorage.setItem('razryad-lathe-tools-v992',JSON.stringify({2:{kind:'drill',operation:'drill',diameter:8,workingLength:35,bodyD:8,pointAngle:118,confirmed:true}}));const ok=RazryadCNC.parseGcode('G21 G18 G99\\nT0202 M03\\nG00 X0 Z2\\nG81 Z-10 R1 F0.1\\nM30',RazryadCNC.defaults()).tools[0].confirmed;localStorage.removeItem('razryad-lathe-tools-v992');return ok})()")===true,'confirmed per-T setup was not restored from local storage');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20,toolConfigs:{1:{kind:'cnmg',operation:'external'},2:{kind:'drill',operation:'drill',diameter:10,workingLength:40,bodyD:10,pointAngle:118},3:{kind:'ccmt',operation:'boring',workingLength:40,bodyD:8,minBore:10,nose:.4}}};const r=RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0101 G97 S800 M03\\nG00 X64 Z2\\nG01 X50 Z0 F0.2\\nZ-10\\nG00 X70 Z2\\nT0202\\nG00 X0 Z3\\nG83 Z-20 Q5 R1 F0.1\\nT0303\\nG00 X8 Z1\\nG01 X12 Z0 F0.12\\nZ-15\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0),k=Math.round(90/100*(m.inner.length-1));return{stations:[...new Set(r.segments.map(s=>s.toolStation))].join(','),outer:m.outer[k],inner:m.inner[k],pecks:r.segments.filter(s=>s.cycle==='G83'&&s.cutting).length}})() ").stations==='1,2,3','segments were not assigned to their active T station');
assert(run("(()=>{const c={...RazryadCNC.defaults(),stockD:60,length:100,grip:20,toolConfigs:{1:{kind:'cnmg',operation:'external'},2:{kind:'drill',operation:'drill',diameter:10,workingLength:40,bodyD:10,pointAngle:118},3:{kind:'ccmt',operation:'boring',workingLength:40,bodyD:8,minBore:10,nose:.4}}};const r=RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0101 G97 S800 M03\\nG00 X64 Z2\\nG01 X50 Z0 F0.2\\nZ-10\\nG00 X70 Z2\\nT0202\\nG00 X0 Z3\\nG83 Z-20 Q5 R1 F0.1\\nT0303\\nG00 X8 Z1\\nG01 X12 Z0 F0.12\\nZ-15\\nM30',c);const m=RazryadCNC.stockProfile(r,c,r.segments.length,0),k=Math.round(90/100*(m.inner.length-1));return{outer:m.outer[k],inner:m.inner[k],pecks:r.segments.filter(s=>s.cycle==='G83'&&s.cutting).length}})() ").pecks>=4,'G83 was not expanded into separate cutting pecks');
assert(run("(()=>{const c={...RazryadCNC.defaults(),toolConfigs:{2:{kind:'drill',operation:'drill',diameter:10,workingLength:40,bodyD:10,pointAngle:118}}};const r=RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0202 G97 S600 M03\\nG00 X0 Z3\\nG83 Z-20 Q5 R1 F0.1\\nM30',c),m=RazryadCNC.stockProfile(r,c,r.segments.length,0),k=Math.round(105/120*(m.inner.length-1));return m.inner[k]})()")>=4.9,'drill did not create a full-diameter bore behind its conical tip');
assert(run("RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0202 G97 S600 M03\\nG00 X1 Z3\\nG83 Z-20 Q5 R1 F0.1\\nM30',{...RazryadCNC.defaults(),toolConfigs:{2:{kind:'drill',operation:'drill',diameter:10,workingLength:40,bodyD:10,pointAngle:118}}}).issues.some(x=>x.text.includes('не по оси'))")===true,'off-axis drill was not blocked');
assert(run("RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0202 G97 S600 M03\\nG00 X0 Z3\\nG81 Z-30 R1 F0.1\\nM30',{...RazryadCNC.defaults(),toolConfigs:{2:{kind:'drill',operation:'drill',diameter:10,workingLength:15,bodyD:10,pointAngle:118}}}).issues.some(x=>x.text.includes('Рабочая длина'))")===true,'short drill working length was not blocked');
assert(run("RazryadCNC.parseGcode('G21 G18 G99 G50 S2000\\nT0202 G97 S600 M03\\nG00 X0 Z3\\nG83 Z-20 Q0 R1 F0.1\\nM30',{...RazryadCNC.defaults(),toolConfigs:{2:{kind:'drill',operation:'drill',diameter:10,workingLength:40,bodyD:10,pointAngle:118}}}).issues.some(x=>x.text.includes('Q должен'))")===true,'zero G83 peck was accepted');
assert(run("RazryadCNC.inferStock(RazryadCNC.parseGcode(demoTurning,RazryadCNC.defaults()),RazryadCNC.defaults()).length")>400,'auto-stock did not fit the demo turning sample');
const simSource=fs.readFileSync('lathe-sim-v99.js','utf8');
assert(simSource.indexOf('id="lsimGcode"')<simSource.indexOf('id="lsimCanvas"'),'G-code input must appear before the graphical scene');
assert(simSource.indexOf('id="lsimCanvas"')<simSource.indexOf('id="lsimStart"')&&simSource.indexOf('id="lsimStart"')<simSource.indexOf('id="lsimOperation"'),'transport controls must stay directly below the scene and above setup fields');
assert(simSource.includes('drawInnerTunnel')&&simSource.includes("c.operation==='boring'"),'real boring cutaway renderer is missing');
assert(simSource.includes('lsimCodeWindow')&&simSource.includes('lsimSampleTurn')&&simSource.includes('showRapid'),'simulator toolbar or synchronized code window is missing');
assert(simSource.includes('lsimToolSetup')&&simSource.includes('drawAxialTool')&&simSource.includes('data-tool-field="diameter"'),'per-T setup cards or realistic axial tool renderer is missing');
assert(simSource.includes('id="lsimShowCycles"')&&simSource.includes('openWithCode')&&simSource.includes('consumeHandoff'),'cycle display or shared simulator handoff is missing');
assert(simSource.includes('razryadEmulatorRoute:true')&&simSource.includes('history.state.razryadEmulatorRoute'),'emulator route is lost when a service-worker update reloads the page');
assert(simSource.includes("document.querySelectorAll('#nav [data-tab]')")&&simSource.includes('razryadEmulatorRoute:false'),'bottom navigation cannot reliably leave emulator');
assert(!simSource.includes('id="lsimPause"')&&simSource.includes('setPlayButton')&&simSource.includes("b.textContent=running?'Ⅱ':'▶'"),'play button does not toggle pause or obsolete pause button still exists');
assert(!simSource.includes('banner?150:230'),'mobile canvas still forces a taller internal height and distorts the scene');
assert(!fs.readFileSync('v99.css','utf8').includes('.lsim-legend span:nth-child'),'legacy legend selectors still override the G0/G1 colors');
assert(html.includes('machine-caliper')&&html.includes('machine-endmill')&&html.includes('machine-insert'),'real machine-mode tool selector is missing');
assert(!fs.readFileSync('chpu-v99.js','utf8').includes('менять кромку'),'training still tells the operator to replace an abstract edge');
assert(run('G.length')>=68,'full G00-G200 reference was not merged');
assert(run('EDU.length')===7,'seven education groups were not merged');
assert(run('RazryadTools.searchIndex().length')>100,'global navigation index is unexpectedly small');
assert(fs.readFileSync('generator.html','utf8').includes('ЭКСПЕРИМЕНТАЛЬНЫЙ РЕЖИМ «ФОТО → G-КОД»')&&fs.readFileSync('generator.html','utf8').includes('id="emulatorBtn"'),'Photo to G-code warning or emulator action is missing');
assert(html.includes('if(!window.RazryadShellReady)render()')&&fs.readFileSync('operator-tools.js','utf8').includes('window.RazryadShellReady=true'),'late notes load can still reset an open screen');
get('#qaCode').value='G96 S120 M03\nG00 X50 Z2\nG01 Z-40 F0.2';get('#qaMachine').value='4000';run('RazryadTools.analyzeProgram()');
assert(get('#qaOutput').innerHTML.includes('G96 без предварительного G50'),'G-code checker missed G96 without G50');
get('#isoCode').value='CNMG 120408-PM';run('RazryadTools.parseInsert()');
assert(get('#isoResult').innerHTML.includes('0.8 мм'),'insert parser missed nose radius');
get('#ctType').value='od';get('#ctNom').value='40';get('#ctLow').value='-0.02';get('#ctHigh').value='0.02';get('#ctActual').value='40.08';run('RazryadTools.calcInspection()');
assert(get('#ctResult').innerHTML.includes('-0.080 мм'),'first-part correction is incorrect');
assert(run('RazryadV99.progress().total')>=29,'academy progress does not include all topics');
assert(run("RazryadV99.profileValidate({...RazryadV99.profileDefault(),maxRpm:0}).length")===1,'machine profile validation missed invalid RPM');
assert(run("RazryadV99.shopStats({good:18,reject:2,target:25}).rejectRate")===10,'shop reject rate is incorrect');

// V0.994 — плоский 2D emulator, каталог инструмента, диалект стойки
// V0.997 — переключатель вида стал парой подписанных кнопок 2D / 2.5D
assert(simSource.includes('function draw2D')&&simSource.includes('data-lsim-mode="flat"')&&simSource.includes('data-lsim-mode="solid"'),'flat 2D emulator renderer or its mode switch is missing');
// V0.999 — подсветка переехала в общее ядро, оба эмулятора берут её оттуда
{const core=fs.readFileSync('cnc-sim-core.js','utf8');
 assert(core.includes('function highlightGcode')&&core.includes('GK_THEMES'),'G-code syntax colouring is missing from the shared core');
 assert(core.includes('window.RazryadSimCore='),'shared core does not export RazryadSimCore');
 assert(simSource.includes('data-lsim-codetheme="cimco"'),'CIMCO colour theme selector is missing from the lathe emulator');
 assert(!simSource.includes('function highlightGcode'),'lathe emulator still keeps its own copy of the highlighter');
 const mill=fs.readFileSync('mill-sim-v99.js','utf8');
 assert(mill.includes('window.RazryadSimCore')&&!mill.includes('window.RazryadCNC'),'milling emulator must take shared helpers from the core, not from the lathe');
 const order=html.indexOf('cnc-sim-core.js');
 assert(order>0&&order<html.indexOf('lathe-sim-v99.js')&&order<html.indexOf('mill-sim-v99.js'),'shared core must be loaded before both emulators');
 assert(fs.readFileSync('sw.js','utf8').includes('./cnc-sim-core.js'),'shared core is missing from the offline cache list');}
assert(simSource.includes('function makeCutter')&&simSource.includes('cloneStock'),'incremental material cutter is missing');
assert(simSource.includes('drawToolPreview')&&simSource.includes('data-tool-preview'),'tool preview is missing');
assert(simSource.includes('data-lsim-dialect="fanuc"')&&simSource.includes("cfg.dialect==='fanuc'"),'Haas/Fanuc dialect switch is missing');
assert(run('Object.keys(RazryadCNC.TOOL_LIBRARY).length')>=25,'tool catalog was not expanded');
assert(run("Object.values(RazryadCNC.TOOL_LIBRARY).filter(t=>t.brazed).length")>=6,'brazed (napayne) tools are missing from the catalog');
assert(run("Object.values(RazryadCNC.TOOL_LIBRARY).filter(t=>t.group==='axial').length")>=5,'axial tools (drills, tap, reamer) are missing');
assert(run("RazryadCNC.parseGcode(['G21','G187 P3','T0101','G00 X50. Z2.','G01 Z-10. F0.2'].join(String.fromCharCode(10)),{...RazryadCNC.defaults(),dialect:'fanuc'}).issues.some(i=>/G187/.test(i.text))")===true,'Fanuc dialect does not flag Haas-only codes');

// V0.995 — крупнее сцена, перетаскивание, полный экран
assert(simSource.includes('function bindCanvasGestures')&&simSource.includes('pointermove'),'canvas pan/pinch gestures are missing');
assert(simSource.includes('function zoomAt')&&simSource.includes("addEventListener('wheel'"),'anchored zoom by wheel/pinch is missing');
assert(simSource.includes('function toggleFullscreen')&&simSource.includes('id="lsimFull"')&&simSource.includes('data-fs="exit"'),'fullscreen mode or its exit control is missing');
assert(fs.readFileSync('v99.css','utf8').includes('.lsim-stage.full'),'fullscreen styles are missing');

// V0.996 — токарные циклы, реальные размеры инструмента, сторона контура
const NL=String.fromCharCode(10);
const cyc=(lines,over)=>run("RazryadCNC.parseGcode("+JSON.stringify(lines.join(NL))+",{...RazryadCNC.defaults(),stockD:70,length:100,grip:25"+(over||"")+"})");
const cut=r=>r.segments.filter(s=>s.cutting).length, bad=r=>r.issues.filter(i=>i.type==='bad').length;

const g72=cyc(['G21','G18','G97 S700 M03','T0101','G00 X72. Z2.','G72 W2. R0.5','G72 P10 Q20 U0.4 W0.1 F0.25',
 'N10 G00 Z-30.','G01 X60. F0.15','Z-20.','X40.','Z-5.','N20 X20.','G00 X200. Z200.','M30'],",dialect:'fanuc'");
assert(cut(g72)>5&&bad(g72)===0,'G72 rough facing cycle is not expanded cleanly');
assert(g72.segments.some(s=>s.cycle==='G72'),'G72 segments are not tagged with the cycle');

const g94=cyc(['G21','G18','G97 S800 M03','T0101','G00 X72. Z2.','G94 X20. Z-1. F0.2','Z-2.','G00 X200. Z200.','M30']);
assert(cut(g94)>=2&&bad(g94)===0,'G94 facing cycle is not expanded');

const g92=cyc(['G21','G18','G97 S600 M03','T0505 (THREAD)','G00 X42. Z5.','G92 X39.4 Z-25. F1.5','X39.0','G00 X200. Z200.','M30']);
assert(cut(g92)>=2&&bad(g92)===0,'G92 threading cycle is not expanded');
assert(g92.segments.some(s=>s.cycle==='G92'&&s.operation==='thread'),'G92 passes are not marked as threading');

const g73=cyc(['G21','G18','G97 S700 M03','T0101','G00 X72. Z2.','G73 U3. W1. R4','G73 P50 Q60 U0.4 W0.1 F0.25',
 'N50 G00 X40.','G01 Z0. F0.15','X44. Z-2.','Z-30.','N60 X72.','G00 X200. Z200.','M30'],",dialect:'fanuc'");
assert(cut(g73)===4&&bad(g73)===0,'G73 pattern-repeat cycle must produce one pass per R');

const sysB=cyc(['G21','G18','G97 S800 M03','T0101','G00 X72. Z2.','G77 X66. Z-40. F0.25','G79 X20. Z-1. F0.2','G00 X200. Z200.','M30'],",dialect:'fanuc'");
assert(sysB.segments.some(s=>s.cycle==='G90')&&sysB.segments.some(s=>s.cycle==='G94'),'G77/G79 must map to the G90/G94 cycles');

// контур P–Q не должен исполняться второй раз как обычные кадры
assert(g72.segments.filter(s=>!s.cycle).length<=2,'G72 contour between P and Q is executed twice');

// подрезка торца снимает слой до свободного торца, а не тонкий срез
const face=cyc(['G21','G18','G97 S800 M03','T0101','G00 X72. Z2.','G94 X20. Z-3. F0.2','G00 X200. Z200.','M30']);
assert(bad(face)===0,'single-pass facing must not report a phantom collision');

// реальные размеры инструмента
const LIB=run('RazryadCNC.TOOL_LIBRARY');
assert(LIB.cnmg.shankH===25&&LIB.cnmg.edge>10,'external holder must carry a real shank and insert size');
assert(LIB.ccmt.minBore===20&&LIB.ccmt25.minBore===32,'boring bars must carry catalogue minimum bores');
assert(LIB.mgmn.maxDepth===15&&LIB.cutoff.maxDepth>20,'grooving blades must carry a maximum cut depth');
assert(Object.values(LIB).every(t=>t.note&&t.note.length>10),'every tool needs a plain-language note');

// глубина канавки сверх возможностей пластины
const deep=cyc(['G21','G18','G97 S600 M03','T0303 (MGMN GROOVE)','G00 X70. Z-20.','G75 R0.5','G75 X20. Z-23. P1500 Q2000 F0.08','G00 X200. Z200.','M30'],",dialect:'fanuc'");
assert(deep.issues.some(i=>/рассчитана максимум/.test(i.text)),'over-deep groove must be reported');

// сторона снятия берётся из геометрии контура
const insideCut=cyc(['G21','G18','G97 S900 M03','T0404 (SCLCR BORING)','G00 X24. Z2.','G71 U1. R0.4','G71 P30 Q40 U-0.4 W0.1 F0.15',
 'N30 G00 X34.','G01 Z0. F0.1','Z-25.','N40 X30.','G00 Z50.','M30'],",dialect:'fanuc'");
assert(insideCut.segments.some(s=>s.cycle==='G71'),'inner G71 contour is not expanded');

console.log('chpu smoke tests: OK');
