const fs=require('fs'),vm=require('vm');
const storage=new Map(),localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let copied='',sheetOpen=true;const sheet={classList:{remove(v){if(v==='open')sheetOpen=false}}};
const root={querySelectorAll(){return[]}},document={readyState:'complete',body:root,querySelectorAll(s){return s.includes('#sheet.open')?[sheet]:[]}};
class MutationObserver{constructor(fn){this.fn=fn}observe(){}}
const location={pathname:'/generator.html',href:''};
const navigator={clipboard:{writeText(v){copied=v;return Promise.resolve()}}};
const ctx=vm.createContext({console,document,MutationObserver,localStorage,location,navigator,Date});ctx.window=ctx;
vm.runInContext(fs.readFileSync('cnc-emulator-bridge.js','utf8'),ctx,{filename:'cnc-emulator-bridge.js'});
const assert=(v,m)=>{if(!v)throw new Error(m)};
const E=ctx.RazryadEmulator;
/* признак NC-программы теперь общий: годится и токарная, и фрезерная */
assert(E.looksLikeNc('G00 X50 Z2\nG01 Z-20 F.2'),'valid X/Z lathe code was not detected');
assert(E.looksLikeNc('G17\nG00 X10 Y10\nG01 Z-3 F100'),'valid milling code was not detected');
assert(!E.looksLikeNc('просто текст без кода'),'plain text was mistaken for NC code');
assert(E.looksLikeLatheNc===E.looksLikeNc||E.looksLikeLatheNc('G00 X50 Z2\nG01 Z-20'),'legacy name looksLikeLatheNc stopped working');

/* V0.999 — куда ведём программу */
const kind=c=>E.detectDialect(c).kind;
assert(kind('G18 G21\nG00 X50. Z2.\nG01 Z-20. F0.2')==='lathe','G18 program must go to the lathe emulator');
assert(kind('G17 G21 G90\nG00 X10. Y10.\nG01 Z-3. F100')==='mill','G17 program with Y must go to the milling emulator');
assert(kind('G21 G99\nG50 S2000\nG96 S180 M03\nG71 P1 Q2 U.4 W.1 F.2')==='lathe','lathe cycles without Y must go to the lathe emulator');
assert(kind('G21 G90\nT01 M06\nG43 H01 Z50.\nG00 X10. Y20.\nG81 Z-10. R2. F120')==='mill','drilling cycles with Y must go to the milling emulator');
{const d=E.detectDialect('G21\nG00 X10. Y10. Z5.\nG01 Z-2. F100');
 assert(d.kind==='lathe'&&d.sure===false,'ambiguous X/Y/Z program must fall back to the lathe emulator and say so');}

ctx.RazryadEmulator.store({code:'G00 X50 Z2',title:'test'});
assert(ctx.RazryadEmulator.take().title==='test'&&!localStorage.getItem(ctx.RazryadEmulator.KEY),'handoff was not consumed exactly once');
ctx.RazryadEmulator.open('G18\nG00 X50 Z2\nG01 Z-10',{title:'from generator'});
assert(location.href==='./chpu.html?open=emulator','cross-page lathe handoff did not navigate to the lathe emulator');
location.href='';
ctx.RazryadEmulator.open('G17\nG00 X10. Y10.\nG01 Z-3. F100',{title:'mill from generator'});
assert(location.href==='./chpu.html?open=mill','cross-page milling handoff did not navigate to the milling emulator');
/* и в хранилище лежит пометка, чей это код */
assert(ctx.RazryadEmulator.peek().kind==='mill','handoff payload did not record which emulator it is for');

let received='';ctx.RazryadCNC={openWithCode(code){received=code;return true}};location.href='';
ctx.RazryadEmulator.open('G18\nG00 X60 Z3\nG01 Z-20',{title:'same page'});
assert(received.includes('X60')&&location.href==='','same-page handoff did not use the loaded lathe simulator');
let mill='';ctx.RazryadMill={openWithCode(code){mill=code;return true}};location.href='';
ctx.RazryadEmulator.open('G17\nG00 X60. Y20.\nG01 Z-4. F200',{title:'same page mill'});
assert(mill.includes('Y20')&&received.includes('X60')&&location.href==='','same-page milling handoff did not use the loaded milling simulator');
assert(copied.includes('Y20')&&!sheetOpen,'emulator button did not copy the code or close the open sheet before navigation');
console.log('emulator bridge smoke tests: OK');
