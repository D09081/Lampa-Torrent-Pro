/* Lampa Torrent Pro 1.1.0 — единый центр источников и просмотра для Lampa.
 * Каталог и поиск остаются штатными средствами Lampa. На карточке показываются официальные
 * варианты просмотра, торрент-источники и подключаемые онлайн-балансеры. Погода — Белгород. */
(function () {
  'use strict';

  var ID = 'lampa_torrent_pro';
  var VERSION = '1.1.0';
  var TITLE = 'Torrent Pro';

  if (window.__ltp_loaded) return;
  window.__ltp_loaded = true;

  var SEARCH_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3v8a7 7 0 0 0 14 0V3"/><path d="M5 7h4M15 7h4"/></svg>';
  var MAGNET_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3v8a7 7 0 0 0 14 0V3"/><path d="M5 7h4M15 7h4"/></svg>';

  /* ---------- утилиты ---------- */

  function get(key, fallback) {
    try {
      var v = Lampa.Storage.get(key, fallback);
      return v === undefined || v === null ? fallback : v;
    } catch (_) { return fallback; }
  }
  function str(key) { return String(get(key, '') || '').trim(); }

  function notify(text) {
    try { Lampa.Noty.show(text); } catch (_) { console.log('[LTP] ' + text); }
  }

  function fmtSize(bytes) {
    bytes = Number(bytes);
    if (!bytes || bytes < 0) return '';
    var units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'], i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
  }

  function getJSON(url, timeout) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeout || 15000;
      xhr.withCredentials = false;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('HTTP ' + xhr.status + (xhr.responseText ? ': ' + String(xhr.responseText).slice(0,120) : '')));
        try { resolve(JSON.parse(xhr.responseText)); }
        catch (e) { reject(new Error('Ответ не JSON: ' + String(xhr.responseText || '').slice(0,80))); }
      };
      xhr.onerror = function () { reject(new Error('Сетевой запрос заблокирован: проверьте DNS, HTTPS и CORS')); };
      xhr.ontimeout = function () { reject(new Error('Таймаут запроса')); };
      xhr.onabort = function () { reject(new Error('Запрос отменён')); };
      xhr.send();
    });
  }

  function normalizeBase(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url;
  }

  function jackettBase() { return normalizeBase(str('ltp_parser_url') || str('jackett_url')); }

  function currentController() {
    try { return Lampa.Controller.enabled().name || 'content'; } catch (_) { return 'content'; }
  }
  function backTo(name) {
    try { Lampa.Controller.toggle(name); } catch (_) {}
  }

  /* ---------- источники раздач ---------- */

  function searchArchive(query) {
    var q = 'title:(' + query.replace(/["():\\]/g, ' ') + ') AND mediatype:(movies)';
    var url = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) +
      '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=item_size&fl%5B%5D=downloads' +
      '&sort%5B%5D=downloads+desc&rows=30&page=1&output=json';
    return getJSON(url).then(function (data) {
      var docs = (data && data.response && data.response.docs) || [];
      return docs.map(function (d) {
        var id = d.identifier;
        return {
          source: 'Internet Archive',
          title: String(d.title || id) + (d.year ? ' (' + d.year + ')' : ''),
          size: Number(d.item_size) || 0,
          seeders: 0,
          archiveId: id,
          link: 'https://archive.org/download/' + encodeURIComponent(id) + '/' + encodeURIComponent(id) + '_archive.torrent',
          magnet: ''
        };
      });
    });
  }

  function searchJackett(query) {
    var base = jackettBase();
    var key = str('ltp_parser_key') || str('jackett_key');
    if (!base) return Promise.resolve([]);
    var url = base + '/api/v2.0/indexers/all/results?apikey=' + encodeURIComponent(key) +
      '&Query=' + encodeURIComponent(query);
    return getJSON(url, 25000).then(function (data) {
      var list = (data && (data.Results || data.results)) || [];
      return list.map(function (r) {
        return {
          source: r.Tracker || r.TrackerId || 'Jackett',
          title: String(r.Title || ''),
          size: Number(r.Size) || 0,
          seeders: Number(r.Seeders) || 0,
          link: r.Link || '',
          magnet: r.MagnetUri || ''
        };
      }).filter(function (r) { return r.title && (r.magnet || r.link); })
        .sort(function (a, b) { return b.seeders - a.seeders; })
        .slice(0, 60);
    });
  }

  function searchAll(query) {
    var errors = [];
    function safe(p, name) {
      return p.catch(function (e) { errors.push(name + ': ' + e.message); return []; });
    }
    return Promise.all([
      safe(searchJackett(query), 'Jackett'),
      safe(searchArchive(query), 'Internet Archive')
    ]).then(function (res) {
      return { items: res[0].concat(res[1]), errors: errors };
    });
  }

  /* ---------- список раздач и запуск ---------- */

  function play(entry, movie) {
    var element = {
      title: entry.title, Title: entry.title,
      MagnetUri: entry.magnet || '', magnet: entry.magnet || '',
      Link: entry.link || '', link: entry.link || '',
      Seeders: entry.seeders, Size: entry.size, size: entry.size,
      Tracker: entry.source, tracker: entry.source,
      url: entry.magnet || entry.link
    };
    try {
      Lampa.Torrent.start(element, movie);
    } catch (e) {
      var text = entry.magnet || entry.link;
      try {
        Lampa.Utils.copyTextToClipboard(text, function () {
          notify('Не удалось запустить автоматически. Ссылка скопирована.');
        }, function () { notify('Не удалось запустить раздачу: ' + e.message); });
      } catch (_) { notify('Не удалось запустить раздачу: ' + e.message); }
    }
  }


  /* ---------- онлайн-просмотр Internet Archive (без торрента) ---------- */

  var VIDEO_RANK = { mp4: 0, m4v: 1, webm: 2, ogv: 3, mkv: 4, avi: 5 };

  function archiveVideoFiles(meta, id) {
    var files = (meta && meta.files) || [];
    var ok = /\.(mp4|m4v|webm|ogv|mkv|avi)$/i;
    return files.filter(function (f) {
      return f && ok.test(f.name || '') && Number(f.size) > 1048576;
    }).map(function (f) {
      var ext = String(f.name).split('.').pop().toLowerCase();
      return {
        name: f.name,
        size: Number(f.size) || 0,
        rank: VIDEO_RANK[ext] === undefined ? 9 : VIDEO_RANK[ext],
        url: 'https://archive.org/download/' + encodeURIComponent(id) + '/' +
          String(f.name).split('/').map(encodeURIComponent).join('/')
      };
    }).sort(function (a, b) { return a.rank - b.rank || a.name.localeCompare(b.name); });
  }

  function playOnline(file, files, title) {
    var playlist = files.map(function (f) { return { title: f.name, url: f.url }; });
    try {
      Lampa.Player.play({ title: title, url: file.url });
      if (Lampa.Player.playlist) Lampa.Player.playlist(playlist);
    } catch (e) {
      notify('Не удалось запустить плеер: ' + e.message);
    }
  }

  function watchArchive(entry, prev) {
    try { Lampa.Loading.start(); } catch (_) {}
    getJSON('https://archive.org/metadata/' + encodeURIComponent(entry.archiveId), 20000).then(function (meta) {
      try { Lampa.Loading.stop(); } catch (_) {}
      var files = archiveVideoFiles(meta, entry.archiveId);
      if (!files.length) { notify('Видеофайлов для онлайн-просмотра нет. Попробуйте торрент.'); return; }
      if (files.length === 1) return playOnline(files[0], files, entry.title);
      Lampa.Select.show({
        title: 'Выберите файл',
        items: files.map(function (f) {
          return { title: f.name, subtitle: fmtSize(f.size), ltp_file: f };
        }),
        onBack: function () { backTo(prev); },
        onSelect: function (a) { backTo(prev); playOnline(a.ltp_file, files, entry.title); }
      });
    }).catch(function (e) {
      try { Lampa.Loading.stop(); } catch (_) {}
      notify('Не удалось получить файлы: ' + e.message);
    });
  }

  function archiveChoice(entry, movie, prev) {
    Lampa.Select.show({
      title: entry.title,
      items: [
        { title: 'Смотреть онлайн', subtitle: 'Сразу, без торрента', act: 'watch' },
        { title: 'Запустить торрентом', subtitle: 'Через TorrServer', act: 'torrent' }
      ],
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        backTo(prev);
        if (a.act === 'watch') watchArchive(entry, prev);
        else play(entry, movie);
      }
    });
  }

  function showTorrents(query, movie, prev) {
    query = (query || '').trim();
    if (!query) return;
    movie = movie || { id: 0, title: query, original_title: query, name: query };
    try { Lampa.Loading.start(); } catch (_) {}
    searchAll(query).then(function (result) {
      try { Lampa.Loading.stop(); } catch (_) {}
      var items = [];
      result.items.forEach(function (r) {
        var meta = [r.source];
        if (r.seeders) meta.push('↑' + r.seeders);
        var size = fmtSize(r.size);
        if (size) meta.push(size);
        items.push({ title: r.title, subtitle: meta.join(' • '), ltp_entry: r });
      });

      if (!result.items.length) {
        notify('Раздач не найдено.' + (jackettBase() ? '' :
          ' Для новых фильмов и сериалов укажите Jackett (настройки парсера Lampa).'));
      }
      if (result.errors.length) notify(result.errors.join('; '));
      if (!items.length) { backTo(prev); return; }

      Lampa.Select.show({
        title: 'Раздачи: ' + query,
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function (a) {
          backTo(prev);
          if (a.ltp_entry && a.ltp_entry.archiveId) return archiveChoice(a.ltp_entry, movie, prev);
          if (a.ltp_entry) return play(a.ltp_entry, movie);
          if (a.ltp_provider) return openExternal(a.ltp_url);
        }
      });
    }).catch(function (e) {
      try { Lampa.Loading.stop(); } catch (_) {}
      notify('Ошибка поиска: ' + e.message);
    });
  }


  function openExternal(url) {
    if (!url) { notify('Каталог не предоставил прямую ссылку на этот сервис.'); return; }
    try {
      var w = window.open(url, '_blank');
      if (!w) Lampa.Utils.copyTextToClipboard(url, function () { notify('Ссылка скопирована.'); }, function () { notify(url); });
    } catch (_) { notify('Откройте ссылку: ' + url); }
  }

  /* ---------- «Где смотреть»: легальные сервисы по данным TMDB ---------- */

  var PROVIDER_GROUPS = [
    ['flatrate', 'По подписке'],
    ['free', 'Бесплатно'],
    ['ads', 'Бесплатно с рекламой'],
    ['rent', 'Аренда'],
    ['buy', 'Покупка']
  ];

  function providerItems(movie, region) {
    if (!movie || !movie.id || !Lampa.TMDB || !Lampa.TMDB.api) return Promise.resolve([]);
    var type = (movie.name && !movie.title) || movie.first_air_date && !movie.release_date ? 'tv' : 'movie';
    return getJSON(Lampa.TMDB.api(type + '/' + movie.id + '/watch/providers')).then(function (d) {
      var r = d && d.results && d.results[region];
      var items = [];
      if (r) {
        PROVIDER_GROUPS.forEach(function (g) {
          (r[g[0]] || []).forEach(function (p) {
            items.push({ title: p.provider_name, subtitle: g[1] + ' • ' + region, ltp_provider: true, ltp_url: r.link || '' });
          });
        });
        if (r.link) items.unshift({ title: 'Открыть доступные варианты на JustWatch', subtitle: 'Проверить сервисы и переходы для региона ' + region, ltp_url: r.link, ltp_provider: true });
      }
      return items;
    }).catch(function () { return []; });
  }

  function buildQuery(movie) {
    var name = movie.title || movie.name || movie.original_title || movie.original_name || '';
    var year = String(movie.release_date || movie.first_air_date || '').slice(0, 4);
    var original = movie.original_title || movie.original_name || '';
    return (original && /^[\x00-\x7F]+$/.test(original) ? original : name) + (year && movie.title ? ' ' + year : '');
  }

  // «Где смотреть»: легальные сервисы (TMDB) + источники для загрузки (Internet Archive, ваш Jackett)
  function showWhere(movie, prev) {
    var region = (str('ltp_region') || 'RU').toUpperCase();
    var query = buildQuery(movie || {}).trim();
    try { Lampa.Loading.start(); } catch (_) {}
    providerItems(movie, region).then(function (providers) {
      try { Lampa.Loading.stop(); } catch (_) {}
      var items = providers.map(function (i) {
        return { title: i.title, subtitle: i.subtitle, ltp_info: true, ltp_provider: i.ltp_provider, ltp_url: i.ltp_url || '' };
      });
      var justwatch = 'https://www.justwatch.com/' + region.toLowerCase() + '/search?q=' + encodeURIComponent(query);
      items.push({ title: 'Netflix и другие официальные сервисы', subtitle: 'Проверить доступность и открыть официальный сервис через JustWatch', ltp_provider: true, ltp_url: justwatch });
      items.push({ title: 'Подключить онлайн-источники', subtitle: 'VideoDB, Showy, HDRezka, Kinogo и другие балансеры', ltp_open_plugins: true });
      items.push({ title: 'Найти торрент-раздачи', subtitle: 'Поиск по названию этого фильма через Jackett и Internet Archive', ltp_search_torrents: true });
      Lampa.Select.show({
        title: 'Где смотреть',
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function (a) {
          backTo(prev);
          if (a.ltp_provider) return openExternal(a.ltp_url);
          if (a.ltp_open_plugins) return showOnlinePlugins(prev);
          if (a.ltp_search_torrents) return showTorrents(query, movie, prev, false);
        }
      });
    }).catch(function (e) {
      try { Lampa.Loading.stop(); } catch (_) {}
      notify('Не удалось загрузить варианты просмотра: ' + e.message);
    });
  }

  /* ---------- каталог с постерами (штатные карточки Lampa) ---------- */

  function openCatalog(url, title) {
    Lampa.Activity.push({
      url: url, title: title, component: 'category_full', page: 1, source: 'tmdb'
    });
  }


  /* ---------- погода (Open-Meteo, запасной вариант — wttr.in; без ключей) ---------- */

  var BELGOROD = { name: 'Белгород', lat: 50.5997, lon: 36.5983 };
  var weatherCache = { at: 0, data: null, place: null, err: '', city: '' };

  var WMO = {
    0: ['☀', 'Ясно'], 1: ['🌤', 'Преимущественно ясно'], 2: ['⛅', 'Переменная облачность'], 3: ['☁', 'Пасмурно'],
    45: ['🌫', 'Туман'], 48: ['🌫', 'Изморозь'],
    51: ['🌦', 'Морось'], 53: ['🌦', 'Морось'], 55: ['🌦', 'Сильная морось'],
    56: ['🌧', 'Ледяная морось'], 57: ['🌧', 'Ледяная морось'],
    61: ['🌧', 'Небольшой дождь'], 63: ['🌧', 'Дождь'], 65: ['🌧', 'Сильный дождь'],
    66: ['🌧', 'Ледяной дождь'], 67: ['🌧', 'Ледяной дождь'],
    71: ['❄', 'Небольшой снег'], 73: ['❄', 'Снег'], 75: ['❄', 'Сильный снег'], 77: ['❄', 'Снежная крупа'],
    80: ['🌦', 'Ливень'], 81: ['🌧', 'Сильный ливень'], 82: ['🌧', 'Очень сильный ливень'],
    85: ['❄', 'Снегопад'], 86: ['❄', 'Сильный снегопад'],
    95: ['⛈', 'Гроза'], 96: ['⛈', 'Гроза с градом'], 99: ['⛈', 'Гроза с сильным градом']
  };
  function wmo(code) { return WMO[code] || ['', 'Нет данных']; }
  function fmtTemp(t) {
    t = Math.round(Number(t));
    return (t > 0 ? '+' : '') + t + '°';
  }
  function weatherOn() {
    var v = get('ltp_weather_enabled', true);
    return !(v === false || v === 'false' || v === 0 || v === '0');
  }
  function weatherCity() { return str('ltp_weather_city') || BELGOROD.name; }
  function isBelgorod(city) { return city.toLowerCase() === BELGOROD.name.toLowerCase(); }

  function normOpenMeteo(place, d) {
    var c = d && d.current, dl = (d && d.daily) || {};
    if (!c || c.temperature_2m === undefined) throw new Error('Пустой ответ Open-Meteo');
    var info = wmo(c.weather_code);
    var days = (dl.time || []).map(function (t, i) {
      var di = wmo(dl.weather_code && dl.weather_code[i]);
      var mins = dl.temperature_2m_min || [], maxs = dl.temperature_2m_max || [];
      return {
        date: t, min: mins[i], max: maxs[i],
        text: (di[0] ? di[0] + ' ' : '') + di[1],
        precip: dl.precipitation_probability_max ? dl.precipitation_probability_max[i] : null
      };
    });
    return { place: place.name, temp: c.temperature_2m, feels: c.apparent_temperature, wind: c.wind_speed_10m,
      humidity: c.relative_humidity_2m, icon: info[0], text: info[1], days: days, src: 'Open-Meteo' };
  }

  function normWttr(name, d) {
    var cc = d && d.current_condition && d.current_condition[0];
    if (!cc) throw new Error('Пустой ответ wttr.in');
    function ru(o) {
      return (o && o.lang_ru && o.lang_ru[0] && o.lang_ru[0].value) ||
        (o && o.weatherDesc && o.weatherDesc[0] && o.weatherDesc[0].value) || '';
    }
    var days = (d.weather || []).map(function (w) {
      var hours = w.hourly || [];
      var pr = Math.max.apply(null, hours.map(function (h) { return Number(h.chanceofrain) || 0; }).concat([0]));
      return { date: w.date, min: w.mintempC, max: w.maxtempC, text: ru(hours[4] || hours[0]), precip: pr };
    });
    return { place: name, temp: cc.temp_C, feels: cc.FeelsLikeC, wind: (Number(cc.windspeedKmph) || 0) / 3.6,
      humidity: cc.humidity, icon: '', text: ru(cc), days: days, src: 'wttr.in' };
  }

  function weatherOpenMeteo(city) {
    var placeP;
    if (isBelgorod(city)) placeP = Promise.resolve(BELGOROD);
    else if (weatherCache.place && weatherCache.place.query === city) placeP = Promise.resolve(weatherCache.place);
    else {
      placeP = getJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) +
        '&count=1&language=ru&format=json').then(function (d) {
        var r = d && d.results && d.results[0];
        if (!r) throw new Error('Город не найден');
        return { name: r.name || city, lat: r.latitude, lon: r.longitude, query: city };
      });
    }
    return placeP.then(function (place) {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&wind_speed_unit=ms&forecast_days=4&timezone=auto';
      return getJSON(url, 18000).then(function (d) {
        weatherCache.place = place;
        return normOpenMeteo(place, d);
      });
    });
  }

  function weatherWttr(city) {
    var q = isBelgorod(city) ? BELGOROD.lat + ',' + BELGOROD.lon : city;
    var urls = [
      'https://wttr.in/' + encodeURIComponent(q) + '?format=j1&lang=ru',
      'https://wttr.in/' + encodeURIComponent(isBelgorod(city) ? BELGOROD.name : city) + '?format=j1'
    ];
    return getJSON(urls[0], 15000).catch(function () { return getJSON(urls[1], 15000); }).then(function (d) {
      return normWttr(isBelgorod(city) ? BELGOROD.name : city, d);
    });
  }

  function weather7Timer(city) {
    var point = isBelgorod(city) ? BELGOROD : (weatherCache.place || BELGOROD);
    var url = 'https://www.7timer.info/bin/api.pl?lon=' + point.lon + '&lat=' + point.lat + '&product=civil&output=json';
    return getJSON('https://proxy.cors.dev/' + url, 20000).then(function (d) {
      var rows = d && d.dataseries;
      if (!rows || !rows.length) throw new Error('Пустой ответ 7Timer');
      var names = { clearday:'Ясно', clearnight:'Ясно', pcloudyday:'Небольшая облачность', pcloudynight:'Небольшая облачность', mcloudyday:'Облачно', mcloudynight:'Облачно', cloudyday:'Пасмурно', cloudynight:'Пасмурно', humidday:'Туманно', humidnight:'Туманно', lightrainday:'Небольшой дождь', lightrainnight:'Небольшой дождь', oshowerday:'Кратковременный дождь', oshowernight:'Кратковременный дождь', ishowerday:'Местами дождь', ishowernight:'Местами дождь', lightsnowday:'Небольшой снег', lightsnownight:'Небольшой снег', rainday:'Дождь', rainnight:'Дождь', snowday:'Снег', snownight:'Снег', rainsnowday:'Мокрый снег', rainsnownight:'Мокрый снег', tsday:'Гроза', tsnight:'Гроза', tsrainday:'Гроза с дождём', tsrainnight:'Гроза с дождём' };
      var init = String(d.init || '');
      var base = init.length >= 10 ? new Date(Date.UTC(Number(init.slice(0,4)), Number(init.slice(4,6))-1, Number(init.slice(6,8)), Number(init.slice(8,10)))) : new Date();
      var groups = {};
      rows.forEach(function (r) {
        var at = new Date(base.getTime() + Number(r.timepoint || 0) * 3600000);
        var key = at.toISOString().slice(0,10);
        if (!groups[key]) groups[key] = { date:key, min:Number(r.temp2m), max:Number(r.temp2m), text:names[r.weather] || 'Переменная облачность', temp:Number(r.temp2m) };
        groups[key].min = Math.min(groups[key].min, Number(r.temp2m));
        groups[key].max = Math.max(groups[key].max, Number(r.temp2m));
      });
      var days = Object.keys(groups).sort().map(function (k) { return groups[k]; });
      var now = rows[0];
      var wind = Number(now.wind10m && now.wind10m.speed) || 0;
      var windScale = [0,0.5,1.5,3.3,5.5,8,10.8,13.9,17.2];
      return { place: isBelgorod(city) ? BELGOROD.name : city, temp: Number(now.temp2m), feels: Number(now.temp2m), wind: windScale[Math.min(8,wind)] || 0,
        humidity: parseInt(now.rh2m,10) || 0, icon:'', text:names[now.weather] || 'Прогноз', days:days, src:'7Timer (резерв)' };
    });
  }

  function loadWeather(force) {
    var city = weatherCity();
    if (!force && weatherCache.data && weatherCache.city === city && Date.now() - weatherCache.at < 30 * 60 * 1000) {
      return Promise.resolve(weatherCache.data);
    }
    var errors = [];
    return weatherOpenMeteo(city).catch(function (e) {
      errors.push('Open-Meteo: ' + e.message);
      return weatherWttr(city).catch(function (w) {
        errors.push('wttr.in: ' + w.message);
        return weather7Timer(city);
      });
    }).then(function (data) {
      weatherCache.at = Date.now();
      weatherCache.data = data;
      weatherCache.city = city;
      weatherCache.err = '';
      return data;
    }).catch(function (e) {
      weatherCache.err = errors.concat(['7Timer: ' + e.message]).join('; ');
      throw new Error(weatherCache.err);
    });
  }

  function weatherLabel(w) {
    return (w.icon ? w.icon + ' ' : '') + fmtTemp(w.temp);
  }

  function setWeatherText(text) {
    $('.ltp-weather .ltp-w-txt').text(text);
    $('.ltp-w-menu .menu__text').text('Погода' + (text && text !== '…' ? ': ' + text : ''));
  }

  function updateWeatherWidget() {
    if (!weatherOn()) { $('.ltp-weather').remove(); $('.ltp-w-menu').remove(); return; }
    loadWeather(false).then(function (w) {
      setWeatherText(weatherLabel(w));
    }).catch(function () {
      setWeatherText('нет сети');
    });
  }

  function showWeather() {
    var prev = currentController();
    loadWeather(true).then(function (w) {
      setWeatherText(weatherLabel(w));
      var items = [{
        title: w.place + ': ' + fmtTemp(w.temp) + (w.text ? ', ' + w.text : ''),
        subtitle: 'Ощущается ' + fmtTemp(w.feels) + ' • ветер ' + Math.round(w.wind) +
          ' м/с • влажность ' + Math.round(w.humidity) + '% • ' + w.src
      }];
      var names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      w.days.forEach(function (d, i) {
        if (i === 0) return;
        var dt = new Date(d.date + 'T12:00:00');
        items.push({
          title: names[dt.getDay()] + ' ' + String(d.date).slice(8, 10) + '.' + String(d.date).slice(5, 7) + ': ' +
            fmtTemp(d.min) + ' … ' + fmtTemp(d.max),
          subtitle: (d.text || '') + (d.precip !== null && d.precip !== undefined ?
            ' • осадки ' + Math.round(d.precip) + '%' : '')
        });
      });
      Lampa.Select.show({
        title: 'Погода',
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function () { backTo(prev); }
      });
    }).catch(function (e) {
      setWeatherText('!');
      notify('Погода недоступна. ' + e.message);
    });
  }

  /* ---------- подключаемые онлайн-балансеры ---------- */

  var ONLINE_PLUGINS = [
    { id:'online_mod', title:'Онлайн МОД', url:'https://nb557.github.io/plugins/online_mod.js', desc:'HDRezka, Collaps, Filmix, FanCDN, Redheadsound, CDNVideoHub и другие. Сторонний плагин.' },
    { id:'showy', title:'Showy', url:'http://showy.online/m.js', desc:'VideoDB, VideoCDN, HDVB, Kinotochka и другие. Может требовать активацию через Telegram; адрес HTTP.' },
    { id:'online_cinema', title:'Онлайн Cinema', url:'https://bylampa.github.io/cinema.js', desc:'Дополнительный набор онлайн-источников Cinema.' },
    { id:'hermes_movie', title:'Hermes Movie (Kinogo)', url:'https://asimut.github.io/l/b.js', desc:'HDRezka, Kinogo, Filmix, VideoCDN и другие. Добавляет отдельную кнопку поиска источников на карточке.' }
  ];

  function selectedOnlinePlugins() {
    var value = get('ltp_online_plugins', []);
    return Array.isArray(value) ? value : [];
  }

  function loadOnlinePlugin(plugin) {
    window.__ltp_external_plugins = window.__ltp_external_plugins || {};
    if (window.__ltp_external_plugins[plugin.id]) { notify(plugin.title + ': уже подключён в этой сессии.'); return; }
    if (!Lampa.Utils || !Lampa.Utils.putScriptAsync) {
      try { Lampa.Utils.copyTextToClipboard(plugin.url); notify('Скопирован адрес ' + plugin.title + '. Добавьте его в Настройки → Расширения.'); }
      catch (_) { notify('Добавьте вручную: ' + plugin.url); }
      return;
    }
    window.__ltp_external_plugins[plugin.id] = true;
    try {
      Lampa.Utils.putScriptAsync([plugin.url], function () { notify(plugin.title + ' загружен. Его кнопка появится на карточках фильма.'); });
    } catch (e) {
      window.__ltp_external_plugins[plugin.id] = false;
      notify('Не удалось подключить ' + plugin.title + ': ' + e.message);
    }
  }

  function loadSelectedOnlinePlugins() {
    selectedOnlinePlugins().forEach(function (id) {
      var plugin = ONLINE_PLUGINS.filter(function (p) { return p.id === id; })[0];
      if (plugin) loadOnlinePlugin(plugin);
    });
    var lampac = normalizeBase(str('ltp_lampac_url'));
    if (lampac && Lampa.Utils && Lampa.Utils.putScriptAsync && !window.__ltp_lampac_loaded) {
      window.__ltp_lampac_loaded = true;
      try { Lampa.Utils.putScriptAsync([lampac + '/online.js'], function () { notify('Lampac Online подключён.'); }); }
      catch (e) { window.__ltp_lampac_loaded = false; notify('Lampac: ' + e.message); }
    }
  }

  function showOnlinePlugins(prev) {
    prev = prev || currentController();
    var selected = selectedOnlinePlugins();
    var items = ONLINE_PLUGINS.map(function (p) {
      var enabled = selected.indexOf(p.id) >= 0;
      return { title: (enabled ? '✓ ' : '+ ') + p.title, subtitle: p.desc, ltp_plugin: p };
    });
    items.push({ title:'Официальные кинотеатры', subtitle:'Netflix, Prime Video, Disney+ и другие — искать доступность через JustWatch', ltp_url:'https://www.justwatch.com/' });
    items.push({ title:'Lampac — 70+ источников', subtitle:'Укажите свой адрес сервера в настройках. Включает Kinogo, VideoDB и другие модули.', ltp_info:true });
    items.push({ title:'Fovea', subtitle:'Не нашёл подтверждённого рабочего Lampa-балансера с таким названием — не добавляю фиктивную ссылку.', ltp_info:true });
    Lampa.Select.show({
      title:'Онлайн-источники', items:items,
      onBack:function(){ backTo(prev); },
      onSelect:function(a){
        if (a.ltp_plugin) {
          var ids = selectedOnlinePlugins();
          var at = ids.indexOf(a.ltp_plugin.id);
          if (at >= 0) ids.splice(at,1); else ids.push(a.ltp_plugin.id);
          try { Lampa.Storage.set('ltp_online_plugins', ids); } catch (_) {}
          if (at < 0) loadOnlinePlugin(a.ltp_plugin);
          else notify(a.ltp_plugin.title + ' отключён при следующем запуске.');
          showOnlinePlugins(prev);
        } else if (a.ltp_url) openExternal(a.ltp_url);
        else if (a.ltp_info) notify(a.subtitle);
      }
    });
  }

  /* ---------- источники ---------- */

  function showSources() {
    var prev = currentController();
    var jb = jackettBase();
    var items = [
      { title: 'Онлайн-источники', subtitle: 'Подключить VideoDB, Showy, Online МОД и другие', ltp_plugins: true },
      { title: 'Netflix и официальные кинотеатры', subtitle: 'Доступность и переходы через JustWatch', ltp_url: 'https://www.justwatch.com/' },
      { title: 'TMDB — информация о фильмах и сервисах', subtitle: 'Доступность онлайн-просмотра по региону' },
      { title: 'Internet Archive — открытые материалы', subtitle: 'Проверяйте права на конкретный файл', ltp_url: 'https://archive.org/details/movies' },
      { title: 'Blender Open Movies', subtitle: 'Фильмы с открытыми лицензиями', ltp_url: 'https://studio.blender.org/films/' },
      { title: 'Public Domain Torrents', subtitle: 'Каталог — проверяйте статус общественного достояния', ltp_url: 'https://www.publicdomaintorrents.info/' },
      { title: 'Jackett — дополнительные индексаторы', subtitle: jb ? 'Подключён: ' + jb.replace(/^https?:\/\//, '') : 'Не настроен — нажмите, чтобы указать', ltp_settings: !jb },
      { title: 'TorrServer — воспроизведение', subtitle: str('torrserver_url') || str('torrserver_url_two') || 'Нужен для большинства torrent/magnet-раздач (Настройки Lampa → TorrServer)' }
    ];
    Lampa.Select.show({
      title: 'Источники',
      items: items,
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        backTo(prev);
        if (a.ltp_settings) {
          try { Lampa.Settings.create(ID, { onBack: function () { Lampa.Controller.toggle(prev); } }); }
          catch (_) { notify('Откройте: Настройки → Lampa Torrent Pro'); }
        } else if (a.ltp_url) openExternal(a.ltp_url);
        else if (a.ltp_plugins) showOnlinePlugins(prev);
      }
    });
  }

  /* ---------- хаб ---------- */

  function hub() {
    var prev = currentController();
    Lampa.Select.show({
      title: TITLE,
      items: [
        { title: 'Премьеры в кино', subtitle: 'Актуальные фильмы', act: 'new_movies' },
        { title: 'Сериалы сейчас', subtitle: 'Новые серии и текущие сезоны', act: 'new_tv' },
        { title: 'Популярное', subtitle: 'Фильмы и сериалы недели', act: 'trending' },
        { title: 'Онлайн-источники', subtitle: 'VideoDB, Showy, онлайн-балансеры и официальные сервисы', act: 'sources' },
        { title: 'Погода Белгород', subtitle: 'Сейчас и прогноз на несколько дней', act: 'weather' }
      ],
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        backTo(prev);
        switch (a.act) {
          case 'hint': notify('Используйте поиск Lampa, откройте карточку фильма и нажмите «Где смотреть».'); break;
          case 'new_movies': openCatalog('movie/now_playing', 'Премьеры в кино'); break;
          case 'new_tv': openCatalog('tv/on_the_air', 'Новые сериалы'); break;
          case 'trending': openCatalog('trending/all/week', 'В тренде'); break;
          case 'sources': showSources(); break;
          case 'weather': showWeather(); break;
        }
      }
    });
  }

  /* ---------- кнопка на карточке фильма/сериала ---------- */

  function addCardButton() {
    if (!Lampa.Listener || !Lampa.Listener.follow) return;
    Lampa.Listener.follow('full', function (e) {
      if (e.type !== 'complite') return;
      try {
        var movie = e.data && e.data.movie;
        if (!movie) return;
        var render = e.object.activity.render();
        if (render.find('.ltp-full-btn').length) return;

        var btn = $('<div class="full-start__button selector ltp-full-btn">' + MAGNET_ICON + '<span>Где смотреть</span></div>');
        btn.on('hover:enter', function () { showWhere(movie, currentController()); });

        var anchor = render.find('.view--torrent').first();
        if (anchor.length) anchor.after(btn);
        else render.find('.full-start-new__buttons, .full-start__buttons').first().append(btn);
        try { Lampa.Controller.collectionAppend(btn); } catch (_) {}
      } catch (err) {
        console.error('[Lampa Torrent Pro] card button:', err);
      }
    });
  }

  /* ---------- меню, шапка, настройки ---------- */

  function addStyle() {
    if ($('#ltp-style').length) return;
    $('head').append('<style id="ltp-style">' +
      '.ltp-weather{display:flex!important;align-items:center;width:auto!important;min-width:3em;padding:0 .6em;font-size:1.1em;white-space:nowrap;color:#fff}' +
      '.ltp-weather .ltp-w-txt{font-weight:600}' +
      '</style>');
  }

  function addMenu() {
    if ($('.menu .ltp-menu-item').length) return;
    var item = $(
      '<li class="menu__item selector ltp-menu-item">' +
        '<div class="menu__ico">' + SEARCH_ICON + '</div>' +
        '<div class="menu__text">' + TITLE + '</div>' +
      '</li>'
    );
    item.on('hover:enter', hub);
    $('.menu .menu__list').eq(0).append(item);
  }

  function addWeatherMenu() {
    if (!weatherOn() || $('.menu .ltp-w-menu').length) return;
    var item = $(
      '<li class="menu__item selector ltp-w-menu">' +
        '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></div>' +
        '<div class="menu__text">Погода</div>' +
      '</li>'
    );
    item.on('hover:enter', showWeather);
    $('.menu .menu__list').eq(0).append(item);
  }

  function addHeadWidgets() {
    try {
      var head = $('.head .head__actions');
      if (!head.length) return;
      if (!head.find('.ltp-head-btn').length) {
        var btn = $('<div class="head__action selector ltp-head-btn">' +
          SEARCH_ICON.replace('width="24" height="24"', 'width="22" height="22"') + '</div>');
        btn.on('hover:enter click', hub);
        head.prepend(btn);
      }
      if (weatherOn() && !head.find('.ltp-weather').length) {
        var w = $('<div class="head__action selector ltp-weather"><span class="ltp-w-txt">…</span></div>');
        w.on('hover:enter click', showWeather);
        head.prepend(w);
      }
    } catch (_) {}
  }

  function addParam(name, type, title, description, fallback) {
    if (!Lampa.SettingsApi || !Lampa.SettingsApi.addParam) return;
    Lampa.SettingsApi.addParam({
      component: ID,
      param: { name: name, type: type, default: fallback },
      field: { name: title, description: description || '' }
    });
  }

  function addSettings() {
    try {
      if (!Lampa.SettingsApi) return;
      if (Lampa.SettingsApi.addComponent) {
        Lampa.SettingsApi.addComponent({
          component: ID,
          name: 'Lampa Torrent Pro',
          icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 3h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z"/></svg>'
        });
      }
      addParam('ltp_parser_url', 'input', 'Адрес Jackett',
        'Необязательно. Если пусто — берётся адрес из настроек парсера Lampa. Указывайте только свой сервер.', '');
      addParam('ltp_parser_key', 'input', 'Ключ Jackett',
        'Необязательно. Если пусто — берётся ключ из настроек парсера Lampa.', '');
      addParam('ltp_lampac_url', 'input', 'Адрес своего Lampac-сервера',
        'Необязательно. Если у вас есть Lampac, укажите адрес, например http://192.168.1.20:9118. Не используйте неизвестные публичные серверы.', '');
      addParam('ltp_region', 'input', 'Регион для «Где смотреть»', 'Код страны, например RU, UA, BY, KZ. По умолчанию RU.', 'RU');
      addParam('ltp_weather_enabled', 'trigger', 'Показывать погоду', 'Температура в шапке Lampa (Open-Meteo).', true);
      addParam('ltp_weather_city', 'input', 'Город для погоды', 'По умолчанию Белгород.', 'Белгород');
    } catch (e) {
      console.error('[Lampa Torrent Pro] settings error:', e);
    }
  }

  function start() {
    addStyle();
    addMenu();
    addWeatherMenu();
    addHeadWidgets();
    addSettings();
    addCardButton();
    loadSelectedOnlinePlugins();
    updateWeatherWidget();
    setInterval(updateWeatherWidget, 30 * 60 * 1000);

    window.lampaTorrentPro = {
      version: VERSION,
      hub: hub,
      weather: showWeather,
      advertising: false,
      telemetry: false
    };
    console.log('[Lampa Torrent Pro] ' + VERSION);
  }

  if (window.appready) start();
  else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') start();
    });
  }
})();
