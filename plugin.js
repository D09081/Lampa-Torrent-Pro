/* Lampa Torrent Pro short loader — no ads or analytics. */
(function () {
  'use strict';
  var src = 'https://raw.githubusercontent.com/D09081/Lampa-Torrent-Pro/main/plugin/lampa-torrent-pro.js';
  if (window.__ltp_short_loader_loaded) return;
  window.__ltp_short_loader_loaded = true;
  var script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onerror = function () {
    window.__ltp_short_loader_loaded = false;
    console.error('[Lampa Torrent Pro] Failed to load main plugin:', src);
  };
  document.head.appendChild(script);
})();
