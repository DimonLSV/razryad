const fs=require('fs'),vm=require('vm');
class E{constructor(s=''){this.s=s;this.value='';this.innerHTML='';this.textContent='';this.checked=false;this.dataset={};this.style={};this.offsetWidth=400;this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.parentElement=this;}addEventListener(){}querySelectorAll(){return[]}setAttribute(){}focus(){}click(){}appendChild(){}insertAdjacentHTML(){}remove(){}}
const els=new Map(),get=s=>{if(!els.has(s))els.set(s,new E(s));return els.get(s)};
const local=new Map(),localStorage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
const document={querySelector:get,querySelectorAll:()=>[],createElement:t=>new E(t),head:new E('head'),body:new E('body'),addEventListener(){}};
const ctx=vm.createContext({console,document,localStorage,navigator:{},history:{pushState(){},back(){}},location:{href:''},Event:function(){},Blob,URL:{createObjectURL(){return'blob:x'},revokeObjectURL(){}},confirm:()=>true,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},innerWidth:412,innerHeight:800});ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.window.scrollTo=()=>{};ctx.window.storage={get:async()=>{throw new Error('none')},set:async()=>({}),delete:async()=>({})};
const html=fs.readFileSync('termist.html','utf8'),scripts=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
vm.runInContext(scripts[scripts.length-1],ctx,{filename:'termist-inline.js'});
vm.runInContext('DB=seed()',ctx);
vm.runInContext(fs.readFileSync('termist-v99.js','utf8'),ctx,{filename:'termist-v99.js'});
const run=s=>vm.runInContext(s,ctx),assert=(v,m)=>{if(!v)throw new Error(m)};
assert(run("TABS.map(x=>x.id).join(',')")==='work,steels,reg,learn,more','termist navigation is incorrect');
assert(run('DB.steels.length')>=30,'steel reference was lost');
assert(run("RazryadThermistV99.hardnessConvert('HRC',40).HB")===375,'hardness conversion anchor is wrong');
assert(run("RazryadThermistV99.diagnose('crack')[1].length")>=4,'defect diagnosis is too shallow');
assert(run('RazryadThermistV99.processEstimate(20,820,8,40,.8).total')===132,'cycle estimate is wrong');
assert(run("FOLDERS.learn.some(x=>x[0]==='pyro')"),'pyrometry course is missing');
console.log('termist smoke tests: OK');
