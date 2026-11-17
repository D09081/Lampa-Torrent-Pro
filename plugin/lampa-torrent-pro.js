/* Lampa Torrent Pro — clean-room plugin
 * No advertising, trackers, bundled API keys, or third-party proxy defaults.
 * Search providers and playback credentials are configured by the owner.
 */
(function () {
  'use strict';

  var ID = 'lampa_torrent_pro';
  var VERSION = '0.2.0';
  if (window.__lampa_torrent_pro_loaded) return;
  window.__lampa_torrent_pro_loaded = true;

  function get(key, fallback) {
    try { return Lampa.Storage.get(key, fallback); }
    catch (_) { return fallback; }
  }

  function addParam(name, type, title, description, fallback) {
    if (!Lampa.SettingsApi || !Lampa.SettingsApi.addParam) return;
    Lampa.SettingsApi.addParam({
      component: ID,
      param: { name: name, type: type, default: fallback },
      field: { name: title, description: description || '' }
    });
  }

  function settings() {
    return {
      parserUrl: String(get('ltp_parser_url', '') || '').trim(),
      torboxApiKey: String(get('ltp_torbox_api_key', '') || '').trim(),
      weatherCity: String(get('ltp_weather_city', 'Белгород') || 'Белгород').trim(),
      weatherEnabled: !!get('ltp_weather_enabled', true)
    };
  }

  function start() {
    if (!window.Lampa || !Lampa.SettingsApi || !Lampa.Storage) return;

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

    window.lampaTorrentPro = {
      version: VERSION,
      settings: settings,
      advertising: false,
      telemetry: false,
      providers: [],
      status: 'configuration-ready',
      note: 'Поисковый адаптер и потоковое воспроизведение подключаются отдельно после проверки API провайдера.'
    };

    console.log('[Lampa Torrent Pro] clean build ' + VERSION);
  }

  if (window.appready) start();
  else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (event) {
      if (event.type === 'ready') start();
    });
  }
})();
