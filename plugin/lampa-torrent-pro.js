(function () {
    'use strict';
    var ID = 'lampa_torrent_pro';
    if (window.__lampa_torrent_pro_loaded) return;
    window.__lampa_torrent_pro_loaded = true;

    function getSettings() {
        return {
            torrserver: Lampa.Storage.get('torrserver_url', 'http://127.0.0.1:8090'),
            username: Lampa.Storage.get('torrserver_user', ''),
            password: Lampa.Storage.get('torrserver_password', ''),
            legalOnly: Lampa.Storage.get('legal_only', true)
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
        if (Lampa.SettingsApi.addParam) {
            [
                { name: 'torrserver_url', type: 'input', default: 'http://127.0.0.1:8090', title: 'Адрес TorrServer', description: 'Например: http://192.168.1.10:8090' },
                { name: 'torrserver_user', type: 'input', default: '', title: 'Логин TorrServer (если требуется)' },
                { name: 'torrserver_password', type: 'input', default: '', title: 'Пароль TorrServer (если требуется)' },
                { name: 'legal_only', type: 'trigger', default: true, title: 'Только источники с подтверждаемыми правами', description: 'Проверяйте лицензию каждого материала.' }
            ].forEach(function (item) {
                Lampa.SettingsApi.addParam({
                    component: ID,
                    param: { name: item.name, type: item.type, default: item.default },
                    field: { name: item.title, description: item.description || '' }
                });
            });
        }
        window.lampaTorrentPro = {
            version: '0.1.1',
            settings: getSettings,
            sources: [
                { id: 'archive', title: 'Internet Archive', url: 'https://archive.org/details/bittorrent', note: 'Права проверяются для каждого элемента.' },
                { id: 'pdt', title: 'Public Domain Torrents', url: 'https://www.publicdomaintorrents.info/', note: 'Проверяйте статус общественного достояния в своей стране.' },
                { id: 'blender', title: 'Blender Open Movies', url: 'https://studio.blender.org/films/', note: 'Лицензия указывается на странице фильма.' },
                { id: 'academic', title: 'Academic Torrents', url: 'https://academictorrents.com/', note: 'Проверяйте лицензию каждого набора.' }
            ]
        };
        console.log('[Lampa Torrent Pro] loaded');
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();