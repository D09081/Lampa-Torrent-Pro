/* Lampa Torrent Pro 0.8.0 — самодостаточный плагин. Без рекламы, аналитики и чужих ключей.
 *
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
  var VERSION = '0.8.0';
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

  /* ---------- погода (Open-Meteo, без ключей) ---------- */

  var BELGOROD = { name: 'Белгород', lat: 50.5997, lon: 36.5983 };
  var weatherCache = { at: 0, data: null, place: null };

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
  function wmo(code) { return WMO[code] || ['•', 'Нет данных']; }
  function fmtTemp(t) {
    t = Math.round(Number(t));
    return (t > 0 ? '+' : '') + t + '°';
  }

  function resolvePlace() {
    var city = str('ltp_weather_city') || BELGOROD.name;
    if (city.toLowerCase() === BELGOROD.name.toLowerCase()) return Promise.resolve(BELGOROD);
    if (weatherCache.place && weatherCache.place.query === city) return Promise.resolve(weatherCache.place);
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) +
      '&count=1&language=ru&format=json';
    return getJSON(url).then(function (d) {
      var r = d && d.results && d.results[0];
      if (!r) throw new Error('Город не найден');
      return { name: r.name || city, lat: r.latitude, lon: r.longitude, query: city };
    });
  }

  function loadWeather(force) {
    if (!force && weatherCache.data && Date.now() - weatherCache.at < 30 * 60 * 1000) {
      return Promise.resolve(weatherCache.data);
    }
    return resolvePlace().then(function (place) {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&wind_speed_unit=ms&forecast_days=4&timezone=auto';
      return getJSON(url).then(function (d) {
        weatherCache = { at: Date.now(), data: { place: place, raw: d }, place: place };
        return weatherCache.data;
      });
    });
  }

  function updateWeatherWidget() {
    if (!get('ltp_weather_enabled', true)) { $('.ltp-weather').remove(); return; }
    loadWeather(false).then(function (w) {
      var c = w.raw.current || {};
      var info = wmo(c.weather_code);
      $('.ltp-weather .ltp-w-txt').text(info[0] + ' ' + fmtTemp(c.temperature_2m));
    }).catch(function () {
      $('.ltp-weather .ltp-w-txt').text('—');
    });
  }

  function showWeather() {
    var prev = currentController();
    loadWeather(true).then(function (w) {
      var c = w.raw.current || {}, dly = w.raw.daily || {};
      var info = wmo(c.weather_code);
      var items = [{
        title: w.place.name + ': ' + fmtTemp(c.temperature_2m) + ', ' + info[1],
        subtitle: 'Ощущается ' + fmtTemp(c.apparent_temperature) + ' • ветер ' + Math.round(c.wind_speed_10m) +
          ' м/с • влажность ' + Math.round(c.relative_humidity_2m) + '%'
      }];
      var days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      (dly.time || []).forEach(function (d, i) {
        if (i === 0) return;
        var dt = new Date(d + 'T12:00:00');
        var di = wmo(dly.weather_code[i]);
        items.push({
          title: days[dt.getDay()] + ' ' + d.slice(8, 10) + '.' + d.slice(5, 7) + ': ' +
            fmtTemp(dly.temperature_2m_min[i]) + ' … ' + fmtTemp(dly.temperature_2m_max[i]),
          subtitle: di[0] + ' ' + di[1] + (dly.precipitation_probability_max ?
            ' • осадки ' + Math.round(dly.precipitation_probability_max[i]) + '%' : '')
        });
      });
      Lampa.Select.show({
        title: 'Погода',
        items: items,
        onBack: function () { backTo(prev); },
        onSelect: function () { backTo(prev); }
      });
    }).catch(function (e) { notify('Погода недоступна: ' + e.message); });
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

  /* ---------- хаб ---------- */

  function hub() {
    var prev = currentController();
    Lampa.Select.show({
      title: TITLE,
      items: [
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
      '.ltp-weather{display:flex;align-items:center;font-size:1.1em;white-space:nowrap;padding:0 .6em}' +
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
      if (get('ltp_weather_enabled', true) && !head.find('.ltp-weather').length) {
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
    addMenu();
    addHeadWidgets();
    addSettings();
    addCardButton();
    updateWeatherWidget();
    setInterval(updateWeatherWidget, 30 * 60 * 1000);

    window.lampaTorrentPro = {
      version: VERSION,
      hub: hub,
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
