(function () {
    'use strict';

    var PLUGIN_ID = 'lampa_torrent_pro';
    var STORAGE_KEY = 'lampa_torrent_pro_settings';

    if (window.__lampa_torrent_pro_loaded) return;
    window.__lampa_torrent_pro_loaded = true;

    var defaults = {
        torrserver: 'http://127.0.0.1:8090',
        username: '',
        password: '',
        legalOnly: true
    };

    function settings() {
        var saved = Lampa.Storage.get(STORAGE_KEY, {});
        return Object.assign({}, defaults, saved || {});
    }

    function save(patch) {
        var current = settings();
        Object.keys(patch).forEach(function (key) {
            current[key] = patch[key];
        });
        Lampa.Storage.set(STORAGE_KEY, current);
    }

    function registerSettings() {
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addComponent || !Lampa.SettingsApi.addParam) return;

        Lampa.SettingsApi.addComponent({
            component: PLUGIN_ID,
            name: 'Lampa Torrent Pro',
            icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 3h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: {
                name: 'torrserver_url',
                type: 'input',
                values: '',
                default: defaults.torrserver
            },
            field: {
                name: 'Адрес TorrServer',
                description: 'Например: http://192.168.1.10:8090'
            }
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: {
                name: 'torrserver_user',
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'Логин TorrServer (если требуется)'
            }
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: {
                name: 'torrserver_password',
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'Пароль TorrServer (если требуется)'
            }
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: {
                name: 'legal_only',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Показывать только источники с подтверждаемыми правами',
                description: 'Включено по умолчанию. Наличие torrent-файла не означает, что его распространение разрешено.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN_ID,
            param: {
                name: 'about',
                type: 'static'
            },
            field: {
                name: 'О проекте',
                description: 'Lampa Torrent Pro — каталог открытых и общественно-доступных материалов. Проверяйте лицензию каждого материала перед загрузкой.'
            }
        });
    }

    function syncSettingsFromLampa() {
        var current = settings();
        var url = Lampa.Storage.get('torrserver_url', current.torrserver);
        if (typeof url === 'string' && url.trim()) current.torrserver = url.trim().replace(/\/$/, '');
        save(current);
    }

    function start() {
        if (!window.Lampa || !Lampa.SettingsApi || !Lampa.Storage) return;
        registerSettings();
        syncSettingsFromLampa();
        window.lampaTorrentPro = {
            version: '0.1.0',
            settings: settings,
            save: save,
            sources: [
                { id: 'archive', title: 'Internet Archive', url: 'https://archive.org/details/bittorrent', note: 'Проверяйте права и лицензию конкретного элемента.' },
                { id: 'pdt', title: 'Public Domain Torrents', url: 'https://www.publicdomaintorrents.info/', note: 'Каталог заявляет фильмы общественного достояния; проверяйте статус в своей стране.' },
                { id: 'blender', title: 'Blender Open Movies', url: 'https://studio.blender.org/films/', note: 'Открытые фильмы Blender Foundation; условия лицензии указаны на странице фильма.' },
                { id: 'academic', title: 'Academic Torrents', url: 'https://academictorrents.com/', note: 'Научные наборы данных и материалы; проверяйте лицензию набора.' }
            ]
        };
        console.log('[Lampa Torrent Pro] loaded');
    }

    if (window.appready) start();
    else if (Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();
