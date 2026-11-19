(function () {
  'use strict';
  var sources = [
    { id:'online_mod', name:'Онлайн МОД', details:'HDRezka, Collaps, Filmix и другие модули Lampa', state:'НУЖЕН АДАПТЕР' },
    { id:'showy', name:'Showy', details:'VideoDB, VideoCDN, HDVB, Kinotochka', state:'НУЖЕН АДАПТЕР' },
    { id:'hermes', name:'Hermes Movie', details:'Kinogo, HDRezka, Filmix, VideoCDN', state:'НУЖЕН АДАПТЕР' },
    { id:'online_cinema', name:'Online Cinema', details:'Дополнительные онлайн-балансеры', state:'НУЖЕН АДАПТЕР' },
    { id:'lampac', name:'Lampac', details:'Подключение собственного сервера /online.js', state:'НУЖЕН СЕРВЕР' },
    { id:'jackett', name:'Jackett + TorrServer', details:'Поиск раздач и воспроизведение совместимых файлов', state:'НУЖНА НАСТРОЙКА' }
  ];
  var dialog = document.getElementById('dialog');
  var title = document.getElementById('dialog-title');
  var body = document.getElementById('dialog-body');
  var lastFocus = null;
  function el(tag, cls, text) { var n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.appendChild(document.createTextNode(text)); return n; }
  function openDialog(name, content) { lastFocus=document.activeElement; title.innerHTML=''; title.appendChild(document.createTextNode(name)); body.innerHTML=''; body.appendChild(content); dialog.className='dialog'; var f=dialog.querySelector('button'); if(f)f.focus(); }
  function closeDialog() { dialog.className='dialog hidden'; if(lastFocus&&lastFocus.focus)lastFocus.focus(); }
  function sourceList() { var box=el('div'); sources.forEach(function(s){var row=el('div','dialog-row'); var tag=el('span','dot',s.state); row.appendChild(tag); row.appendChild(el('b','',s.name)); row.appendChild(el('small','',s.details)); box.appendChild(row);}); var note=el('p','empty','Это список модулей из Lampa Torrent Pro. Скрипты Lampa нельзя напрямую запускать в webOS-приложении: для каждого источника нужен отдельный адаптер или совместимый серверный API.'); box.appendChild(note); return box; }
  function catalog(kind) { var box=el('div'); var input=el('input','search-input'); input.type='text'; input.placeholder='Название фильма или сериала'; input.setAttribute('aria-label','Поиск фильма'); box.appendChild(input); box.appendChild(el('p','empty',kind==='series'?'Каталог сериалов подключим через совместимый каталог API.':'Каталог фильмов подключим через совместимый каталог API. Сейчас оболочка готова; поиск требует настройки каталога и сетевого API.')); openDialog(kind==='series'?'Сериалы':'Поиск фильмов',box); }
  function action(name) { if(name==='sources')openDialog('Источники просмотра',sourceList()); else if(name==='catalog'||name==='series')catalog(name); else if(name==='continue')openDialog('Продолжить просмотр',el('p','empty','История появится после подключения и запуска первого совместимого потока.')); }
  var strip=document.getElementById('source-strip');
  sources.slice(0,4).forEach(function(s){var card=el('div','source-card'); card.appendChild(el('b','',s.name)); card.appendChild(el('small','',s.details)); strip.appendChild(card);});
  Array.prototype.forEach.call(document.querySelectorAll('[data-action]'),function(btn){btn.addEventListener('click',function(){action(btn.getAttribute('data-action'));});});
  document.getElementById('dialog-close').addEventListener('click',closeDialog);
  dialog.addEventListener('click',function(e){if(e.target===dialog)closeDialog();});
  function focusables(){return Array.prototype.slice.call(document.querySelectorAll('button:not([disabled]),input:not([disabled])')).filter(function(n){return n.offsetWidth||n.offsetHeight;});}
  document.addEventListener('keydown',function(e){var k=e.keyCode||e.which; if(k===461||k===27||k===8){if(dialog.className.indexOf('hidden')<0){e.preventDefault();closeDialog();}return;} if(k===13){var a=document.activeElement;if(a&&a.tagName==='BUTTON'){a.click();e.preventDefault();}return;} if(k===37||k===38||k===39||k===40){var list=focusables(),idx=list.indexOf(document.activeElement);if(idx<0){if(list.length)list[0].focus();return;} var next=idx;if(k===37||k===38)next=Math.max(0,idx-1);else next=Math.min(list.length-1,idx+1);if(list[next])list[next].focus();e.preventDefault();}});
  var clock=document.getElementById('clock'); if(clock){clock.innerHTML='PERSONAL CINEMA EXPERIENCE';}
}());