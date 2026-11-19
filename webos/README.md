# Cinema OS 0.5.0 — family cinema MVP

Target: LG 42LB673V-ZB, webOS 1.4.0, ARMv7.

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

This does not integrate Showy, Hermes, HDRezka, VideoDB, Online MOD or other Lampa plug-ins. Those plug-ins depend on Lampa runtime APIs and often private/third-party backends; they cannot be safely or reliably executed as standalone webOS modules without a compatible documented API and separate testing. No DRM or access-control bypass is implemented. Official subscription services should be watched in their own supported apps/sites.

The sample home catalogue is demo metadata and has no bundled streams. User-added URLs, favourites and playback history are stored in localStorage on the TV.

## Build
GitHub Actions workflow packages webos/ into an IPK and uploads the artifact.
