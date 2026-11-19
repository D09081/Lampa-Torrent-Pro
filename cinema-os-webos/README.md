# Cinema OS for LG webOS 1.4

Standalone web application shell for LG 42LB673V-ZB / webOS SDK 1.4.0.

## Current milestone

- Legacy-compatible HTML/CSS/JavaScript (ES5).
- Cyber-inspired home screen.
- Remote-control focus and Back handling.
- Source hub reflecting the modules listed in the parent Lampa Torrent Pro plugin:
  - Online МОД
  - Showy
  - Hermes Movie
  - Online Cinema
  - Lampac
  - Jackett + TorrServer

## Important integration status

The parent Lampa plugin loads third-party scripts into the Lampa runtime using `Lampa.Utils.putScriptAsync`. These scripts depend on Lampa APIs and are **not directly executable** in a standalone webOS app. The source cards in this milestone are honest integration placeholders, not working playback providers.

Each source requires a legal, compatible provider API/server adapter and playback URL. Protected streams, account-gated services, DRM and third-party access controls are not bypassed.

## Device constraints

Target reported by the device:
- Model: LG 42LB673V-ZB
- Firmware: 05.05.90
- SDK: 1.4.0
- CPU architecture: ARMv7

The UI intentionally avoids modern JavaScript syntax and CSS Grid/Flexbox dependencies where possible. Actual codec, network, packaging and install compatibility must be tested on the TV.

## Next steps

1. Verify the IPK packaging format accepted by this firmware.
2. Build and install this shell as a test app.
3. Add a catalog API adapter.
4. Add provider-specific adapters one at a time and validate playback on-device.
