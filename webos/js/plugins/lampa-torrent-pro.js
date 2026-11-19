(function(global){
'use strict';
var Engine=global.CinemaEngine;
if(!Engine||global.LampaTorrentPro)return;
var PREFIX='ltp_';
var legacyPlugins=[
{id:'online_mod',name:'Онлайн МОД',url:'https://nb557.github.io/plugins/online_mod.js',runtime:'Lampa'},
{id:'showy',name:'Showy',url:'http://showy.online/m.js',runtime:'Lampa'},
{id:'online_cinema',name:'Онлайн Cinema',url:'https://bylampa.github.io/cinema.js',runtime:'Lampa'},
{id:'hermes_movie',name:'Hermes Movie',url:'https://asimut.github.io/l/b.js',runtime:'Lampa'}
];
function cfg(){return Engine.storage.get('ltp_config',{jackettUrl:'',jackettKey:'',region:'RU',quality:'1080p',audio:'русская'});}
function cleanBase(v){return String(v||'').replace(/^\s+|\s+$/g,'').replace(/\/+$/,'');}
function request(url,timeout){return new Promise(function(resolve,reject){var x=new XMLHttpRequest(),done=false,t=setTimeout(function(){if(done)return;done=true;try{x.abort();}catch(e){}reject(new Error('Таймаут запроса'));},timeout||18000);x.onreadystatechange=function(){if(x.readyState!==4||done)return;done=true;clearTimeout(t);if(x.status>=200&&x.status<300){try{resolve(JSON.parse(x.responseText));}catch(e){reject(new Error('Некорректный JSON'));}}else reject(new Error('HTTP '+x.status));};x.onerror=function(){if(!done){done=true;clearTimeout(t);reject(new Error('Сетевая ошибка или CORS'));}};try{x.open('GET',url,true);x.send(null);}catch(e){done=true;clearTimeout(t);reject(e);}});}
function size(n){n=Number(n)||0;if(!n)return '';var u=['Б','КБ','МБ','ГБ','ТБ'],i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return n.toFixed(i>1?1:0)+' '+u[i];}
function quality(title){var t=String(title||'');return /\b(2160p|4k|uhd)\b/i.test(t)?'4K':/\b(1080p|1080i|full.?hd)\b/i.test(t)?'1080p':/\b(720p|hd)\b/i.test(t)?'720p':/\b(480p|sd)\b/i.test(t)?'480p':'';}
function rank(entry){var c=cfg(),t=String(entry.title||'').toLowerCase(),q=String(c.quality||'1080p').toLowerCase(),a=String(c.audio||'').toLowerCase(),s=0,found=quality(t);if(q.indexOf('4k')>=0)s+=found==='4K'?500:found==='1080p'?250:0;else if(q.indexOf('720')>=0)s+=found==='720p'?500:found==='1080p'?350:0;else s+=found==='1080p'?500:found==='4K'?400:found==='720p'?250:0;if(a&&t.indexOf(a)>=0)s+=350;else if(/рус|russian|\brus\b|дубляж|многоголос/i.test(t))s+=80;s+=Math.min(150,(Number(entry.seeders)||0)*2);return s;}
function archiveSearch(query){var q='title:('+String(query||'').replace(/["():\\]/g,' ')+') AND mediatype:(movies)';var url='https://archive.org/advancedsearch.php?q='+encodeURIComponent(q)+'&fl[]=identifier&fl[]=title&fl[]=year&fl[]=downloads&sort[]=downloads+desc&rows=20&page=1&output=json';return request(url).then(function(d){return ((d&&d.response&&d.response.docs)||[]).map(function(x){return {id:'ia_'+x.identifier,archiveId:x.identifier,title:x.title||x.identifier,year:x.year||'',poster:'https://archive.org/services/img/'+encodeURIComponent(x.identifier),provider:'internet-archive',source:'Internet Archive',kind:'public-video',seeders:0,size:0};});});}
function jackettSearch(query){var c=cfg(),base=cleanBase(c.jackettUrl);if(!base)return Promise.resolve([]);var url=base+'/api/v2.0/indexers/all/results?apikey='+encodeURIComponent(c.jackettKey||'')+'&Query='+encodeURIComponent(query);return request(url,25000).then(function(d){var rows=d&&(d.Results||d.results)||[];return rows.map(function(r,i){return {id:'jk_'+i+'_'+String(r.Title||'').slice(0,32),title:String(r.Title||''),year:'',poster:'',provider:'jackett',source:r.Tracker||r.TrackerId||'Jackett',kind:'torrent',magnet:r.MagnetUri||'',link:r.Link||'',seeders:Number(r.Seeders)||0,size:Number(r.Size)||0};}).filter(function(x){return x.title&&(x.magnet||x.link);}).sort(function(a,b){return rank(b)-rank(a);}).slice(0,50);});}
function archiveFiles(item){return request('https://archive.org/metadata/'+encodeURIComponent(item.archiveId),20000).then(function(meta){var rankMap={mp4:0,m4v:1,webm:2,ogv:3,mkv:8,avi:9};return (meta&&meta.files||[]).filter(function(f){return f&&/\.(mp4|m4v|webm|ogv|mkv|avi)$/i.test(f.name||'')&&Number(f.size)>1048576;}).map(function(f){var ext=String(f.name).split('.').pop().toLowerCase();return {name:f.name,size:Number(f.size)||0,rank:rankMap[ext]===undefined?9:rankMap[ext],url:'https://archive.org/download/'+encodeURIComponent(item.archiveId)+'/'+String(f.name).split('/').map(encodeURIComponent).join('/'),provider:'internet-archive'};}).sort(function(a,b){return a.rank-b.rank||a.name.localeCompare(b.name);});});}
function searchAll(query,callback){var pending=2,results=[],errors=[];function done(name,err,items){if(err)errors.push(name+': '+err.message);(items||[]).forEach(function(x){results.push(x);});pending--;if(!pending){results.sort(function(a,b){return rank(b)-rank(a);});callback(null,results);}}archiveSearch(query).then(function(x){done('Internet Archive',null,x);},function(e){done('Internet Archive',e,[]);});jackettSearch(query).then(function(x){done('Jackett',null,x);},function(e){done('Jackett',e,[]);});}
var plugin={
id:'lampa-torrent-pro',version:'1.9.2-cos-port',name:'Lampa Torrent Pro',
activate:function(api){
api.sources.register({id:'internet-archive',name:'Internet Archive',enabled:true,capabilities:['search','direct-file','open-license-catalog'],search:function(q,cb){archiveSearch(q).then(function(a){cb(null,a);},function(e){cb(e,[]);});},resolve:function(item,cb){archiveFiles(item).then(function(a){cb(null,a);},function(e){cb(e,[]);});}});
api.sources.register({id:'jackett',name:'Jackett',enabled:!!cleanBase(cfg().jackettUrl),capabilities:['search','torrent','magnet'],search:function(q,cb){jackettSearch(q).then(function(a){cb(null,a);},function(e){cb(e,[]);});},resolve:function(item,cb){if(item&&item.kind==='torrent')cb(null,[{name:item.title,size:item.size||0,url:item.magnet||item.link,magnet:item.magnet||'',link:item.link||'',requiresTorrentServer:true,provider:'jackett'}]);else cb(new Error('Неизвестный результат Jackett'),[]);}});
api.events.emit('ltp:ready',{version:plugin.version});
},
deactivate:function(api){api.sources.unregister('internet-archive');api.sources.unregister('jackett');},
configure:function(values){var old=cfg(),next={},k;for(k in old)next[k]=old[k];for(k in values)next[k]=values[k];next.jackettUrl=cleanBase(next.jackettUrl);next.region=String(next.region||'RU').toUpperCase();Engine.storage.set('ltp_config',next);Engine.sources.register({id:'jackett',name:'Jackett',enabled:!!next.jackettUrl,capabilities:['search','torrent','magnet'],search:function(q,cb){jackettSearch(q).then(function(a){cb(null,a);},function(e){cb(e,[]);});},resolve:function(item,cb){cb(null,[{name:item.title,size:item.size||0,url:item.magnet||item.link,magnet:item.magnet||'',link:item.link||'',requiresTorrentServer:true,provider:'jackett'}]);}});return next;},
settings:function(){return cfg();},
search:function(q,cb){searchAll(q,cb);},
legacyIntegrations:function(){return legacyPlugins.slice(0);},
officialSearchUrl:function(q){var c=cfg();return 'https://www.justwatch.com/'+String(c.region||'RU').toLowerCase()+'/search?q='+encodeURIComponent(q||'');},
formatSize:size,
quality:quality,
rank:rank
};
global.LampaTorrentPro=plugin;
Engine.plugins.register(plugin);
})(this);
