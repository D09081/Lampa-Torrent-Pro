# Cinema OS — webOS 1.4 prototype

Target: LG 42LB673V-ZB, firmware 05.05.90, SDK 1.4.0, ARMv7.

This is the first UI shell only. It uses ES5 JavaScript and simple CSS for the legacy webOS browser engine.

Current: Cyber-style home screen, remote navigation with arrows/OK/Back, source selector placeholders for Showy, Hermes, Online MOD, Online Cinema, Lampac and JustWatch.

Not implemented: provider adapters, TMDB catalog/search, video playback, audio/quality selection, IPK packaging and installation.

The Lampa plugin relies on Lampa-specific APIs and cannot be copied as-is into a standalone webOS app. Provider integration requires compatible documented endpoints/adapters and a player path supported by this TV. Use only sources and streams you are authorized to access.
