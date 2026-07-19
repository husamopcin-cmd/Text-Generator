# CinoCode

CinoCode is a Turkish-first AI workspace for chat, documents, voice, images, small apps, and project-based conversation history. The frontend is framework-free and modular; Netlify Functions keep provider keys on the server.

> Release status: the technical core is tested locally, but no public production URL is declared here until deployment and manual acceptance are complete.

## Current capabilities

- Multi-provider chat routing with OpenAI-compatible providers, Groq, Gemini 3.5 Flash, and optional local Ollama fallback.
- Non-blocking AI conversation titles with a deterministic offline title fallback.
- Bounded conversation history with background summaries for older messages.
- Persona, tone, and Safe / Balanced / Free response-style controls.
- Nine named TTS choices, device/server fallbacks, custom voice labels, and 0.5x-3.5x speed control.
- PDF, DOCX, XLSX, PPTX, ZIP, text, and source-code uploads with size, timeout, and archive-safety limits.
- Image generation and licensed-image search flows, plus video storyboard and mini-app/game helpers.
- Projects, favorites, conversation branching, smart follow-up suggestions, and message actions.
- Local profiles plus optional Supabase email/password and Google OAuth integration.
- Responsive desktop/mobile UI, including the Studios navigation.

## Architecture

```text
Browser
  cinocode_chat.html
  assets/css/main.css
  assets/js/*.js
        |
        +--> Netlify Functions
        |      +--> chat providers
        |      +--> image providers / image search
        |      +--> web search
        |      +--> Supabase auth configuration
        |
        +--> optional Render TTS service
        +--> optional local Ollama

IndexedDB/localStorage
  conversations, projects, profile, preferences, summaries
```

The browser does not need a bundler or compilation step. Provider secrets belong in the deployment environment and are proxied through serverless functions; they must not be committed or embedded in frontend code.

## Local development

Install the locked dependencies:

```bash
npm ci
```

For the complete app with Netlify Functions and local environment variables:

```bash
npx netlify-cli dev
```

Then open `http://localhost:8888/cinocode_chat.html`.

For UI-only work, the test server can be used without provider calls:

```bash
node tests/e2e/static-server.js
```

Then open `http://127.0.0.1:4173/cinocode_chat.html`.

Environment variable names and deployment-panel setup are documented in [NETLIFY-ENV-KURULUM.md](NETLIFY-ENV-KURULUM.md). A local `.env` is ignored by Git.

## Verification

Run the complete local gate:

```bash
npm run verify
```

Or run each layer separately:

```bash
npm test
npm run check:frontend
npm run check:serverless
npx playwright install chromium
npm run test:e2e
```

The Node suite currently contains 240 deterministic tests. Playwright adds desktop and Pixel 7-sized mobile acceptance coverage for startup, local profiles, new chats, mocked cloud replies, smart titles, settings, all nine voices, TTS speed persistence, Projects, My Apps, supported document inputs, account UI, and Studios navigation. Browser tests fail on uncaught page errors.

GitHub Actions repeats the unit, syntax, security-contract, and Playwright gates on pushes and pull requests.

## External-service acceptance

Automated tests use mocks for paid or rate-limited services. A green test run proves application behavior and request/response contracts; it does not prove that every third-party account currently has credit or authorization.

At the last local service audit:

- Groq chat succeeded with the configured key.
- Gemini chat succeeded after routing was migrated to Gemini 3.5 Flash.
- No image provider was fully live: Runware reported insufficient credit, Fal reported unauthorized, and the legacy Hugging Face inference route reported that its model was deprecated.
- Google OAuth, real voice quality across all nine choices, and production mobile layout still require a human acceptance pass against the deployed environment.

## Known limitations

- Image generation needs at least one funded and authorized provider. The implementation can fall back, but it cannot bypass provider billing or account policy.
- Video Studio currently produces planning/storyboard/slideshow output; it is not connected to a paid generative-video backend.
- CDN-assisted document/Markdown libraries degrade gracefully when unavailable, but their related rich parsing features naturally need those libraries to load.
- Conversation data remains device-local unless a separate cloud-sync layer is implemented; authentication alone does not sync chat history.
- Deployment and pushing are deliberate release actions and are not performed by the test suite.

## Security notes

- Keep secrets in Netlify/Render/Supabase environment settings.
- Configure `CINOCODE_ALLOWED_ORIGINS` for the deployed TTS backend.
- Keep the lockfile committed and review dependency updates.
- Do not treat browser-local provider keys as a production secret-storage mechanism.
