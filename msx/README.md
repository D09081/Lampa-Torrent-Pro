# Cinema OS Launcher — MSX portal

Version 0.1.0 is the first native Media Station X portal shell.

## Setup

In Media Station X on LG webOS, open **Settings → Start Parameter → Setup** and enter the host `d09081.github.io`. The portal start object is `msx/start.json`.

The repository's GitHub Pages deployment must include this branch's `msx/` directory before the portal URL can be used. The portal is native MSX JSON (not a standalone HTML page), so navigation and focus are handled by Media Station X.

## Current scope

- Cyber-inspired dark presentation with a hybrid left menu and content panels.
- Home, Films, Series, Adapter Hub, Favorites, History, Settings sections.
- No server required for this static shell.
- Source integrations, catalog, local persistence and playback are intentionally marked as pending until their interfaces are verified.

## Next

1. Verify MSX JSON on the LG TV.
2. Add adapter bridge modules only after reviewing the actual plugin code and APIs.
3. Add catalog/search and player-compatible playback flows.
