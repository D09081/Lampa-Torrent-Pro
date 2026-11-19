# Cinema OS 0.7.1 — family cinema MVP

Target: LG 42LB673V-ZB, webOS 1.4.0, ARMv7.

## Cinema Engine core
- ES5-compatible runtime loaded before the UI, including a Promise fallback for older WebKit.
- Catalog normalization, merge and search; local storage; event bus; plugin registry; source-provider registry; playback history API.
- Source adapters register through `CinemaEngine.sources.register()` and expose callback-based `search` and `resolve` methods.
- Internet Archive is registered as the first adapter. It is not a Lampa plug-in and does not make Online MOD, Showy or Hermes compatible.

## Lampa Torrent Pro port
- Original repository plugin `plugin.js` (Lampa Torrent Pro 1.9.2) is ported as `js/plugins/lampa-torrent-pro.js` and registered through CinemaEngine Plugin API.
- Internet Archive search and direct-file resolution are available as a source adapter.
- Jackett adapter is configurable in Cinema OS settings (server URL and API key); torrent results are shown with seeder/size metadata. Magnet playback is not implemented until a TorrServer adapter is added.
- Quality/audio preference ranking and JustWatch region configuration are retained.
- Online MOD, Showy, Hermes Movie and Online Cinema are tracked as legacy Lampa integrations. VideoDB is explicitly recorded as a source bundled with Showy (alongside VideoCDN, HDVB, Kinotochka and Redheadsound); it is not a standalone endpoint in this port. Showy requires its own activation flow and Lampa runtime. Neither Showy nor VideoDB is currently queried by Cinema OS; a compatible adapter and endpoint/authentication verification are still required.

## Included
- TV-friendly, aligned catalogue, movie details, favourites, search and local collection.
- Film detail has a **Where to watch** action.
- Live search of Internet Archive public catalogue, followed by metadata/file lookup.
- Lists available media files and launches the selected direct file URL in the built-in HTML5 video player.
- Player position history and resume, native controls, remote-key navigation.
- Add personal direct HTTP(S) media URLs to the local library.
- Legacy ES5 JavaScript.

## Source and playback boundaries
Internet Archive is the only automatically queried online video catalogue in this build. Its search results can include material with different rights; check each item's license and access terms. The app filters for common media extensions, but actual playback depends on the TV's codecs, TLS and network support. A result is not guaranteed to play on this older webOS device.

This does not yet integrate Showy, Hermes, HDRezka, VideoDB, Online MOD or other Lampa plug-ins. Those plug-ins depend on Lampa runtime APIs and often private/third-party backends; they cannot be safely or reliably executed as standalone webOS modules without a compatible documented API and separate testing. No DRM or access-control bypass is implemented. Official subscription services should be watched in their own supported apps/sites.

The sample home catalogue is demo metadata and has no bundled streams. User-added URLs, favourites and playback history are stored in localStorage on the TV.

## Build
GitHub Actions workflow packages webos/ into an IPK and uploads the artifact.


## Native online adapters (0.8.0)
- `js/plugins/online-sources.js` adds native CinemaEngine providers for HDRezka, Filmix and Collaps. These are independent adapters; the original Lampa plugin is not copied wholesale.
- HDRezka: title search and movie stream resolution are attempted through its public page/AJAX flow. Series season/episode selection is not yet implemented.
- Filmix: title suggestions are queried. Stream resolution requires a token belonging to the user's own account; no embedded credentials are included.
- Collaps: lookup requires a Kinopoisk numeric ID or IMDb ID on the movie record. The Add Video screen can create a title-only record and store either ID.
- Browser-origin CORS, mirror challenges, site-side authentication, and codec support can prevent direct playback. No private proxy credentials, DRM circumvention, or mandatory user server is included.
- The adapters are experimental and must be tested on the target LG webOS device; source registration does not guarantee that a provider is reachable from the TV.
