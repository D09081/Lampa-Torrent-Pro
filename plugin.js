/* Lampa Torrent Pro — самодостаточный плагин (без внешней загрузки второго файла).
 * Добавляет в левое меню пункт «Поиск Torrent Pro»: вводишь название фильма/сериала —
 * получаешь результаты TMDB; из карточки открываются торренты штатной кнопкой Lampa. */
(function () {
  'use strict';

  if (window.__ltp_loaded) return;
  window.__ltp_loaded = true;

  var TITLE = 'Поиск Torrent Pro';

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
        '<div class="menu__ico">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' +
          '</svg>' +
        '</div>' +
        '<div class="menu__text">' + TITLE + '</div>' +
      '</li>'
    );

    item.on('hover:enter', ask);
    $('.menu .menu__list').eq(0).append(item);
  }

  function start() {
    addMenu();
    // Кнопка в шапке рядом со штатным поиском (если есть)
    try {
      var head = $('.head .head__actions');
      if (head.length && !head.find('.ltp-head-btn').length) {
        var btn = $('<div class="head__action selector ltp-head-btn"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></div>');
        btn.on('hover:enter click', ask);
        head.prepend(btn);
      }
    } catch (e) {}
  }

  if (window.appready) start();
  else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') start();
    });
  }
})();
