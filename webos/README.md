# Cinema OS — family cinema MVP (webOS 1.4)

Target: LG 42LB673V-ZB, firmware 05.05.90, SDK 1.4.0, ARMv7.

## 0.4.0 MVP
- Reworked Lampa-inspired browse flow with consistent poster cards and aligned shelves.
- Home, catalogue, series, search, favourites/library, sources and profile screens.
- Add personal direct HTTP(S) video URLs to the local collection.
- Built-in HTML5 video player with native controls, playback position history and resume.
- ES5 JavaScript and legacy WebKit-compatible layout.

## Playback limitations
The player plays direct media URLs that the TV can decode. A web page URL, DRM-protected stream, or third-party site's embedded player is not a direct media URL. Format and codec support depends on the TV's old webOS 1.4 media stack. Test with an authorized MP4 stream first. HLS support is device/firmware-dependent and is not guaranteed.

The bundled titles are sample metadata, not a live licensed catalogue, and do not include video streams. No Lampa provider is represented as connected. Lampa modules rely on Lampa-specific APIs and need independent webOS adapters; provider integrations must be separately implemented and tested. No DRM or access-control bypass is included.

## Storage
User-added URLs, favourites, and playback history are stored in localStorage on the TV. Avoid adding private or temporary signed URLs if you do not want them stored on the device.

## Build
GitHub Actions workflow Build Cinema OS IPK packages webos/ and uploads the IPK artifact.
