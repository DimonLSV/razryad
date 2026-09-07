/* Этап C, пункты 20-22 — хранилище на устройстве.
   Раньше записи не имели номера схемы (обновление приложения могло подсунуть
   эмулятору не тот инструмент), переполнение памяти глушилось пустым catch,
   а две вкладки затирали записи друг друга без предупреждения. */
const fs=require('fs'),vm=require('vm');
let n=0;
const assert=(v,m)=>{n++;if(!v)throw new Error(m)};

function makeCtx(opts){
 opts=opts||{};
 const map=new Map();
 const handlers={};
 const localStorage={
  getItem:k=>map.has(k)?map.get(k):null,
  setItem:(k,v)=>{if(opts.full){const e=new Error('quota');e.name='QuotaExceededError';throw e}map.set(k,v)},
  removeItem:k=>map.delete(k)
 };
 const ctx=vm.createContext({localStorage,console,JSON});
 ctx.window=ctx;
 ctx.window.addEventListener=(t,cb)=>{handlers[t]=cb};
 vm.runInContext(fs.readFileSync('razryad-store.js','utf8'),ctx,{filename:'razryad-store.js'});
 return{ctx,map,handlers,run:s=>vm.runInContext(s,ctx)};
}

/* --- 20. Версия схемы --- */
{
 const {run,map}=makeCtx();
 assert(run("RazryadStore.save('k',1,{d:5})")===true,'запись не удалась');
 const raw=JSON.parse(map.get('k'));
 assert(raw.__v===1,'номер схемы не записан');
 assert(run("JSON.stringify(RazryadStore.load('k',1,null))")==='{"d":5}','чтение своей версии сломано');
 /* другая версия — сброс, а не частично заполненные данные */
 const back=run("RazryadStore.load('k',2,{fallback:true})");
 assert(back&&back.fallback===true,'запись чужой версии не сброшена: '+JSON.stringify(back));
}
{
 /* Уведомление о сбросе должно доходить до интерфейса. */
 const {run}=makeCtx();
 run("RazryadStore.save('k',1,{a:1})");
 run("globalThis.resets=[];RazryadStore.onReset((key,was,now)=>resets.push(key+':'+was+'->'+now))");
 run("RazryadStore.load('k',3,null)");
 assert(run('resets.length')===1,'сброс несовместимой записи прошёл молча');
 assert(/k:1->3/.test(run('resets[0]')),'в уведомлении нет номеров версий: '+run('resets[0]'));
}
{
 /* Записи предыдущих версий приложения не должны пропадать при первом обновлении. */
 const {run,map}=makeCtx();
 map.set('legacy',JSON.stringify({1:{kind:'cnmg',diameter:12}}));
 const got=run("RazryadStore.load('legacy',1,{})");
 assert(got&&got['1']&&got['1'].kind==='cnmg','унаследованная запись без номера схемы потеряна');
}
{
 /* Повреждённый JSON не должен ронять экран. */
 const {run,map}=makeCtx();
 map.set('bad','{это не json');
 const got=run("RazryadStore.load('bad',1,{safe:true})");
 assert(got&&got.safe===true,'повреждённая запись не заменена значением по умолчанию');
}

/* --- 21. Честный результат записи --- */
{
 const {run}=makeCtx({full:true});
 assert(run("RazryadStore.save('k',1,{a:1})")===false,'переполнение памяти выдано за успешную запись');
 assert(run("RazryadStore.lastFailure().reason")==='quota','причина отказа определена неверно');
 const text=run('RazryadStore.failureText()');
 assert(/Память устройства/.test(text),'нет человеческого объяснения отказа: '+text);
}
{
 const {run}=makeCtx();
 run("RazryadStore.save('k',1,{a:1})");
 assert(run('RazryadStore.lastFailure()')===null,'успешная запись оставила отметку об ошибке');
}

/* --- 22. Координация вкладок --- */
{
 const {run,handlers}=makeCtx();
 assert(typeof handlers.storage==='function','нет подписки на изменения из другой вкладки');
 run("globalThis.seen=null;RazryadStore.watch('shared',v=>{globalThis.seen=v})");
 handlers.storage({key:'shared',newValue:JSON.stringify({__v:1,d:{batches:7}})});
 assert(run('seen&&seen.batches')===7,'изменение из соседней вкладки не доходит до экрана');
 handlers.storage({key:'other',newValue:'{}'});
 assert(run('seen&&seen.batches')===7,'обработчик срабатывает на чужой ключ');
}

/* --- подключение к приложению --- */
{
 const store=fs.readFileSync('razryad-store.js','utf8');
 assert(/V:\{/.test(store),'нет реестра версий схем');
 for(const [f,what] of [['lathe-sim-v99.js','карточки токарного инструмента'],['mill-sim-v99.js','карточки фрезерного инструмента'],['operator-tools.js','общее сохранение экранов']]){
  const s=fs.readFileSync(f,'utf8');
  assert(/RazryadStore/.test(s),`${what} (${f}) не переведены на версионированное хранилище`);
 }
 assert(/RazryadStore\.failureText\(\)/.test(fs.readFileSync('operator-tools.js','utf8')),'отказ записи в operator-tools по-прежнему не показывается оператору');
 for(const f of ['chpu.html','termist.html'])
  assert(fs.readFileSync(f,'utf8').includes('razryad-store.js'),`razryad-store.js не подключён к ${f}`);
 assert(fs.readFileSync('sw.js','utf8').includes('./razryad-store.js'),'razryad-store.js не попадёт в офлайн-кэш');
}

console.log(`этап C — хранилище на устройстве: OK (${n} проверок)`);
