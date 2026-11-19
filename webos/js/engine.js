(function(global){
'use strict';
if(!global.Promise){
function MiniPromise(executor){var self=this;self.state=0;self.value=null;self.handlers=[];function settle(state,value){if(self.state)return;if(value&&typeof value.then==='function'){value.then(function(v){settle(1,v);},function(e){settle(2,e);});return;}self.state=state;self.value=value;setTimeout(function(){var h=self.handlers.slice(0);self.handlers=[];for(var i=0;i<h.length;i++)run(h[i]);},0);}function run(h){var cb=self.state===1?h.ok:h.fail;if(typeof cb!=='function'){(self.state===1?h.resolve:h.reject)(self.value);return;}try{h.resolve(cb(self.value));}catch(e){h.reject(e);}}self.then=function(ok,fail){return new MiniPromise(function(resolve,reject){var h={ok:ok,fail:fail,resolve:resolve,reject:reject};if(self.state)setTimeout(function(){run(h);},0);else self.handlers.push(h);});};self['catch']=function(fail){return self.then(null,fail);};try{executor(function(v){settle(1,v);},function(e){settle(2,e);});}catch(e){settle(2,e);}}
global.Promise=MiniPromise;
}

var VERSION='1.0.0', PREFIX='cos_engine_', providers={}, plugins={}, listeners={};
function parse(v,fallback){try{return JSON.parse(v);}catch(e){return fallback;}}
var storage={
 get:function(key,fallback){try{var v=global.localStorage.getItem(PREFIX+key);return v===null?fallback:parse(v,fallback);}catch(e){return fallback;}},
 set:function(key,value){try{global.localStorage.setItem(PREFIX+key,JSON.stringify(value));return true;}catch(e){return false;}},
 remove:function(key){try{global.localStorage.removeItem(PREFIX+key);return true;}catch(e){return false;}}
};
var events={
 on:function(name,fn){if(typeof fn!=='function')return;listeners[name]=listeners[name]||[];listeners[name].push(fn);},
 off:function(name,fn){var a=listeners[name]||[],i;for(i=a.length-1;i>=0;i--)if(a[i]===fn)a.splice(i,1);},
 emit:function(name,data){var a=(listeners[name]||[]).slice(0),i;for(i=0;i<a.length;i++){try{a[i](data);}catch(e){}}}
};
function normalize(item){if(!item||!item.id||!item.title)return null;return {id:String(item.id),title:String(item.title),year:item.year||'',kind:item.kind||'Фильм',genre:item.genre||'',rating:item.rating||'',poster:item.poster||'',description:item.description||item.desc||'',url:item.url||'',provider:item.provider||'',kpId:item.kpId||item.kinopoiskId||'',imdbId:item.imdbId||'',filmixId:item.filmixId||'',raw:item.raw||null};}
var catalog={
 normalize:normalize,
 merge:function(base,extra){var out=[],seen={},i,m;for(i=0;i<(base||[]).length;i++){m=normalize(base[i]);if(m&&!seen[m.id]){seen[m.id]=1;out.push(m);}}for(i=0;i<(extra||[]).length;i++){m=normalize(extra[i]);if(m&&!seen[m.id]){seen[m.id]=1;out.push(m);}}return out;},
 search:function(items,query){var q=String(query||'').toLowerCase(),out=[],i,m;if(!q)return (items||[]).slice(0);for(i=0;i<(items||[]).length;i++){m=items[i];if(String(m.title||'').toLowerCase().indexOf(q)>=0)out.push(m);}return out;},
 get:function(items,id){var i;for(i=0;i<(items||[]).length;i++)if(String(items[i].id)===String(id))return items[i];return null;}
};
var sources={
 register:function(source){if(!source||!source.id||!source.name)return false;providers[source.id]=source;events.emit('sources:changed',sources.list());return true;},
 unregister:function(id){if(providers[id]){delete providers[id];events.emit('sources:changed',sources.list());return true;}return false;},
 get:function(id){return providers[id]||null;},
 list:function(){var out=[],k,p;for(k in providers)if(providers.hasOwnProperty(k)){p=providers[k];out.push({id:p.id,name:p.name,enabled:p.enabled!==false,capabilities:p.capabilities||[]});}return out;},
 search:function(query,callback,context){var keys=[],k,i,results=[],pending=0,finished=false;for(k in providers)if(providers.hasOwnProperty(k)&&providers[k].enabled!==false&&typeof providers[k].search==='function')keys.push(k);if(!keys.length){callback(null,[]);return;}pending=keys.length;function done(err,items,id){var j;if(items&&items.length)for(j=0;j<items.length;j++){items[j].provider=items[j].provider||id;results.push(items[j]);}pending--;if(pending===0&&!finished){finished=true;callback(null,results);}}for(i=0;i<keys.length;i++)(function(id){try{providers[id].search(query,function(err,items){done(err,items,id);},context);}catch(e){done(e,[],id);}})(keys[i]);},
 resolve:function(providerId,item,callback){var p=providers[providerId];if(!p||typeof p.resolve!=='function'){callback(new Error('Источник не поддерживает разрешение ссылок'));return;}try{p.resolve(item,callback);}catch(e){callback(e);}}
};
var playback={
 canPlayUrl:function(url){url=String(url||'').toLowerCase();return url.indexOf('http://')===0||url.indexOf('https://')===0;},
 remember:function(id,position,duration){var h=storage.get('history',[]),out=[{id:String(id),position:Number(position)||0,duration:Number(duration)||0,updated:(new Date()).getTime()}],i;for(i=0;i<h.length;i++)if(String(h[i].id)!==String(id))out.push(h[i]);storage.set('history',out.slice(0,50));events.emit('history:changed',out);},
 history:function(){return storage.get('history',[]);},
 clearHistory:function(){storage.set('history',[]);events.emit('history:changed',[]);}
};
var api={
 version:VERSION,
 storage:storage,
 events:events,
 catalog:catalog,
 sources:sources,
 playback:playback,
 plugins:{
  register:function(plugin){if(!plugin||!plugin.id||!plugin.version)return false;plugins[plugin.id]=plugin;try{if(typeof plugin.activate==='function')plugin.activate(api);}catch(e){delete plugins[plugin.id];return false;}events.emit('plugins:changed',api.plugins.list());return true;},
  unregister:function(id){var p=plugins[id];if(!p)return false;try{if(typeof p.deactivate==='function')p.deactivate(api);}catch(e){}delete plugins[id];events.emit('plugins:changed',api.plugins.list());return true;},
  list:function(){var out=[],k;for(k in plugins)if(plugins.hasOwnProperty(k))out.push({id:plugins[k].id,version:plugins[k].version,name:plugins[k].name||plugins[k].id});return out;}
 }
};
global.CinemaEngine=api;
})(this);
