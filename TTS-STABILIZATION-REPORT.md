# CinoCode TTS Stabilization Report

## Root cause

The live HTTPS build had no guaranteed server-side TTS endpoint. When `tts_url` was empty, the frontend generated `http://<netlify-host>:8001/api/tts`, which is unreachable on Netlify and is blocked as mixed content from an HTTPS page.

Named server voices then silently fell back to Web Speech. Mobile voice-name matching is device-dependent, and the fallback applied aggressive pitch/rate transformations. This explains why an intended male profile could sound female, metallic, distorted, or unlike desktop playback.

## Minimum patch

- Live HTTPS no longer invents an insecure port-8001 TTS URL.
- Named server voices never silently fall back to browser speech.
- A clear warning is shown when a secure cloud TTS URL is missing or the provider fails.
- Previous TTS requests and audio playback are aborted before a new one starts.
- Server responses must be HTTP-successful `audio/mpeg`, at least 256 bytes, with a valid MP3 header.
- Object URLs are revoked and audio sources are cleaned up safely.
- Client playback rate remains user-controlled; character rate/pitch stays server-side.

## Deployment requirement

For named voices on the live site, deploy `server.py` to a real HTTPS service (for example Render), configure `GOOGLE_TTS_KEY` and `CINOCODE_ALLOWED_ORIGINS` there, then enter the resulting HTTPS `/api/tts` URL in CinoCode's **Bulut Ses Sunucusu URL'si** setting.

Until that endpoint is configured, Deniz/device voice remains available, while named server voices fail visibly instead of degrading into a wrong-gender fallback.

## Validation

- `node --check assets/js/main.js`
- `npm test` (158/158 expected)
- Added tests for no silent browser fallback, HTTPS endpoint requirement, MP3 validation, and request cancellation.

Real Android audio quality still requires a device test against the configured HTTPS TTS endpoint.
