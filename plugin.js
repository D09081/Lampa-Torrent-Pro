/* Lampa Torrent Pro 0.9.0 — самодостаточный плагин. Без рекламы, аналитики и чужих ключей.
 *
 * Пункт меню «Главная Pro» — главный экран: фон-постер, герой-блок, ряды с новинками,
 * трендами, «Продолжить просмотр», случайный фильм, часы и погода.
 * Пункт меню «Torrent Pro» (и значок лупы в шапке) открывает хаб:
 *   • поиск фильма/сериала — каталог Lampa с постерами и превью;
 *   • новые фильмы, новые сериалы, в тренде — те же карточки с постерами;
 *   • раздачи по названию, статус источников;
 *   • погода (по умолчанию Белгород).
 * На карточке фильма/сериала появляется кнопка «Где смотреть»: легальные сервисы (данные TMDB)
 * и источники для загрузки (Internet Archive + ваш Jackett). Раздачи Internet Archive можно
 * смотреть онлайн сразу; остальные запускаются штатным плеером Lampa через TorrServer. */
(function () {
  'use strict';

  var ID = 'lampa_torrent_pro';
  var VERSION = '0.9.0';
  var TITLE = 'Torrent Pro';

  if (window.__ltp_loaded) return;
  window.__ltp_loaded = true;

  var SEARCH_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
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
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('HTTP ' + xhr.status));
        try { resolve(JSON.parse(xhr.responseText)); }
        catch (e) { reject(new Error('Некорректный ответ')); }
      };
      xhr.onerror = function () { reject(new Error('Сеть недоступна')); };
      xhr.ontimeout = function () { reject(new Error('Таймаут')); };
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

  function showTorrents(query, movie, prev, withHub) {
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
      if (withHub) items.unshift({ title: 'Открыть в каталоге с постерами', ltp_tmdb: true });

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
          if (a.ltp_tmdb) return openSearchCatalog(query);
          if (a.ltp_entry && a.ltp_entry.archiveId) return archiveChoice(a.ltp_entry, movie, prev);
          if (a.ltp_entry) play(a.ltp_entry, movie);
        }
      });
    }).catch(function (e) {
      try { Lampa.Loading.stop(); } catch (_) {}
      notify('Ошибка поиска: ' + e.message);
    });
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
          var list = (r[g[0]] || []).map(function (p) { return p.provider_name; });
          if (list.length) items.push({ title: g[1], subtitle: list.join(', ') });
        });
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
    Promise.all([
      providerItems(movie, region),
      query ? searchAll(query) : Promise.resolve({ items: [], errors: [] })
    ]).then(function (res) {
      try { Lampa.Loading.stop(); } catch (_) {}
      var items = res[0].map(function (i) {
        return { title: i.title + ' (' + region + ')', subtitle: i.subtitle, ltp_info: true };
      });
      res[1].items.forEach(function (r) {
        var meta = ['Загрузка', r.source];
        if (r.seeders) meta.push('↑' + r.seeders);
        var size = fmtSize(r.size);
        if (size) meta.push(size);
        items.push({ title: r.title, subtitle: meta.join(' • '), ltp_entry: r });
      });
      if (res[1].errors.length) notify(res[1].errors.join('; '));
      if (!items.length) {
        notify('Источников не найдено.' + (jackettBase() ? '' :
          ' Для раздач укажите Jackett (настройки парсера Lampa). Данные TMDB для региона ' + region + ' могут быть неполными.'));
        return;
      }
      Lampa.Select.show({
        title: 'Где смотреть',
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function (a) {
          backTo(prev);
          if (a.ltp_entry && a.ltp_entry.archiveId) return archiveChoice(a.ltp_entry, movie, prev);
          if (a.ltp_entry) play(a.ltp_entry, movie);
        }
      });
    }).catch(function (e) {
      try { Lampa.Loading.stop(); } catch (_) {}
      notify('Ошибка: ' + e.message);
    });
  }

  /* ---------- каталог с постерами (штатные карточки Lampa) ---------- */

  function openCatalog(url, title) {
    Lampa.Activity.push({
      url: url, title: title, component: 'category_full', page: 1, source: 'tmdb'
    });
  }

  function openSearchCatalog(query) {
    Lampa.Activity.push({
      url: 'search/multi', title: 'Поиск: ' + query, component: 'category_full',
      page: 1, query: encodeURIComponent(query), source: 'tmdb'
    });
  }

  function askText(titleText, cb) {
    var prev = currentController();
    Lampa.Input.edit({ free: true, title: titleText, nosave: true, value: '' }, function (value) {
      backTo(prev);
      value = (value || '').trim();
      if (value) cb(value, prev);
    });
  }

  /* ---------- погода (Open-Meteo, запасной вариант — wttr.in; без ключей) ---------- */

  var BELGOROD = { name: 'Белгород', lat: 50.5997, lon: 36.5983 };
  var weatherCache = { at: 0, data: null, place: null, err: '' };

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
      return {
        date: t, min: dl.temperature_2m_min[i], max: dl.temperature_2m_max[i],
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
      return getJSON(url).then(function (d) {
        weatherCache.place = place;
        return normOpenMeteo(place, d);
      });
    });
  }

  function weatherWttr(city) {
    var q = isBelgorod(city) ? BELGOROD.lat + ',' + BELGOROD.lon : city;
    return getJSON('https://wttr.in/' + encodeURIComponent(q) + '?format=j1&lang=ru').then(function (d) {
      return normWttr(isBelgorod(city) ? BELGOROD.name : city, d);
    });
  }

  function loadWeather(force) {
    if (!force && weatherCache.data && Date.now() - weatherCache.at < 30 * 60 * 1000) {
      return Promise.resolve(weatherCache.data);
    }
    var city = weatherCity();
    var firstErr = '';
    return weatherOpenMeteo(city).catch(function (e) {
      firstErr = 'Open-Meteo: ' + e.message;
      return weatherWttr(city);
    }).then(function (data) {
      weatherCache.at = Date.now();
      weatherCache.data = data;
      weatherCache.err = '';
      return data;
    }).catch(function (e) {
      weatherCache.err = (firstErr ? firstErr + '; ' : '') + 'wttr.in: ' + e.message;
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
      setWeatherText('!');
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

  /* ---------- источники ---------- */

  function showSources() {
    var prev = currentController();
    var jb = jackettBase();
    var items = [
      { title: 'TMDB — каталог, постеры, превью', subtitle: 'Встроен в Lampa' },
      { title: 'Internet Archive — раздачи', subtitle: 'Открытый каталог, работает без настроек' },
      { title: 'Jackett — раздачи', subtitle: jb ? 'Подключён: ' + jb.replace(/^https?:\/\//, '') : 'Не настроен — нажмите, чтобы указать', ltp_settings: !jb },
      { title: 'TorrServer — воспроизведение', subtitle: str('torrserver_url') || str('torrserver_url_two') || 'Адрес не указан (настройки Lampa → TorrServer)' }
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
        }
      }
    });
  }

  /* ---------- «Главная Pro»: главный экран ---------- */

  var GENRES = {
    28: 'Боевик', 12: 'Приключения', 16: 'Мультфильм', 35: 'Комедия', 80: 'Криминал', 99: 'Документальный',
    18: 'Драма', 10751: 'Семейный', 14: 'Фэнтези', 36: 'История', 27: 'Ужасы', 10402: 'Музыка',
    9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика', 10770: 'ТВ-фильм', 53: 'Триллер',
    10752: 'Военный', 37: 'Вестерн', 10759: 'Боевик и приключения', 10762: 'Детский', 10763: 'Новости',
    10764: 'Реалити', 10765: 'Фантастика и фэнтези', 10766: 'Мыльная опера', 10767: 'Ток-шоу',
    10768: 'Война и политика'
  };

  var HOME_ROWS = [
    { title: 'В тренде сегодня', url: 'trending/all/day' },
    { title: 'Новые фильмы', url: 'movie/now_playing' },
    { title: 'Новые сериалы', url: 'tv/on_the_air' },
    { title: 'Скоро в кино', url: 'movie/upcoming' },
    { title: 'Российские сериалы', url: 'discover/tv?with_original_language=ru&sort_by=popularity.desc' },
    { title: 'Российские фильмы', url: 'discover/movie?with_original_language=ru&sort_by=popularity.desc&vote_count.gte=20' },
    { title: 'Лучшие фильмы', url: 'movie/top_rated' },
    { title: 'Популярные сериалы', url: 'tv/popular' }
  ];

  var homeCache = {};

  function tmdbUrl(path) {
    return Lampa.TMDB.api(path + (path.indexOf('?') >= 0 ? '&' : '?') + 'language=ru-RU');
  }
  function tmdbImg(path, size) {
    if (!path) return '';
    var p = 't/p/' + size + path;
    try { if (Lampa.TMDB && Lampa.TMDB.image) return Lampa.TMDB.image(p); } catch (_) {}
    return 'https://image.tmdb.org/t/p/' + size + path;
  }
  function itemType(it) { return it.media_type || (it.name && !it.title ? 'tv' : 'movie'); }
  function itemTitle(it) { return it.title || it.name || it.original_title || it.original_name || ''; }
  function itemDate(it) { return it.release_date || it.first_air_date || ''; }
  function itemBadge(it) {
    var d = itemDate(it);
    if (!d) return '';
    var t = new Date(d + 'T00:00:00').getTime();
    if (isNaN(t)) return '';
    var now = Date.now();
    if (t > now) return 'Скоро';
    return now - t < 45 * 86400000 ? 'Новинка' : '';
  }
  function openItem(it) {
    Lampa.Activity.push({
      url: '', title: itemTitle(it), component: 'full', id: it.id,
      method: itemType(it), card: it, source: 'tmdb'
    });
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

  function historyItems() {
    try {
      var list = Lampa.Favorite.get({ type: 'history' }) || [];
      return list.filter(function (x) { return x && x.id && x.poster_path; }).slice(0, 20);
    } catch (_) { return []; }
  }

  function HomeComponent(object) {
    var self = this;
    var html = $('<div class="ltp-home"></div>');
    var bgA = $('<div class="ltp-home__bgimg"></div>');
    var bgB = $('<div class="ltp-home__bgimg"></div>');
    var page = $('<div class="ltp-home__page"></div>');
    var top = $('<div class="ltp-home__top"></div>');
    var chips = $('<div class="ltp-home__chips"></div>');
    var clock = $('<div class="ltp-home__clock"><div class="ltp-home__time"></div><div class="ltp-home__date"></div></div>');
    var hero = $('<div class="ltp-home__hero"><div class="ltp-hero__badge"></div><div class="ltp-hero__title"></div><div class="ltp-hero__meta"></div><div class="ltp-hero__desc"></div></div>');
    var heroBtns = $('<div class="ltp-hero__btns"></div>');
    var rowsBox = $('<div class="ltp-home__rows"></div>');
    var weatherChip, last = null, current = null, heroTimer = null, clockTimer = null, bgFlip = false;
    var pool = [], started = false, finished = false;

    html.append($('<div class="ltp-home__bg"></div>').append(bgA).append(bgB).append('<div class="ltp-home__shade"></div>'));
    hero.append(heroBtns);
    top.append(chips).append(clock);
    page.append(top).append(hero).append(rowsBox);
    html.append(page);

    function ensureVisible(el) {
      try {
        var $el = $(el);
        var list = $el.closest('.ltp-row__list');
        if (list.length) {
          var rr = list[0].getBoundingClientRect(), er = el.getBoundingClientRect();
          list[0].scrollLeft += (er.left + er.width / 2) - (rr.left + rr.width / 2);
        }
        var p = page[0], pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (!$el.closest('.ltp-row').length) { p.scrollTop = 0; return; }
        var over = r.bottom - (pr.top + pr.height * 0.94);
        var under = (pr.top + pr.height * 0.06) - r.top;
        if (over > 0) p.scrollTop += over;
        else if (under > 0) p.scrollTop -= under;
      } catch (_) {}
    }

    function setBackdrop(it) {
      var url = tmdbImg(it.backdrop_path, 'w1280') || tmdbImg(it.poster_path, 'w780');
      if (!url) return;
      var next = bgFlip ? bgA : bgB, prevEl = bgFlip ? bgB : bgA;
      bgFlip = !bgFlip;
      var img = new Image();
      img.onload = function () {
        next.css('background-image', 'url("' + url + '")');
        next.addClass('is-on'); prevEl.removeClass('is-on');
      };
      img.src = url;
    }

    function setHero(it) {
      if (!it || (current && current.id === it.id && itemType(current) === itemType(it))) return;
      current = it;
      var year = String(itemDate(it)).slice(0, 4);
      var meta = [];
      if (year) meta.push(year);
      if (it.vote_average > 0) meta.push('★ ' + Number(it.vote_average).toFixed(1));
      meta.push(itemType(it) === 'tv' ? 'Сериал' : 'Фильм');
      var g = (it.genre_ids || []).slice(0, 2).map(function (id) { return GENRES[id]; }).filter(Boolean);
      if (g.length) meta.push(g.join(', '));
      var badge = itemBadge(it);
      hero.find('.ltp-hero__badge').text(badge).toggle(!!badge);
      hero.find('.ltp-hero__title').text(itemTitle(it));
      hero.find('.ltp-hero__meta').text(meta.join('  •  '));
      hero.find('.ltp-hero__desc').text(it.overview || '');
      setBackdrop(it);
    }

    function focusHero(it) {
      clearTimeout(heroTimer);
      heroTimer = setTimeout(function () { setHero(it); }, 140);
    }

    function chip(label, action, id) {
      var c = $('<div class="ltp-chip selector"></div>').text(label);
      if (id) c.attr('data-chip', id);
      c.on('hover:enter', action);
      c.on('hover:focus', function () { last = this; ensureVisible(this); });
      chips.append(c);
      return c;
    }

    function randomPick() {
      if (!pool.length) { notify('Подборка ещё загружается'); return; }
      openItem(pool[Math.floor(Math.random() * pool.length)]);
    }

    function buildCard(it) {
      var card = $('<div class="ltp-card selector"></div>');
      var poster = $('<div class="ltp-card__poster"></div>').css('background-image', 'url("' + tmdbImg(it.poster_path, 'w342') + '")');
      if (it.vote_average > 0) poster.append($('<span class="ltp-badge ltp-badge--vote"></span>').text(Number(it.vote_average).toFixed(1)));
      var b = itemBadge(it);
      if (b) poster.append($('<span class="ltp-badge ltp-badge--new"></span>').text(b));
      var sub = [String(itemDate(it)).slice(0, 4), itemType(it) === 'tv' ? 'Сериал' : ''].filter(Boolean).join(' • ');
      card.append(poster)
        .append($('<div class="ltp-card__title"></div>').text(itemTitle(it)))
        .append($('<div class="ltp-card__sub"></div>').text(sub));
      card.on('hover:enter', function () { openItem(it); });
      card.on('hover:focus', function () { last = this; ensureVisible(this); focusHero(it); });
      return card;
    }

    function refreshNav() {
      try {
        if (Lampa.Controller.enabled().name === 'ltp_home') {
          Lampa.Controller.collectionSet(html);
          if (last) Lampa.Controller.collectionFocus(last, html);
        }
      } catch (_) {}
    }

    function addRow(title, items) {
      if (!items.length) return null;
      var row = $('<section class="ltp-row"></section>');
      row.append($('<div class="ltp-row__title"></div>').text(title));
      var list = $('<div class="ltp-row__list"></div>');
      items.forEach(function (it) { list.append(buildCard(it)); });
      row.append(list);
      return row;
    }

    function finish() {
      if (finished) return;
      finished = true;
      try { self.activity.loader(false); self.activity.toggle(); } catch (_) {}
    }

    function loadRows() {
      var hist = historyItems();
      if (hist.length) {
        var hr = addRow('Продолжить просмотр', hist);
        if (hr) rowsBox.append(hr);
      }
      var slots = HOME_ROWS.map(function () { var el = $('<div class="ltp-slot"></div>'); rowsBox.append(el); return el; });
      var failed = 0, done = 0;

      HOME_ROWS.forEach(function (def, i) {
        var cached = homeCache[def.url];
        var p = cached && Date.now() - cached.at < 10 * 60 * 1000 ?
          Promise.resolve(cached.items) :
          getJSON(tmdbUrl(def.url), 20000).then(function (d) {
            var items = ((d && d.results) || []).filter(function (x) { return x.poster_path; }).map(function (x) {
              if (!x.media_type) x.media_type = def.url.indexOf('tv') === 0 || def.url.indexOf('discover/tv') === 0 ? 'tv' : 'movie';
              return x;
            }).slice(0, 20);
            homeCache[def.url] = { at: Date.now(), items: items };
            return items;
          });
        p.then(function (items) {
          var row = addRow(def.title, items);
          if (row) slots[i].replaceWith(row); else slots[i].remove();
          items.forEach(function (it) { pool.push(it); });
          if (!current && items.length) setHero(items[0]);
        }).catch(function () {
          failed++; slots[i].remove();
        }).then(function () {
          done++;
          if (done === 1 || done === HOME_ROWS.length) finish();
          if (done === HOME_ROWS.length && failed === HOME_ROWS.length) {
            rowsBox.append($('<div class="ltp-home__error"></div>').text('Не удалось загрузить подборки TMDB. Проверьте интернет и повторите.'));
            notify('TMDB недоступен');
          }
          refreshNav();
        });
      });
    }

    function tick() {
      var d = new Date();
      clock.find('.ltp-home__time').text(two(d.getHours()) + ':' + two(d.getMinutes()));
      clock.find('.ltp-home__date').text(WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]);
    }

    this.create = function () {
      try { this.activity.loader(true); } catch (_) {}
      chip('Поиск', function () { askText('Название фильма или сериала', openSearchCatalog); });
      chip('Случайный фильм', randomPick);
      chip('Новинки', function () { openCatalog('movie/now_playing', 'Новые фильмы'); });
      chip('Источники', showSources);
      if (weatherOn()) {
        weatherChip = chip('Погода', showWeather, 'weather');
        loadWeather(false).then(function (w) { weatherChip.text(weatherCity() === BELGOROD.name ? weatherLabel(w) : w.place + ' ' + weatherLabel(w)); })
          .catch(function () { weatherChip.text('Погода: !'); });
      }
      heroBtns.append($('<div class="ltp-chip ltp-chip--primary selector">Подробнее</div>')
        .on('hover:enter', function () { if (current) openItem(current); })
        .on('hover:focus', function () { last = this; ensureVisible(this); }));
      tick();
      clockTimer = setInterval(tick, 30000);
      loadRows();
      setTimeout(finish, 6000);
    };

    this.start = function () {
      try {
        if (Lampa.Activity.active && Lampa.Activity.active().activity !== this.activity) return;
      } catch (_) {}
      started = true;
      Lampa.Controller.add('ltp_home', {
        toggle: function () {
          Lampa.Controller.collectionSet(html);
          Lampa.Controller.collectionFocus(last || false, html);
        },
        left: function () {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        right: function () { if (Navigator.canmove('right')) Navigator.move('right'); },
        up: function () {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function () { if (Navigator.canmove('down')) Navigator.move('down'); },
        back: function () { Lampa.Activity.backward(); }
      });
      Lampa.Controller.toggle('ltp_home');
    };
    this.pause = function () {};
    this.stop = function () {};
    this.render = function () { return html; };
    this.destroy = function () {
      clearInterval(clockTimer);
      clearTimeout(heroTimer);
      html.remove();
    };
  }

  function homeStyle() {
    if ($('#ltp-home-style').length) return;
    $('head').append('<style id="ltp-home-style">' +
      '.ltp-home{position:relative;width:100%;height:100%;overflow:hidden;color:#fff;background:#0b0d12}' +
      '.ltp-home__bg{position:absolute;left:0;top:0;right:0;bottom:0}' +
      '.ltp-home__bgimg{position:absolute;left:0;top:0;right:0;bottom:0;background-size:cover;background-position:center 20%;opacity:0;transition:opacity .7s ease}' +
      '.ltp-home__bgimg.is-on{opacity:1}' +
      '.ltp-home__shade{position:absolute;left:0;top:0;right:0;bottom:0;background:linear-gradient(90deg,rgba(11,13,18,.96) 0%,rgba(11,13,18,.78) 34%,rgba(11,13,18,.25) 70%,rgba(11,13,18,.45) 100%),linear-gradient(0deg,#0b0d12 4%,rgba(11,13,18,0) 55%)}' +
      '.ltp-home__page{position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;padding:0 0 3em 0;scroll-behavior:smooth}' +
      '.ltp-home__top{display:flex;justify-content:space-between;align-items:center;padding:1.2em 3em 0 3em}' +
      '.ltp-home__chips{display:flex;flex-wrap:wrap}' +
      '.ltp-chip{padding:.55em 1.2em;margin-right:.7em;border-radius:2em;background:rgba(255,255,255,.12);font-size:1.1em;white-space:nowrap;transition:transform .15s}' +
      '.ltp-chip.focus{background:#fff;color:#0b0d12;transform:scale(1.06)}' +
      '.ltp-chip--primary{background:rgba(255,255,255,.22);font-weight:600;padding:.7em 1.8em}' +
      '.ltp-home__clock{text-align:right;line-height:1.15;flex:none;margin-left:2em}' +
      '.ltp-home__time{font-size:2.2em;font-weight:300}' +
      '.ltp-home__date{font-size:1em;opacity:.7}' +
      '.ltp-home__hero{padding:3.2em 3em 1.6em 3em;max-width:46em;min-height:15em}' +
      '.ltp-hero__badge{display:inline-block;padding:.2em .8em;border-radius:.3em;background:#e5484d;font-size:.95em;font-weight:600;margin-bottom:.6em}' +
      '.ltp-hero__title{font-size:3em;font-weight:700;line-height:1.1;margin-bottom:.3em;text-shadow:0 .08em .5em rgba(0,0,0,.6)}' +
      '.ltp-hero__meta{font-size:1.2em;opacity:.85;margin-bottom:.7em}' +
      '.ltp-hero__desc{font-size:1.15em;line-height:1.45;opacity:.8;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;max-width:36em;margin-bottom:1.1em}' +
      '.ltp-hero__btns{display:flex}' +
      '.ltp-home__rows{padding-top:.5em}' +
      '.ltp-row{margin-bottom:1.4em}' +
      '.ltp-row__title{font-size:1.5em;font-weight:600;padding:0 2em .6em 2em}' +
      '.ltp-row__list{display:flex;overflow:hidden;padding:.8em 2em 1.2em 2em;scroll-behavior:smooth}' +
      '.ltp-card{flex:none;width:11em;margin-right:1.1em;transition:transform .18s}' +
      '.ltp-card__poster{position:relative;width:100%;height:16.5em;border-radius:.8em;background-color:#1b1f2a;background-size:cover;background-position:center;box-shadow:0 .3em 1em rgba(0,0,0,.5)}' +
      '.ltp-card.focus{transform:scale(1.08)}' +
      '.ltp-card.focus .ltp-card__poster{box-shadow:0 0 0 .18em #fff,0 .6em 1.6em rgba(0,0,0,.7)}' +
      '.ltp-badge{position:absolute;padding:.15em .55em;border-radius:.4em;font-size:.9em;font-weight:600;background:rgba(0,0,0,.72)}' +
      '.ltp-badge--vote{right:.5em;top:.5em;color:#ffd24a}' +
      '.ltp-badge--new{left:.5em;bottom:.5em;background:#e5484d}' +
      '.ltp-card__title{margin-top:.6em;font-size:1.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ltp-card__sub{font-size:.9em;opacity:.6;margin-top:.15em}' +
      '.ltp-home__error{padding:2em 3em;font-size:1.2em;opacity:.8}' +
    '</style>');
  }

  function openHome() {
    Lampa.Activity.push({ url: '', title: 'Главная Pro', component: 'ltp_home', page: 1 });
  }

  function registerHome() {
    try {
      homeStyle();
      Lampa.Component.add('ltp_home', HomeComponent);
    } catch (e) { console.error('[Lampa Torrent Pro] home register:', e); }
  }

  function addHomeMenu() {
    if ($('.menu .ltp-home-menu').length) return;
    var item = $(
      '<li class="menu__item selector ltp-home-menu">' +
        '<div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg></div>' +
        '<div class="menu__text">Главная Pro</div>' +
      '</li>'
    );
    item.on('hover:enter', openHome);
    $('.menu .menu__list').eq(0).prepend(item);
  }

  /* ---------- хаб ---------- */

  function hub() {
    var prev = currentController();
    Lampa.Select.show({
      title: TITLE,
      items: [
        { title: 'Главная Pro', subtitle: 'Новинки, тренды, продолжить просмотр', act: 'home' },
        { title: 'Поиск фильма или сериала', subtitle: 'Каталог с постерами', act: 'search' },
        { title: 'Новые фильмы', subtitle: 'Сейчас в кино', act: 'new_movies' },
        { title: 'Новые сериалы', subtitle: 'Выходят сейчас', act: 'new_tv' },
        { title: 'В тренде', subtitle: 'Фильмы и сериалы недели', act: 'trending' },
        { title: 'Раздачи по названию', subtitle: 'Internet Archive и ваш Jackett', act: 'torrents' },
        { title: 'Источники', act: 'sources' },
        { title: 'Погода', act: 'weather' }
      ],
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        backTo(prev);
        switch (a.act) {
          case 'home': openHome(); break;
          case 'search': askText('Название фильма или сериала', openSearchCatalog); break;
          case 'new_movies': openCatalog('movie/now_playing', 'Новые фильмы'); break;
          case 'new_tv': openCatalog('tv/on_the_air', 'Новые сериалы'); break;
          case 'trending': openCatalog('trending/all/week', 'В тренде'); break;
          case 'torrents':
            askText('Название для поиска раздач', function (q, p) { showTorrents(q, null, p, true); });
            break;
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
      addParam('ltp_home_start', 'trigger', 'Открывать «Главную Pro» при запуске', 'Показывать наш главный экран сразу после запуска Lampa.', false);
      addParam('ltp_region', 'input', 'Регион для «Где смотреть»', 'Код страны, например RU, UA, BY, KZ. По умолчанию RU.', 'RU');
      addParam('ltp_weather_enabled', 'trigger', 'Показывать погоду', 'Температура в шапке Lampa (Open-Meteo).', true);
      addParam('ltp_weather_city', 'input', 'Город для погоды', 'По умолчанию Белгород.', 'Белгород');
      addParam('ltp_torbox_api_key', 'input', 'Ключ TorBox API', 'Ваш личный ключ (пока не используется).', '');
    } catch (e) {
      console.error('[Lampa Torrent Pro] settings error:', e);
    }
  }

  function start() {
    addStyle();
    registerHome();
    addHomeMenu();
    addMenu();
    addWeatherMenu();
    addHeadWidgets();
    addSettings();
    addCardButton();
    updateWeatherWidget();
    setInterval(updateWeatherWidget, 30 * 60 * 1000);
    var hs = get('ltp_home_start', false);
    if (hs === true || hs === 'true') setTimeout(openHome, 600);

    window.lampaTorrentPro = {
      version: VERSION,
      hub: hub,
      home: openHome,
      weather: showWeather,
      search: function (q) { showTorrents(q, null, 'content', true); },
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
