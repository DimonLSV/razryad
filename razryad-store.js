/* РАЗРЯД · общее хранилище на устройстве.
 *
 * Три вещи, которых раньше не было и каждая из которых стоила оператору данных
 * или доверия к показанным числам:
 *
 * 1. Версия схемы. Карточки инструмента, вид сцены и раскладка главной писались
 *    свободным JSON. Стоило релизу переименовать или перемасштабировать поле —
 *    старая запись грузилась частично заполненной, и эмулятор рисовал и печатал
 *    не тот инструмент, что стоит в револьверной головке. Теперь у каждой записи
 *    есть номер схемы: при несовпадении данные не домысливаются, а сбрасываются,
 *    и оператору об этом говорят.
 *
 * 2. Честный результат записи. Все сохранения глушили ошибку пустым catch. У порога
 *    квоты (а туда легко упереться: фотография наладки лежит в том же бюджете ~5 МБ
 *    как base64-строка) оператор правил карточку инструмента, не видел ошибки, а при
 *    следующем открытии получал старую геометрию. Теперь save() возвращает результат.
 *
 * 3. Координация вкладок. Обе PWA и вкладка браузера делят один origin и одни ключи,
 *    а все записи — «прочитал, изменил, записал». Вкладка A читала журнал, вкладка B
 *    добавляла садку, вкладка A сохраняла — запись B исчезала без предупреждения.
 */
(function(){
'use strict';

const listeners=new Map();   /* ключ -> набор обработчиков внешнего изменения */
const resetHooks=[];         /* уведомления о сбросе несовместимой записи */
let lastError=null;

function notifyReset(key,was,now){
 for(const cb of resetHooks){try{cb(key,was,now)}catch(_){}}
}

/* Чтение. Запись без номера схемы считается наследием текущей версии: на первом
   обновлении пользователь не должен потерять уже настроенные карточки. */
function load(key,version,fallback){
 let raw;
 try{raw=localStorage.getItem(key)}catch(_){return fallback}
 if(raw==null)return fallback;
 let parsed;
 try{parsed=JSON.parse(raw)}catch(_){
  notifyReset(key,'повреждённая запись',version);
  return fallback;
 }
 if(parsed==null)return fallback;
 if(typeof parsed!=='object'||Array.isArray(parsed)||parsed.__v===undefined)return parsed; /* наследие */
 if(parsed.__v!==version){
  notifyReset(key,parsed.__v,version);
  return fallback;
 }
 return parsed.d;
}

/* Запись. Возвращает true при успехе; причина отказа доступна через lastFailure(). */
function save(key,version,data){
 let payload;
 try{payload=JSON.stringify({__v:version,d:data})}
 catch(e){lastError={key,reason:'not-serializable',error:e};return false}
 try{localStorage.setItem(key,payload);lastError=null;return true}
 catch(e){
  const quota=e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22);
  lastError={key,reason:quota?'quota':'blocked',error:e};
  return false;
 }
}

function remove(key){try{localStorage.removeItem(key);return true}catch(e){lastError={key,reason:'blocked',error:e};return false}}

function lastFailure(){return lastError}

/* Человеческое объяснение отказа — чтобы вызывающий код не сочинял текст сам. */
function failureText(){
 if(!lastError)return '';
 if(lastError.reason==='quota')return 'Память устройства для приложения заполнена — запись не сохранена. Удалите старые программы или фотографию наладки в разделе «Ещё».';
 if(lastError.reason==='not-serializable')return 'Запись не удалось сохранить: данные не приводятся к тексту.';
 return 'Браузер запретил запись на устройство. Проверьте, не открыто ли приложение в приватном окне и не заблокированы ли данные сайтов.';
}

/* Изменение из другой вкладки или из второй установленной PWA. */
function watch(key,cb){
 if(!listeners.has(key))listeners.set(key,new Set());
 listeners.get(key).add(cb);
 return ()=>listeners.get(key).delete(cb);
}
function onReset(cb){resetHooks.push(cb);}

if(typeof window!=='undefined'&&window.addEventListener){
 window.addEventListener('storage',e=>{
  if(!e||!e.key)return;
  const set=listeners.get(e.key);
  if(!set||!set.size)return;
  let value=null;
  try{const p=JSON.parse(e.newValue||'null');value=p&&typeof p==='object'&&p.__v!==undefined?p.d:p}catch(_){}
  for(const cb of set){try{cb(value,e)}catch(_){}}
 });
}

window.RazryadStore={load,save,remove,watch,onReset,lastFailure,failureText,
 /* Версии схем. Поднимайте номер, когда меняется форма записи, а не её содержимое. */
 V:{latheTools:1,millTools:1,latheView:1,millView:1,workLayout:1,setup:1,inspection:1,shopLog:1}};
})();
