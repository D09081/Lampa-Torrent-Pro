/* Lampa Torrent Pro 1.3.0 — понятный киноцентр для Lampa.
 * Каталог и поиск остаются штатными средствами Lampa. На карточке показываются официальные
 * варианты просмотра, торрент-источники и подключаемые онлайн-балансеры. Погода — Белгород. */
(function () {
  'use strict';

  var ID = 'lampa_torrent_pro';
  var VERSION = '1.6.1';
  var TITLE = 'Cinema OS';

  if (window.__ltp_loaded) return;
  window.__ltp_loaded = true;

  var SEARCH_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v4m5-4v4m5-4v4M3 10h18M10 14l5 3-5 3z"/></svg>';
  var MAGNET_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4v7a7 7 0 0 0 14 0V4"/><path d="M5 4h4v6H5zm10 0h4v6h-4z"/></svg>';

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

  // Короткий cache + объединение одинаковых параллельных запросов.
  // Не даём повторным экранам запускать одинаковую сетевую работу.
  var requestCache = {};
  var requestPending = {};
  var REQUEST_CACHE_TTL = 10000;
  var REQUEST_CACHE_LIMIT = 40;

  function getJSON(url, timeout) {
    var key = String(url);
    var cached = requestCache[key];
    var now = Date.now();
    if (cached && cached.expires > now) return Promise.resolve(cached.data);
    if (requestPending[key]) return requestPending[key];

    var task = new Promise(function (resolve, reject) {
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
    }).then(function (data) {
      requestCache[key] = { data: data, expires: Date.now() + REQUEST_CACHE_TTL };
      var keys = Object.keys(requestCache);
      if (keys.length > REQUEST_CACHE_LIMIT) {
        keys.sort(function (a,b) { return requestCache[a].expires - requestCache[b].expires; });
        keys.slice(0, keys.length - REQUEST_CACHE_LIMIT).forEach(function (k) { delete requestCache[k]; });
      }
      return data;
    }).then(function (data) {
      delete requestPending[key];
      return data;
    }, function (error) {
      delete requestPending[key];
      throw error;
    });
    requestPending[key] = task;
    return task;
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
      var seen = {};
      if (r) {
        PROVIDER_GROUPS.forEach(function (g) {
          (r[g[0]] || []).forEach(function (p) {
            var key = String(p.provider_id || p.provider_name || '') + ':' + g[0];
            if (seen[key]) return;
            seen[key] = true;
            items.push({
              title: p.provider_name,
              subtitle: g[1] + ' · ' + region + ' · доступность по данным TMDB',
              ltp_provider_info: true
            });
          });
        });
        items.sort(function (a, b) { return a.title.localeCompare(b.title, 'ru'); });
      }
      return { items: items, link: r && r.link ? r.link : '' };
    }).catch(function () { return { items: [], link: '' }; });
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
    providerItems(movie, region).then(function (result) {
      try { Lampa.Loading.stop(); } catch (_) {}
      var justwatch = 'https://www.justwatch.com/' + region.toLowerCase() + '/search?q=' + encodeURIComponent(query);
      var items = [{
        title: 'Открыть варианты просмотра для этого фильма',
        subtitle: 'JustWatch · официальные сервисы, аренда и покупка · регион ' + region,
        ltp_provider: true,
        ltp_url: result.link || justwatch
      }];
      if (result.items.length) {
        items.push({ title: 'Доступность по данным TMDB', subtitle: 'Ниже перечислены найденные сервисы. Нажмите первую строку, чтобы открыть варианты на JustWatch.' });
        result.items.forEach(function (i) { items.push(i); });
      } else {
        items.push({ title: 'Список сервисов не получен', subtitle: 'TMDB не вернул данные для региона ' + region + '. Проверьте регион или откройте JustWatch.' });
      }
      items.push({ title: 'Онлайн-источники Lampa', subtitle: 'Подключить совместимые плагины: Online МОД, Showy, Cinema, Hermes', ltp_open_plugins: true });
      items.push({ title: 'Поиск открытых раздач', subtitle: 'Internet Archive и ваш Jackett; для magnet обычно нужен TorrServer', ltp_search_torrents: true });
      Lampa.Select.show({
        title: 'Где смотреть · ' + (movie.title || movie.name || query),
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function (a) {
          backTo(prev);
          if (a.ltp_provider) return openExternal(a.ltp_url);
          if (a.ltp_open_plugins) return showOnlinePlugins(prev);
          if (a.ltp_search_torrents) return showTorrents(query, movie, prev);
          if (a.ltp_provider_info) return notify(a.title + ': доступность указана агрегатором TMDB; переход к сервису доступен через JustWatch.');
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
  var weatherRequest = null;
  var weatherRequestCity = '';

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
      }).then(function (place) {
        // Сохраняем координаты сразу после геокодирования для резервного 7Timer.
        weatherCache.place = place;
        return place;
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
    var point = isBelgorod(city) ? BELGOROD :
      (weatherCache.place && weatherCache.place.query === city ? weatherCache.place : null);
    if (!point) return Promise.reject(new Error('Не удалось определить координаты города «' + city + '» для резервного прогноза'));
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
    if (!force && weatherCache.data && weatherCache.city === city && Date.now() - weatherCache.at < 30 * 60 * 1000) return Promise.resolve(weatherCache.data);
    // Объединяем параллельные обращения шапки и меню в один запрос.
    if (weatherRequest && weatherRequestCity === city) return weatherRequest;
    var errors = [];
    weatherRequestCity = city;
    weatherRequest = weatherOpenMeteo(city).catch(function (e) {
      errors.push('Open-Meteo: ' + e.message);
      return weatherWttr(city).catch(function (w) {
        errors.push('wttr.in: ' + w.message);
        return weather7Timer(city);
      });
    }).then(function (data) {
      weatherCache.at = Date.now(); weatherCache.data = data; weatherCache.city = city; weatherCache.err = '';
      return data;
    }).catch(function (e) {
      weatherCache.err = errors.concat(['7Timer: ' + e.message]).join('; ');
      throw new Error(weatherCache.err);
    }).then(function (data) {
      if (weatherRequestCity === city) weatherRequest = null;
      return data;
    }, function (e) {
      if (weatherRequestCity === city) weatherRequest = null;
      throw e;
    });
    return weatherRequest;
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
      items.push({ title: 'Обновить прогноз', subtitle: 'Запросить свежие данные у погодных сервисов', ltp_refresh_weather: true });
      Lampa.Select.show({
        title: 'Погода',
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function (a) {
          if (a && a.ltp_refresh_weather) return showWeather();
          backTo(prev);
        }
      });
    }).catch(function (e) {
      setWeatherText('нет сети');
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
    if (window.__ltp_external_plugins[plugin.id] === true) { notify(plugin.title + ': уже подключён в этой сессии.'); return; }
    if (window.__ltp_external_plugins[plugin.id] === 'loading') { notify(plugin.title + ': загрузка уже выполняется.'); return; }
    if (!Lampa.Utils || !Lampa.Utils.putScriptAsync) {
      try { Lampa.Utils.copyTextToClipboard(plugin.url); notify('Скопирован адрес ' + plugin.title + '. Добавьте его в Настройки → Расширения.'); }
      catch (_) { notify('Добавьте вручную: ' + plugin.url); }
      return;
    }
    window.__ltp_external_plugins[plugin.id] = 'loading';
    var finished = false;
    var timer = setTimeout(function () {
      if (finished) return;
      finished = true;
      window.__ltp_external_plugins[plugin.id] = false;
      notify('Не дождался ответа от ' + plugin.title + '. Проверьте интернет и попробуйте подключить ещё раз.');
    }, 18000);
    try {
      Lampa.Utils.putScriptAsync([plugin.url], function () {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        window.__ltp_external_plugins[plugin.id] = true;
        notify(plugin.title + ' загружен. Проверьте появление его кнопки на карточке фильма.');
      });
    } catch (e) {
      finished = true;
      clearTimeout(timer);
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
      var state = enabled ? 'Подключён для загрузки при запуске' : 'Не подключён';
      return { title: (enabled ? '✓  ' : '+  ') + p.title, subtitle: state + ' · ' + p.desc, ltp_plugin: p };
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
      { title: '▶  Онлайн-источники', subtitle: 'Подключить Онлайн МОД, Showy, Cinema и Hermes', ltp_plugins: true },
      { title: '🌍  Официальные кинотеатры', subtitle: 'Проверить Netflix и другие сервисы через JustWatch', ltp_url: 'https://www.justwatch.com/' },
      { title: '🎞  Бесплатные фильмы с открытой лицензией', subtitle: 'Internet Archive — проверяйте права на каждый материал', ltp_url: 'https://archive.org/details/movies' },
      { title: '🎥  Blender Open Movies', subtitle: 'Анимация и фильмы с открытыми лицензиями', ltp_url: 'https://studio.blender.org/films/' },
      { title: '🧲  Поиск торрент-раздач', subtitle: jb ? 'Jackett подключён: ' + jb.replace(/^https?:\/\//, '') : 'Jackett не настроен — откройте настройки', ltp_settings: !jb },
      { title: '⚙️  Настройки подключения', subtitle: 'Адреса Jackett, Lampac, регион и погода', ltp_settings: true },
      { title: 'ℹ️  Нужен TorrServer?', subtitle: str('torrserver_url') || str('torrserver_url_two') ? 'Адрес TorrServer сохранён в настройках Lampa' : 'Для большинства magnet-раздач нужен TorrServer в настройках Lampa' }
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

  function showHowTo(prev) {
    prev = prev || currentController();
    Lampa.Select.show({
      title: 'Как пользоваться',
      items: [
        { title: '1. Найдите фильм', subtitle: 'Нажмите обычный поиск Lampa — отдельный поиск не нужен.' },
        { title: '2. Откройте карточку', subtitle: 'На странице фильма или сериала выберите кнопку «Где смотреть».' },
        { title: '3. Выберите способ просмотра', subtitle: 'Официальный сервис, онлайн-источник или торрент-раздача.' },
        { title: 'Если не запускается', subtitle: 'Для онлайн-балансеров подключите плагин. Для торрентов обычно нужен TorrServer.' },
        { title: 'Настроить источники', subtitle: 'Открыть список онлайн-плагинов и параметры подключения.', ltp_open_plugins: true }
      ],
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        if (a.ltp_open_plugins) return showOnlinePlugins(prev);
        notify(a.subtitle);
      }
    });
  }

  function openPluginSettings(prev) {
    prev = prev || currentController();
    try {
      Lampa.Settings.create(ID, { onBack: function () { Lampa.Controller.toggle(prev); } });
    } catch (_) {
      notify('Откройте Настройки → Расширения → Lampa Torrent Pro');
    }
  }

  function hub() {
    var prev = currentController();
    Lampa.Select.show({
      title: 'Киноцентр',
      items: [
        { title: '🔎  Как найти и посмотреть фильм', subtitle: 'Короткая инструкция — с чего начать', act: 'help' },
        { title: '🔥  Сейчас популярно', subtitle: 'Фильмы и сериалы в тренде на этой неделе', act: 'trending' },
        { title: '🎬  Новинки кино', subtitle: 'Фильмы, которые сейчас идут в кино', act: 'new_movies' },
        { title: '📺  Актуальные сериалы', subtitle: 'Сериалы с выходящими новыми сериями', act: 'new_tv' },
        { title: '🌐  Источники просмотра', subtitle: 'Онлайн-кинотеатры, балансеры и торренты', act: 'sources' },
        { title: '🌤  Погода · ' + weatherCity(), subtitle: 'Температура сейчас и прогноз на несколько дней', act: 'weather' },
        { title: '⚙️  Настройки киноцентра', subtitle: 'Регион, город, Jackett и собственный Lampac', act: 'settings' }
      ],
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        backTo(prev);
        switch (a.act) {
          case 'help': showHowTo(prev); break;
          case 'new_movies': openCatalog('movie/now_playing', 'Новинки кино'); break;
          case 'new_tv': openCatalog('tv/on_the_air', 'Актуальные сериалы'); break;
          case 'trending': openCatalog('trending/all/week', 'Сейчас популярно'); break;
          case 'sources': showSources(); break;
          case 'weather': showWeather(); break;
          case 'settings': openPluginSettings(prev); break;
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
    // Единственная точка подключения темы. Удаляем только наш предыдущий style,
    // чужие стили и плагины не трогаем.
    $('#ltp-style').remove();
    $('body').addClass('ltp-cyber-purple');
    var css = [
      'body.ltp-cyber-purple{--ltp-violet:#a855f7;--ltp-violet2:#7c3aed;--ltp-bg:#090611;--ltp-panel:rgba(19,12,32,.96)}',
      'body.ltp-cyber-purple .ltp-menu-item,body.ltp-cyber-purple .ltp-w-menu,body.ltp-cyber-purple .ltp-head-btn,body.ltp-cyber-purple .ltp-weather,body.ltp-cyber-purple .ltp-full-btn{color:#eadcff!important}',
      'body.ltp-cyber-purple .ltp-menu-item,body.ltp-cyber-purple .ltp-w-menu,body.ltp-cyber-purple .ltp-head-btn{border-color:rgba(168,85,247,.28)!important}',
      'body.ltp-cyber-purple .ltp-menu-item.focus,body.ltp-cyber-purple .ltp-w-menu.focus,body.ltp-cyber-purple .ltp-head-btn.focus,body.ltp-cyber-purple .ltp-full-btn.focus{background:rgba(124,58,237,.28)!important;outline:2px solid rgba(192,132,252,.82)!important;outline-offset:2px!important;box-shadow:0 0 18px rgba(168,85,247,.2)!important;border-radius:.45em!important}',
      'body.ltp-cyber-purple .ltp-full-btn{border:1px solid rgba(168,85,247,.42)!important;border-radius:.45em!important;padding-left:1em!important;padding-right:1em!important}',
      'body.ltp-cyber-purple .ltp-full-btn svg{width:1.15em;height:1.15em;vertical-align:middle;margin-right:.45em}',
      'body.ltp-cyber-purple .ltp-full-btn span{font-weight:600}',
      'body.ltp-cyber-purple .ltp-weather{display:flex!important;align-items:center;width:auto!important;min-width:3em;padding:0 .6em;font-size:1.1em;white-space:nowrap}',
      'body.ltp-cyber-purple .ltp-weather .ltp-w-txt{font-weight:700;font-variant-numeric:tabular-nums}',
      'body.ltp-cyber-purple .ltp-menu-item .menu__ico,body.ltp-cyber-purple .ltp-w-menu .menu__ico{display:flex;align-items:center;justify-content:center}',
      'body.ltp-cyber-purple .ltp-menu-item .menu__ico svg{opacity:.95}',
      '@media(prefers-reduced-motion:reduce){body.ltp-cyber-purple .ltp-menu-item,body.ltp-cyber-purple .ltp-w-menu,body.ltp-cyber-purple .ltp-head-btn,body.ltp-cyber-purple .ltp-full-btn{transition:none!important}}'
    ].join('');
    $('<style id="ltp-style"></style>').text(css).appendTo('head');
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
          name: 'Киноцентр · Lampa Torrent Pro',
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
      addParam('ltp_performance_mode', 'trigger', 'Режим производительности', 'Уменьшает анимации и тяжёлые эффекты для слабых телевизоров. Вступает в силу после перезапуска Lampa.', true);
    } catch (e) {
      console.error('[Lampa Torrent Pro] settings error:', e);
    }
  }


  /* ---------- Cinema OS: единая нативная тема ---------- */
  function mountNativeSkin() {
    if (!document.body) return;
    document.body.classList.add('lcos-native');
    applyPerformanceMode();
    if (document.getElementById('lcos-native-skin')) return;
    var css = [
      'body.lcos-native{--lcos-bg:#09080f;--lcos-panel:#15121f;--lcos-panel-2:#211a30;--lcos-line:rgba(190,151,255,.18);--lcos-purple:#a875ff;--lcos-text:#f7f2ff;--lcos-muted:#a49ab5;background:var(--lcos-bg)!important;color:var(--lcos-text)}',
      'body.lcos-native .wrap,body.lcos-native .wrap__left,body.lcos-native .head,body.lcos-native .navigation-bar{background:rgba(12,10,18,.96)}',
      'body.lcos-native .menu__item{border:1px solid transparent;border-radius:.85em;margin:.18em .35em;padding:.82em 1em;transition:background .14s,border-color .14s}',
      'body.lcos-native .menu__item.focus,body.lcos-native .menu__item.hover,body.lcos-native .menu__item.traverse{background:linear-gradient(100deg,rgba(142,83,255,.34),rgba(142,83,255,.10));border-color:rgba(190,151,255,.48);color:#fff}',
      'body.lcos-native .menu__text{font-weight:600;letter-spacing:.01em}',
      'body.lcos-native .head__title,body.lcos-native .head__action{color:var(--lcos-text)}',
      'body.lcos-native .card{width:13.2em}',
      'body.lcos-native .card__view{border-radius:1em;overflow:hidden;box-shadow:0 .5em 1.6em rgba(0,0,0,.25)}',
      'body.lcos-native .card__img{border-radius:1em}',
      'body.lcos-native .card.focus .card__view,body.lcos-native .card.hover .card__view{outline:2px solid var(--lcos-purple);outline-offset:3px;box-shadow:0 0 0 .22em rgba(168,117,255,.18),0 .8em 2em rgba(0,0,0,.45)}',
      'body.lcos-native .card__title{font-weight:600;color:#f5efff}',
      'body.lcos-native .items-line__title,body.lcos-native .category__title{font-weight:700;letter-spacing:.01em}',
      'body.lcos-native .category__title,body.lcos-native .full-start__title{color:#fff}',
      'body.lcos-native .full-start__background:after{background:linear-gradient(90deg,#09080f 0%,rgba(9,8,15,.82) 42%,rgba(9,8,15,.2) 100%),linear-gradient(0deg,#09080f 0%,transparent 60%)}',
      'body.lcos-native .full-start__button,body.lcos-native .button{border-radius:.8em}',
      'body.lcos-native .button--fill,body.lcos-native .full-start__button.focus,body.lcos-native .full-start__button.hover{background:linear-gradient(110deg,#8b4de8,#bd86ff);color:#fff;box-shadow:0 .35em 1.2em rgba(139,77,232,.28)}',
      'body.lcos-native .selectbox__content,body.lcos-native .modal__content,body.lcos-native .settings__content{background:#15121f;border:1px solid var(--lcos-line);border-radius:1em;box-shadow:0 1em 4em rgba(0,0,0,.5)}',
      'body.lcos-native .selectbox__item.focus,body.lcos-native .selectbox__item.hover,body.lcos-native .settings__item.focus,body.lcos-native .settings__item.hover{background:rgba(168,117,255,.2);border-radius:.55em}',
      'body.lcos-native .selector.focus{outline:2px solid var(--lcos-purple);outline-offset:2px}',
      'body.lcos-native .player-panel,body.lcos-native .player-panel__body{background:rgba(12,10,18,.94)}',
      'body.lcos-native .scroll__body::-webkit-scrollbar{display:none}',
      'body.lcos-native .menu__split{border-color:var(--lcos-line)}',
      '@media(max-width:767px){body.lcos-native .card{width:10.4em}body.lcos-native .menu__item{padding:.72em .85em}}',
      '@media(prefers-reduced-motion:reduce){body.lcos-native *,body.lcos-native *:before,body.lcos-native *:after{transition:none!important;animation:none!important}}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'lcos-native-skin';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function performanceModeOn() {
    var value = get('ltp_performance_mode', true);
    return !(value === false || value === 'false' || value === 0 || value === '0');
  }

  function applyPerformanceMode() {
    if (!document.body) return;
    var enabled = performanceModeOn();
    document.body.classList.toggle('lcos-performance', enabled);
    var style = document.getElementById('lcos-performance-style');
    if (!enabled) {
      if (style && style.parentNode) style.parentNode.removeChild(style);
      return;
    }
    if (style) return;
    style = document.createElement('style');
    style.id = 'lcos-performance-style';
    style.textContent = [
      'body.lcos-performance .menu__item,body.lcos-performance .card,body.lcos-performance .button,body.lcos-performance .selector{transition:none!important;animation:none!important}',
      'body.lcos-performance .card.focus .card__view,body.lcos-performance .card.hover .card__view,body.lcos-performance .menu__item.focus,body.lcos-performance .menu__item.hover{box-shadow:none!important}',
      'body.lcos-performance .card__view{filter:none!important}',
      'body.lcos-performance .full-start__background{filter:none!important}',
      'body.lcos-performance *{scroll-behavior:auto!important}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function initNativeSkinLifecycle() {
    mountNativeSkin();
    if (Lampa.Listener && Lampa.Listener.follow && !window.__lcos_skin_lifecycle) {
      window.__lcos_skin_lifecycle = true;
      Lampa.Listener.follow('activity', function (event) {
        if (event.type === 'start' || event.type === 'ready') mountNativeSkin();
      });
    }
  }

  function startWeatherRefresh() {
    if (window.__ltp_weather_timer) clearInterval(window.__ltp_weather_timer);
    if (window.__ltp_visibility_handler) {
      document.removeEventListener('visibilitychange', window.__ltp_visibility_handler);
    }
    function schedule() {
      if (document.hidden) return;
      window.__ltp_weather_timer = setInterval(updateWeatherWidget, 30 * 60 * 1000);
    }
    window.__ltp_visibility_handler = function () {
      if (window.__ltp_weather_timer) clearInterval(window.__ltp_weather_timer);
      window.__ltp_weather_timer = null;
      if (!document.hidden) {
        updateWeatherWidget();
        schedule();
      }
    };
    document.addEventListener('visibilitychange', window.__ltp_visibility_handler);
    schedule();
  }

  function start() {
    if (window.__ltp_started) return;
    window.__ltp_started = true;
    initNativeSkinLifecycle();
    addStyle();
    addMenu();
    addWeatherMenu();
    addHeadWidgets();
    addSettings();
    addCardButton();
    loadSelectedOnlinePlugins();
    updateWeatherWidget();
    startWeatherRefresh();

    window.lampaTorrentPro = {
      version: VERSION,
      hub: hub,
      help: showHowTo,
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
