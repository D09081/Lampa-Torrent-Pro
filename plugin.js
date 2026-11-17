/* Lampa Torrent Pro 0.4.0 — самодостаточный плагин. Без рекламы, аналитики и чужих ключей.
 * Пункт меню / кнопка в шапке «Поиск Torrent Pro»: вводишь название фильма или сериала —
 * плагин ищет раздачи в источниках и показывает список. Выбранная раздача уходит в
 * штатный торрент-модуль Lampa (TorrServer).
 * Источники:
 *  - Internet Archive (открытый каталог, работает без настроек);
 *  - ваш Jackett: адрес/ключ берутся из настроек парсера Lampa либо из настроек плагина. */
(function () {
  'use strict';

  var ID = 'lampa_torrent_pro';
  var VERSION = '0.4.0';
  var TITLE = 'Поиск Torrent Pro';

  if (window.__ltp_loaded) return;
  window.__ltp_loaded = true;

  var SEARCH_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

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

  /* ---------- источники ---------- */

  // Internet Archive: открытый каталог, у каждого элемента есть торрент.
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
          link: 'https://archive.org/download/' + encodeURIComponent(id) + '/' + encodeURIComponent(id) + '_archive.torrent',
          magnet: ''
        };
      });
    });
  }

  // Jackett (ваш собственный): /api/v2.0/indexers/all/results
  function searchJackett(query) {
    var base = normalizeBase(str('ltp_parser_url') || str('jackett_url'));
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

  /* ---------- интерфейс ---------- */

  function backTo(prev) {
    try { Lampa.Controller.toggle(prev); } catch (_) {}
  }

  function play(entry, query) {
    var element = {
      title: entry.title,
      Title: entry.title,
      MagnetUri: entry.magnet || '',
      magnet: entry.magnet || '',
      Link: entry.link || '',
      link: entry.link || '',
      Seeders: entry.seeders,
      Size: entry.size,
      size: entry.size,
      Tracker: entry.source,
      tracker: entry.source,
      url: entry.magnet || entry.link
    };
    var movie = { id: 0, title: query, original_title: query, name: query };
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

  function showResults(query, result, prev) {
    var items = [{ title: 'Открыть в каталоге Lampa (TMDB)', ltp_tmdb: true }];

    result.items.forEach(function (r) {
      var meta = [r.source];
      if (r.seeders) meta.push('↑' + r.seeders);
      var size = fmtSize(r.size);
      if (size) meta.push(size);
      items.push({ title: r.title, subtitle: meta.join(' • '), ltp_entry: r });
    });

    if (result.items.length === 0) {
      var hint = 'Ничего не найдено.';
      if (!normalizeBase(str('ltp_parser_url') || str('jackett_url'))) {
        hint += ' Для новых фильмов и сериалов укажите Jackett в настройках парсера Lampa.';
      }
      notify(hint);
    }
    if (result.errors.length) notify(result.errors.join('; '));

    Lampa.Select.show({
      title: 'Найдено: ' + query,
      items: items,
      onBack: function () { backTo(prev); },
      onSelect: function (a) {
        backTo(prev);
        if (a.ltp_tmdb) return openTmdb(query);
        if (a.ltp_entry) play(a.ltp_entry, query);
      }
    });
  }

  function openTmdb(query) {
    Lampa.Activity.push({
      url: 'search/multi',
      title: 'Поиск: ' + query,
      component: 'category_full',
      page: 1,
      query: encodeURIComponent(query),
      source: 'tmdb'
    });
  }

  function runSearch(query, prev) {
    query = (query || '').trim();
    if (!query) return;
    try { Lampa.Loading.start(); } catch (_) {}
    searchAll(query).then(function (result) {
      try { Lampa.Loading.stop(); } catch (_) {}
      showResults(query, result, prev);
    }).catch(function (e) {
      try { Lampa.Loading.stop(); } catch (_) {}
      notify('Ошибка поиска: ' + e.message);
    });
  }

  function ask() {
    var prev = 'content';
    try { prev = Lampa.Controller.enabled().name || 'content'; } catch (_) {}

    Lampa.Input.edit({
      free: true,
      title: 'Название фильма или сериала',
      nosave: true,
      value: ''
    }, function (value) {
      backTo(prev);
      runSearch(value, prev);
    });
  }

  function addMenu() {
    if ($('.menu .ltp-menu-item').length) return;
    var item = $(
      '<li class="menu__item selector ltp-menu-item">' +
        '<div class="menu__ico">' + SEARCH_ICON + '</div>' +
        '<div class="menu__text">' + TITLE + '</div>' +
      '</li>'
    );
    item.on('hover:enter', ask);
    $('.menu .menu__list').eq(0).append(item);
  }

  function addHeadButton() {
    try {
      var head = $('.head .head__actions');
      if (head.length && !head.find('.ltp-head-btn').length) {
        var btn = $('<div class="head__action selector ltp-head-btn">' +
          SEARCH_ICON.replace('width="24" height="24"', 'width="22" height="22"') + '</div>');
        btn.on('hover:enter click', ask);
        head.prepend(btn);
      }
    } catch (_) {}
  }

  /* ---------- настройки ---------- */

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
      addParam('ltp_torbox_api_key', 'input', 'Ключ TorBox API',
        'Ваш личный ключ (пока не используется).', '');
      addParam('ltp_weather_enabled', 'trigger', 'Показывать погоду', 'Погода для указанного города (пока не реализовано).', true);
      addParam('ltp_weather_city', 'input', 'Город для погоды', 'По умолчанию Белгород.', 'Белгород');
    } catch (e) {
      console.error('[Lampa Torrent Pro] settings error:', e);
    }
  }

  function start() {
    addMenu();
    addHeadButton();
    addSettings();
    window.lampaTorrentPro = {
      version: VERSION,
      search: function (q) { runSearch(q, 'content'); },
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
