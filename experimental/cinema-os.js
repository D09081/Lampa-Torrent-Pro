/* Lampa Cinema OS — experimental dashboard
 * Isolated UI module. Does not overwrite global Lampa styles or third-party plugin CSS.
 * Target: Lampa 3.x / LG webOS remote navigation.
 */
(function () {
  'use strict';

  var ID = 'lampa_cinema_os';
  var VERSION = '0.1.0';
  var STYLE_ID = 'lcos-style';

  if (window.__lcos_loaded) return;
  window.__lcos_loaded = true;

  var sections = [
    { title: 'Фильмы', subtitle: 'Полнометражное кино', icon: '▶', route: 'movie' },
    { title: 'Сериалы', subtitle: 'Сезоны и новые серии', icon: '▤', route: 'tv' },
    { title: 'Подборки', subtitle: 'Под настроение', icon: '✦', route: 'collections' },
    { title: 'Источники', subtitle: 'Сервисы и доступность', icon: '◎', route: 'sources' }
  ];

  function notify(message) {
    try { Lampa.Noty.show(message); } catch (_) {}
  }

  function openCategory(route, title) {
    if (route === 'sources') {
      Lampa.Select.show({
        title: 'Источники просмотра',
        items: [
          { title: 'Официальные сервисы', subtitle: 'Доступность и переход на JustWatch' },
          { title: 'Онлайн-плагины', subtitle: 'Online MOD, Showy, Online Cinema, Hermes' },
          { title: 'Открытые каталоги', subtitle: 'Публичные материалы с проверкой прав' },
          { title: 'Настроить источники', subtitle: 'Параметры подключённых модулей' }
        ],
        onSelect: function (item) {
          Lampa.Select.close();
          notify(item.title + ': раздел подключается на следующем этапе');
          Lampa.Controller.toggle('content');
        },
        onBack: function () { Lampa.Controller.toggle('content'); }
      });
      return;
    }

    if (route === 'collections') {
      Lampa.Select.show({
        title: 'Подборки',
        items: [
          { title: 'Сейчас популярно' },
          { title: 'Высокий рейтинг' },
          { title: 'Новинки' },
          { title: 'Семейный просмотр' }
        ],
        onSelect: function () {
          Lampa.Select.close();
          notify('Подборки будут подключены к каталогу на следующем этапе');
          Lampa.Controller.toggle('content');
        },
        onBack: function () { Lampa.Controller.toggle('content'); }
      });
      return;
    }

    try {
      Lampa.Router.call('category', {
        url: route,
        title: title,
        source: 'tmdb',
        page: 1
      });
    } catch (e) {
      notify('Не удалось открыть раздел каталога');
    }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.lcos-screen{padding:1.4em 2.2em 3em;color:#f6f3ff;box-sizing:border-box;}',
      '.lcos-screen *{box-sizing:border-box;}',
      '.lcos-hero{position:relative;overflow:hidden;min-height:17em;border-radius:1.25em;padding:2.2em;background:radial-gradient(ellipse at 78% 28%,rgba(142,83,255,.42),transparent 38%),linear-gradient(115deg,#171322 0%,#211633 55%,#321c50 100%);border:1px solid rgba(190,155,255,.17);}',
      '.lcos-kicker{font-size:.78em;letter-spacing:.18em;text-transform:uppercase;color:#c7a8ff;font-weight:700;}',
      '.lcos-title{font-size:2.3em;line-height:1.08;font-weight:800;margin:.45em 0 .35em;max-width:12em;}',
      '.lcos-copy{font-size:1em;color:rgba(246,243,255,.72);max-width:34em;line-height:1.5;}',
      '.lcos-section-title{font-size:1.25em;font-weight:700;margin:1.6em 0 .8em;}',
      '.lcos-grid{display:flex;flex-wrap:wrap;gap:.8em;}',
      '.lcos-tile{width:calc(25% - .65em);min-height:8.5em;padding:1.1em;border-radius:1em;background:linear-gradient(145deg,#211b2d,#17141f);border:1px solid rgba(190,155,255,.13);transition:transform .15s,border-color .15s,background .15s;}',
      '.lcos-tile.focus,.lcos-tile:focus{border-color:#b58aff;background:linear-gradient(145deg,#392454,#21182e);transform:scale(1.025);}',
      '.lcos-icon{font-size:1.7em;color:#c6a5ff;margin-bottom:.55em;}',
      '.lcos-tile-title{font-size:1.08em;font-weight:700;}',
      '.lcos-tile-sub{font-size:.78em;color:rgba(246,243,255,.58);margin-top:.35em;}',
      '.lcos-footer{margin-top:1.5em;color:rgba(246,243,255,.42);font-size:.75em;}',
      '@media(max-width:900px){.lcos-screen{padding:1em}.lcos-tile{width:calc(50% - .4em)}.lcos-hero{min-height:14em;padding:1.4em}.lcos-title{font-size:1.8em}}'
    ].join('');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function CinemaHome(object) {
    var root = $('<div class="lcos-screen"></div>');
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var alive = true;

    function tile(item) {
      var el = $('<div class="lcos-tile selector" tabindex="0">' +
        '<div class="lcos-icon">' + item.icon + '</div>' +
        '<div class="lcos-tile-title"></div>' +
        '<div class="lcos-tile-sub"></div></div>');
      el.find('.lcos-tile-title').text(item.title);
      el.find('.lcos-tile-sub').text(item.subtitle);
      el.on('hover:enter', function () { openCategory(item.route, item.title); });
      return el;
    }

    this.create = function () {
      addStyles();
      var hero = $('<div class="lcos-hero"><div class="lcos-kicker">Lampa Cinema OS</div><div class="lcos-title">Твой мир кино. Без лишнего.</div><div class="lcos-copy">Единый центр поиска, каталогов и источников просмотра. Быстрая навигация с пульта и понятные действия на каждом экране.</div></div>');
      root.append(hero);
      root.append('<div class="lcos-section-title">Открыть раздел</div>');
      var grid = $('<div class="lcos-grid"></div>');
      sections.forEach(function (item) { grid.append(tile(item)); });
      root.append(grid);
      root.append('<div class="lcos-footer">Экспериментальная оболочка · ' + VERSION + ' · LG webOS ready layout</div>');
      scroll.append(root);
      return this.render();
    };

    this.start = function () { if (alive) Lampa.Controller.toggle('content'); };
    this.stop = function () {};
    this.render = function () { return scroll.render(); };
    this.destroy = function () {
      alive = false;
      root.off();
      scroll.destroy();
      root.remove();
    };
  }

  function init() {
    addStyles();
    if (!Lampa.Component.get('lcos_home')) {
      Lampa.Component.add('lcos_home', CinemaHome);
    }

    var list = $('.menu .menu__list').eq(0);
    if (list.length && !list.find('[data-lcos-menu="1"]').length) {
      var item = $('<li class="menu__item selector" data-lcos-menu="1"><div class="menu__ico">✦</div><div class="menu__text">Cinema OS</div></li>');
      item.on('hover:enter', function () {
        Lampa.Activity.push({
          url: 'lcos_home',
          title: 'Cinema OS',
          component: 'lcos_home',
          page: 1
        });
      });
      list.append(item);
    }
  }

  if (window.appready) init();
  else if (Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') init();
    });
  }
})();
