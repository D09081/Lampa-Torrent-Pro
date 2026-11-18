# Lampa Cinema OS — experimental

This branch contains the first isolated dashboard prototype for the Cinema OS redesign.

## Status

- Experimental branch: `cinema-os-foundation`
- Dashboard module: `experimental/cinema-os.js`
- It adds a separate **Cinema OS** entry to the Lampa menu.
- Its styles are namespaced under `lcos-*`; it does not recolor global Lampa or third-party plugin selectors.
- Existing Lampa navigation, catalogue and playback remain in place.

## Install for a test

Add this plugin URL in Lampa:

`https://raw.githubusercontent.com/D09081/Lampa-Torrent-Pro/cinema-os-foundation/experimental/cinema-os.js`

Restart Lampa. Open **Cinema OS** from the side menu.

## Important limitations

This is a UI foundation, not yet a complete Lampa fork or a unified streaming backend. The Films/Series routes use Lampa's category router. Sources and Collections are intentionally labelled as staged sections until compatible APIs/adapters are implemented.

Test on a real LG webOS device before treating this as a release. Do not replace the stable main-branch plugin yet.

## Next implementation stages

1. Validate remote focus and category routes on LG webOS.
2. Build a real catalogue-backed home feed and search.
3. Add a source registry with health/status checks and adapters.
4. Rebuild movie details with availability, legal providers and playback options.
5. Only after the prototype is stable, create a full upstream Lampa fork and move the design into the application shell.
