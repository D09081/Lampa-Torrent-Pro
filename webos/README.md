# Cinema OS — webOS 1.4

Target: LG 42LB673V-ZB, firmware 05.05.90, SDK 1.4.0, ARMv7.

## Version 0.3.0

- Live weather widget on the home screen using Open-Meteo.
- Dedicated weather page with current conditions and a three-day forecast.
- City selection via Open-Meteo geocoding; default city is Belgorod.
- Weather requests use XMLHttpRequest for legacy WebKit compatibility.

## Version 0.2.0

- TV-first cyber interface for 1280x720.
- Main page, Movies, Series, Search, My Collection, Sources and Settings.
- Remote navigation with arrow keys, OK and Back.
- Movie detail cards, favourites and recently opened items.
- Local settings, history and favourites when localStorage is available.
- ES5 JavaScript and legacy WebKit-friendly CSS.

## Important implementation status

The bundled catalogue is demonstration data, not a live movie database. No third-party streaming provider is connected and no video playback is claimed.

The repository's Lampa modules (Showy, Hermes Movie, Online MOD and Online Cinema) use Lampa-specific APIs such as Lampa.Utils, Lampa.Select and Lampa.Player. They cannot be loaded as standalone webOS providers. Each source needs an independent adapter for search, metadata, stream resolution and playback, followed by real-device testing.

Lampac is represented only as an optional self-hosted server setting. A server URL alone does not guarantee API compatibility or playback.

## Compatibility

The target uses webOS 1.x WebKit. Keep code ES5-compatible; avoid modern syntax and unsupported browser APIs. Test network requests and media playback on the actual TV. Do not bypass DRM or provider access controls; use sources and streams you are authorized to access.

## Build

GitHub Actions workflow Build Cinema OS IPK packages the webos directory and uploads the IPK artifact. Push changes to branch cinema-os-webos or run the workflow manually.
