/* Lampa Cinema OS — native UI skin
 * v0.2.0 | Cyber Purple | LG webOS / remote-first
 * Uses existing Lampa screens and selectors; does not replace catalog/player logic.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lcos-native-skin';
  var BODY_CLASS = 'lcos-native';
  if (window.__lcos_native_skin) return;
  window.__lcos_native_skin = true;

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

  function mount() {
    document.body.classList.add(BODY_CLASS);
    if (!document.getElementById(STYLE_ID)) {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  function init() {
    mount();
    if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('activity', function (event) {
        if (event.type === 'start' || event.type === 'ready') mount();
      });
    }
  }

  if (window.appready) init();
  else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') init();
    });
  } else {
    var tries = 0;
    var wait = setInterval(function () {
      tries++;
      if (window.Lampa && (window.appready || tries > 20)) {
        clearInterval(wait);
        init();
      }
      if (tries > 40) clearInterval(wait);
    }, 250);
  }
})();
