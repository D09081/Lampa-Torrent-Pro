# Lampa Cinema OS — rebuild track

This branch is the safe development track for the Cinema OS redesign. The default `main` branch is intentionally untouched.

## Current modules

- `experimental/cinema-os.js` — experimental Cinema OS dashboard and menu entry.
- `experimental/cinema-os-native-skin.js` — native Lampa screen skin (Cyber Purple). It styles the existing menu, catalog cards, detail screen, dialogs, settings and player UI without replacing Lampa's internal navigation or playback engines.

## Install the current native skin

Add this URL in Lampa → Settings → Extensions:

```
https://raw.githubusercontent.com/D09081/Lampa-Torrent-Pro/cinema-os-rebuild/experimental/cinema-os-native-skin.js
```

To use the dashboard too, add:

```
https://raw.githubusercontent.com/D09081/Lampa-Torrent-Pro/cinema-os-rebuild/experimental/cinema-os.js
```

Restart Lampa after adding extensions. The native skin is global by design; it affects Lampa's own screens but does not rewrite third-party plugin interfaces.

## Important scope

This is a progressive redesign layer, not yet a standalone rebuilt Lampa distribution. The upstream source repository is `yumata/lampa-source` (GPL-2.0). A full standalone build requires importing and building that source tree, preserving its license and notices, then integrating the Cinema OS styles into the app stylesheet and changing the native menu/templates. The GitHub integration available for this session can edit the user's repository but cannot create a fork or mirror another repository's complete Git object tree. Therefore the upstream source has not been falsely represented as copied into this repository.

## Planned implementation sequence

1. Validate the native skin on the target LG webOS device and fix focus/remote edge cases.
2. Move the skin from an extension into the native SCSS build once the upstream source tree is imported.
3. Redesign the home screen and navigation using native Lampa components.
4. Implement unified catalog/search UX while keeping TMDB metadata separate from actual playback providers.
5. Add provider adapters only where a provider exposes a documented, compatible API. Official streaming services remain deep links; DRM streams are not extracted.
6. Add source health/status UI, caching, diagnostics and performance checks.
7. Build and test the webOS package on a real TV.

## Compatibility notes

- Target: Lampa 3.x browser runtime, including LG webOS browser-based deployment.
- Remote control: existing Lampa `selector` focus and `hover:enter` handling is retained.
- No new backend or VPS is required for the skin.
- Real-device testing is still required; syntax/static review does not prove runtime compatibility.
