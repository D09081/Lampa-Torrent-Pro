/* Lampa Torrent Pro 0.3.0 — самодостаточный плагин. Без рекламы, аналитики и чужих ключей.
 * 1) Пункт меню и кнопка в шапке «Поиск Torrent Pro»: вводишь название фильма/сериала —
 *    получаешь результаты TMDB; торренты открываются штатной кнопкой Lampa (нужен парсер).
 * 2) Раздел настроек «Lampa Torrent Pro» (адрес парсера, ключ TorBox, погода). */
(function () {
  'use strict';

  var ID = 'lampa_torrent_pro';
  var VERSION = '0.3.0';
  var TITLE = 'Поиск Torrent Pro';

  if (window.__ltp_loaded) return;
  window.__ltp_loaded = true;

  var SEARCH_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

  function get(key, fallback) {
    try { return Lampa.Storage.get(key, fallback); }
    catch (_) { return fallback; }
  }

  function settings() {
    return {
      parserUrl: String(get('ltp_parser_url', '') || '').trim(),
      torboxApiKey: String(get('ltp_torbox_api_key', '') || '').trim(),
      weatherCity: String(get('ltp_weather_city', 'Белгород') || 'Белгород').trim(),
      weatherEnabled: !!get('ltp_weather_enabled', true)
    };
  }

  /* ---------- Поиск ---------- */

  function openResults(query) {
    query = (query || '').trim();
    if (!query) return;
    Lampa.Activity.push({
      url: 'search/multi',
      title: 'Поиск: ' + query,
      component: 'category_full',
      page: 1,
      query: encodeURIComponent(query),
      source: 'tmdb'
    });
  }

  function ask() {
    var prev = 'content';
    try { prev = Lampa.Controller.enabled().name || 'content'; } catch (e) {}

    Lampa.Input.edit({
      free: true,
      title: 'Название фильма или сериала',
      nosave: true,
      value: ''
    }, function (value) {
      try { Lampa.Controller.toggle(prev); } catch (e) {}
      openResults(value);
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
        var btn = $('<div class="head__action selector ltp-head-btn">' + SEARCH_ICON.replace('width="24" height="24"', 'width="22" height="22"') + '</div>');
        btn.on('hover:enter click', ask);
        head.prepend(btn);
      }
    } catch (e) {}
  }

  /* ---------- Настройки ---------- */

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
      addParam('ltp_parser_url', 'input', 'Адрес поискового парсера',
        'URL совместимого поискового API. Не указывайте неизвестные адреса, которым не доверяете.', '');
      addParam('ltp_torbox_api_key', 'input', 'Ключ TorBox API',
        'Ваш личный ключ. Не используйте ключи из чужих плагинов.', '');
      addParam('ltp_weather_enabled', 'trigger', 'Показывать погоду', 'Погода для указанного города.', true);
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
      settings: settings,
      search: openResults,
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
