(function(global){
'use strict';
var Engine=global.CinemaEngine;
if(!Engine||global.CinemaOnlineSources)return;
var PREFIX='cos_online_';
function cfg(){return Engine.storage.get(PREFIX+'config',{rezkaHost:'https://rezka.ag',filmixHost:'https://filmix.gg',filmixToken:'',collapsHost:'https://api.nextembed.ws'});}
function trim(v){return String(v||'').replace(/^\s+|\s+$/g,'');}
function enc(v){return encodeURIComponent(String(v||''));}
function req(url,method,body,headers,callback){
 var x=new XMLHttpRequest(),done=false,t=setTimeout(function(){if(done)return;done=true;try{x.abort();}catch(e){}callback(new Error('Таймаут запроса'));},18000);
 x.onreadystatechange=function(){if(x.readyState!==4||done)return;done=true;clearTimeout(t);if(x.status>=200&&x.status<300)callback(null,x.responseText,x);else callback(new Error('HTTP '+x.status+' — '+url));};
 x.onerror=function(){if(done)return;done=true;clearTimeout(t);callback(new Error('Нет доступа к источнику: CORS, сеть или блокировка сайта'));};
 try{x.open(method||'GET',url,true);x.withCredentials=false;x.setRequestHeader('Accept','*/*');if(body!==null&&body!==undefined)x.setRequestHeader('Content-Type','application/x-www-form-urlencoded; charset=UTF-8');var h=headers||{};for(var k in h)if(h.hasOwnProperty(k))x.setRequestHeader(k,h[k]);x.send(body||null);}catch(e){clearTimeout(t);callback(e);}
}
function json(text){try{return JSON.parse(text);}catch(e){return null;}}
function decodeHtml(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,function(a,n){return String.fromCharCode(parseInt(n,10));});}
function plain(s){return decodeHtml(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).replace(/^\s+|\s+$/g,'');}
function absolute(url,base){if(/^https?:\/\//i.test(url))return url;return base.replace(/\/+$/,'')+'/'+String(url||'').replace(/^\/+/,'');}
function quality(url){var m=String(url||'').match(/(?:^|[^\d])(2160|1440|1080|720|480|360)p?/i);return m?m[1]+'p':'';}
function dedupe(a){var out=[],seen={},i,k;for(i=0;i<a.length;i++){k=a[i].url||a[i].id;if(k&&!seen[k]){seen[k]=1;out.push(a[i]);}}return out;}
function rezkaSearch(query,cb){
 var host=trim(cfg().rezkaHost).replace(/\/+$/,'')||'https://rezka.ag';
 var url=host+'/search/?do=search&subaction=search&q='+enc(query);
 req(url,'GET',null,{},function(err,html){
  if(err){cb(err,[]);return;}
  var out=[],re=/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi,m;
  while((m=re.exec(html))&&out.length<15){
   var href=m[2],attrs=m[1],title=plain(m[3]),full=absolute(href,host);
   if(!title||!/\/(films|series)\//i.test(full))continue;
   var year='',ym=html.slice(Math.max(0,m.index-500),m.index+1200).match(/\b(19\d{2}|20\d{2})\b/);if(ym)year=ym[1];
   out.push({id:'rezka_'+out.length+'_'+enc(full),title:title,year:year,provider:'online-rezka',source:'HDRezka',kind:'online',url:full});
  }
  cb(null,dedupe(out));
 });
}
function rezkaResolve(item,cb){
 req(item.url,'GET',null,{},function(err,html){
  if(err){cb(err,[]);return;}
  var m=html.match(/\.initCDNMoviesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/);
  var series=html.match(/\.initCDNSeriesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/);
  var filmId=(m||series||[])[1],voice=(m||series||[])[2];
  if(!filmId||!voice){cb(new Error('HDRezka не отдала параметры плеера. Возможно, нужна авторизация или проверка зеркала.'),[]);return;}
  if(series){cb(new Error('HDRezka нашла сериал. Выбор сезонов и серий добавим следующим этапом; сейчас этот вариант не запускается автоматически.'),[]);return;}
  var fav=html.match(/<input[^>]+id=["']ctrl_favs["'][^>]+value=["']([^"']*)/i),favs=fav?fav[1]:'';
  var post='id='+enc(filmId)+'&translator_id='+enc(voice)+'&is_camrip='+enc(m[3])+'&is_ads='+enc(m[4])+'&is_director='+enc(m[5])+'&favs='+enc(favs)+'&action=get_movie';
  var host=trim(cfg().rezkaHost).replace(/\/+$/,'')||'https://rezka.ag';
  req(host+'/ajax/get_cdn_series/?t='+(new Date()).getTime(),'POST',post,{'X-Requested-With':'XMLHttpRequest','Referer':item.url},function(e,data){
   if(e){cb(e,[]);return;}
   var d=json(data);if(!d||!d.url){cb(new Error('HDRezka не вернула видеопоток. Проверьте доступность фильма и авторизацию.'),[]);return;}
   var raw=String(d.url),urls=raw.match(/https?:\\?\/\\?\/[^"'\\\s,]+/g)||[],out=[];
   for(var i=0;i<urls.length;i++){var u=urls[i].replace(/\\\//g,'/').replace(/\\u0026/g,'&');if(/\.(m3u8|mp4)(\?|$)/i.test(u))out.push({name:'HDRezka '+(quality(u)||'Видео'),size:0,url:u,provider:'online-rezka'});}
   if(!out.length){cb(new Error('Сайт вернул защищённый или закодированный плейлист, который нельзя безопасно разобрать в Cinema OS.'),[]);return;}
   cb(null,dedupe(out));
  });
 });
}
function filmixSearch(query,cb){
 var host=trim(cfg().filmixHost).replace(/\/+$/,'')||'https://filmix.gg';
 req(host+'/api/v2/suggestions?search_word='+enc(query),'GET',null,{},function(err,data){
  if(err){cb(err,[]);return;}
  var d=json(data),rows=d&&(d.posts||d)||[],out=[];
  if(!rows||!rows.length){cb(null,[]);return;}
  for(var i=0;i<rows.length&&i<15;i++){var r=rows[i];out.push({id:'filmix_'+(r.id||r.post_id||i),filmixId:r.id||r.post_id||'',title:r.title||r.name||'',year:r.year||'',poster:r.poster||r.img||'',provider:'online-filmix',source:'Filmix',kind:'online'});}
  cb(null,dedupe(out));
 });
}
function filmixResolve(item,cb){
 var token=trim(cfg().filmixToken);
 if(!token){cb(new Error('Для получения потока Filmix нужен ваш собственный токен аккаунта. Добавим поле настройки; чужие токены не используются.'),[]);return;}
 var host=trim(cfg().filmixHost).replace(/\/+$/,'')||'https://filmix.gg';
 var device='cos'+(new Date()).getTime().toString(16);
 var url=host+'/api/v2/post/'+enc(item.filmixId)+'?user_dev_id='+enc(device)+'&user_dev_name=webOS&user_dev_token='+enc(token)+'&user_dev_vendor=LG&user_dev_os=webOS&user_dev_apk=1&app_lang=ru-RU';
 req(url,'GET',null,{},function(err,data){
  if(err){cb(err,[]);return;}
  var d=json(data),out=[],links=d&&d.player_links||{},movie=links.movie||{};
  var keys=Object.keys(movie);
  for(var i=0;i<keys.length;i++){var val=movie[keys[i]],u=typeof val==='string'?val:val&&val.url;if(u&&/^https?:\/\//i.test(u))out.push({name:'Filmix '+keys[i],url:u,provider:'online-filmix'});}
  if(!out.length)cb(new Error('Filmix не вернул прямые варианты. Возможно, нужна активная подписка или другой способ авторизации.'),[]);
  else cb(null,out);
 });
}
function collapsResolve(item,cb){
 var c=cfg(),id=item.kpId||item.kinopoiskId||item.imdbId;
 if(!id){cb(new Error('Для Collaps нужен ID Кинопоиска или IMDb. У этой карточки ID пока не указан.'),[]);return;}
 var prefix=/^\d+$/.test(String(id))?'kp/':'imdb/';
 var host=trim(c.collapsHost).replace(/\/+$/,'')||'https://api.nextembed.ws';
 req(host+'/embed/'+prefix+enc(id),'GET',null,{},function(err,data){
  if(err){cb(err,[]);return;}
  var m=data.match(/makePlayer\(\s*(\{[\s\S]*?\})\s*\);/),obj=null;
  if(m){try{obj=JSON.parse(m[1]);}catch(e){}}
  if(!obj){cb(new Error('Collaps не вернул совместимый открытый ответ.'),[]);return;}
  var src=obj.source||{},playlist=obj.playlist||{},out=[];
  if(src.hls&&/^https?:\/\//i.test(src.hls))out.push({name:'Collaps · '+(obj.title||'Видео'),url:src.hls,provider:'online-collaps'});
  var seasons=playlist.seasons||[];
  for(var si=0;si<seasons.length;si++){var eps=seasons[si].episodes||[];for(var ei=0;ei<eps.length;ei++){var u=eps[ei].hls||eps[ei].dash;if(u&&/^https?:\/\//i.test(u))out.push({name:'С'+seasons[si].season+' · '+(eps[ei].episode||ei+1),url:u,provider:'online-collaps'});}}
  if(out.length)cb(null,out);else cb(new Error('В ответе Collaps нет прямого HLS-потока.'),[]);
 });
}
var plugin={
 id:'cinema-online-adapters',version:'0.1.0',name:'Cinema Online Adapters',
 activate:function(api){
  api.sources.register({id:'online-rezka',name:'HDRezka',enabled:true,capabilities:['title-search','direct-stream'],search:rezkaSearch,resolve:rezkaResolve});
  api.sources.register({id:'online-filmix',name:'Filmix',enabled:true,capabilities:['title-search','account-token','direct-stream'],search:filmixSearch,resolve:filmixResolve});
  api.sources.register({id:'online-collaps',name:'Collaps',enabled:true,capabilities:['kp-id','imdb-id','direct-stream'],search:function(q,cb){cb(null,[]);},resolve:collapsResolve});
 },
 configure:function(values){var old=cfg(),next={},k;for(k in old)next[k]=old[k];for(k in values)next[k]=values[k];Engine.storage.set(PREFIX+'config',next);return next;},
 settings:cfg,
 status:function(){return [{id:'online-rezka',name:'HDRezka',mode:'Поиск по названию; прямой доступ зависит от CORS и доступности зеркала.'},{id:'online-filmix',name:'Filmix',mode:cfg().filmixToken?'Токен настроен':'Для получения потоков требуется собственный токен.'},{id:'online-collaps',name:'Collaps',mode:'Нужен ID Кинопоиска или IMDb.'}];}
};
global.CinemaOnlineSources=plugin;
Engine.plugins.register(plugin);
})(this);
