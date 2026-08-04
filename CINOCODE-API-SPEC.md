# CinoCode API Specification

## Document Control

- **Status:** Proposed compatibility baseline v0.1
- **Date:** 2026-08-04
- **Scope:** Existing CinoCode HTTP API plus required platform compatibility behavior
- **Format:** JSON over HTTPS

## 1. Compatibility Policy

The current API surface is the behavioral baseline. Cino AI Platform MAY implement these operations behind an adapter, but CinoCode callers MUST continue to observe compatible requests, status codes, and response fields until a versioned migration is approved.

Current production-compatible routes use:

- `/.netlify/functions/{operation}`
- `/api/{operation}` through deployment rewrites/adapters

The physical Cino AI Platform base URL and versioned route structure are **TBD**.

## 2. Common Protocol

### Request Headers

```http
Content-Type: application/json
```

Protected operations require one of:

```http
Authorization: Bearer <supabase-access-token>
```

or:

```http
X-CinoCode-Guest-Token: <signed-guest-token>
X-CinoCode-Device-Id: <device-id>
```

### Common Success Shape

Successful JSON operations include:

```json
{
  "ok": true
}
```

Operation-specific fields are added to this object.

### Common Error Shape

Most operations use:

```json
{
  "ok": false,
  "error": "machine_code_or_message",
  "message": "optional user-readable message",
  "details": {}
}
```

Legacy chat errors use a user-readable `error` string and structured `details.status`. Callers MUST tolerate both legacy and normalized error forms during migration.

### Shared Security Errors

| HTTP | `error` | Meaning |
|---|---|---|
| 403 | `origin_not_allowed` | Origin is not allowed |
| 413 | `request_too_large` | Request body exceeds endpoint limit |
| 429 | `rate_limited` | Per-instance/IP rate limit exceeded |
| 401 | `invalid_access_token` | Supabase bearer token is invalid |
| 401 | `guest_session_required` | Guest headers are missing or invalid |
| 401 | `guest_identity_unavailable` | Guest IP/device identity cannot be established |
| 429 | `daily_quota_exceeded` | Daily usage quota exhausted |
| 503 | `access_control_not_configured` | Access-control environment is incomplete |
| 503 | `quota_service_unavailable` | Quota could not be consumed; provider call is not made |

## 3. POST `/ai-chat`

### Legacy Routes

- `POST /.netlify/functions/ai-chat`
- `POST /api/ai-chat`

### Protection

Authenticated or guest session required. Quota kind: `chat`.

### Request Limits

- Body: 6 MiB
- Rate: 60 requests per 60 seconds per resolved client IP and function instance
- Total function execution budget: 55 seconds

### Request

```json
{
  "taskType": "chat",
  "messages": [
    {
      "role": "system",
      "content": "System instruction"
    },
    {
      "role": "user",
      "content": "User message",
      "images": ["data:image/jpeg;base64,..."]
    }
  ],
  "selectedModel": "groq",
  "temperature": 0.7,
  "maxTokens": 1024
}
```

### Fields

| Field | Type | Required | Current behavior |
|---|---|---|---|
| `taskType` | string | No | `pdf`, `vision`, otherwise normalized to `chat` |
| `messages` | array | Yes | Empty arrays rejected; system messages preserved; non-system history bounded |
| `messages[].role` | string | No | Defaults to `user` |
| `messages[].content` | string | No | Coerced to string and length bounded by task |
| `messages[].images` | string[] | No | Up to 20 image values retained |
| `selectedModel` | string | No | Provider alias or provider-suffixed model label |
| `temperature` | number | No | Defaults to `0.7` |
| `maxTokens` | number | No | Defaults to `1024` |

### Success `200`

```json
{
  "ok": true,
  "provider": "groq",
  "model": "resolved-model-id",
  "content": "Assistant response"
}
```

### Operation Errors

- `400`: invalid JSON or empty messages
- `503`: no configured provider
- `502`: all configured providers failed
- Shared access-control and security errors

### Streaming

The current serverless `ai-chat` operation returns a complete JSON response. Browser direct-provider paths currently parse provider streams. A platform streaming operation is **TBD** and MUST be specified before those paths are replaced.

## 4. POST `/generate-image`

### Legacy Routes

- `POST /.netlify/functions/generate-image`
- `POST /api/generate-image`

### Protection

Authenticated or guest session required. Quota kind: `image`.

### Request Limits

- Body: 64 KiB
- Rate: 15 requests per 60 seconds
- Prompt: 1–8000 characters
- Width/height: normalized to 256–2048 pixels

### Request

```json
{
  "prompt": "Image description",
  "width": 1024,
  "height": 1024,
  "forceProvider": "openai"
}
```

`forceProvider` is optional legacy diagnostic/selection behavior and MUST NOT be exposed as an unrestricted platform capability without approval.

### Success `200`

```json
{
  "ok": true,
  "provider": "openai",
  "images": ["https://example.com/generated-image.png"],
  "attempts": []
}
```

### Operation Errors

- `400 bad_json`
- `400 missing_prompt`
- `400 image_prompt_not_allowed`
- `400 unknown_provider`
- `413 prompt_too_long`
- `502 missing_env`
- `502 all_providers_failed`
- Shared access-control and security errors

## 5. POST `/image-search`

### Legacy Routes

- `POST /.netlify/functions/image-search`
- `POST /api/image-search`

### Protection

Origin/body/rate guards apply. No chat/image quota is currently consumed.

### Request Limits

- Body: 16 KiB
- Rate: 30 requests per 60 seconds
- Raw query: maximum 200 characters

### Request

```json
{
  "query": "Istanbul skyline"
}
```

### Success `200`

```json
{
  "ok": true,
  "query": "Istanbul skyline",
  "source": "Openverse",
  "images": [
    {
      "id": "source-id",
      "title": "Image title",
      "thumbnail": "https://...",
      "imageUrl": "https://...",
      "landingUrl": "https://...",
      "creator": "Creator",
      "creatorUrl": "https://...",
      "license": "cc-by",
      "licenseUrl": "https://...",
      "attribution": "Attribution text",
      "width": 1200,
      "height": 800,
      "source": "Openverse"
    }
  ]
}
```

If provider results exist but all are rejected by safety filters, `status` is `no_safe_results` and `images` is empty.

### Operation Errors

- `400 bad_json`
- `400 missing_query`
- `400 unsafe_query`
- `413 query_too_long`
- `500 runtime_fetch_missing`
- `502 rate_limited`, `provider_error`, `timeout`, or `network_error`

## 6. POST `/web-search`

### Legacy Routes

- `POST /.netlify/functions/web-search`
- `POST /api/web-search`

### Request Limits

- Body: 16 KiB
- Rate: 30 requests per 60 seconds
- Query: maximum 500 characters

### Request

```json
{
  "query": "search terms"
}
```

### Success `200`

```json
{
  "ok": true,
  "query": "search terms",
  "results": [
    {
      "title": "Result title",
      "url": "https://example.com",
      "snippet": "Result snippet"
    }
  ]
}
```

### Operation Errors

- `400 bad_json`
- `400 missing_query`
- `413 query_too_long`
- `502 provider_error`, `timeout`, or `network_error`

## 7. POST `/guest-session`

### Legacy Routes

- `POST /.netlify/functions/guest-session`
- `POST /api/guest-session`

### Request Limits

- Body: 8 KiB
- Rate: 10 requests per 60 seconds

### Request

```json
{
  "turnstileToken": "turnstile-token",
  "deviceId": "client-generated-device-id"
}
```

Trusted `netlify dev` loopback requests MAY use the existing local bypass marker. Production MUST verify Turnstile action `cinocode-guest`.

### Success `200`

```json
{
  "ok": true,
  "guestToken": "signed-token",
  "expiresIn": 43200
}
```

`expiresIn` is defined by the current server configuration and MUST be treated as authoritative by the client.

### Operation Errors

- `400 invalid_json`
- `400 invalid_guest_request`
- `401 turnstile_verification_failed`
- `429` guest abuse/rate-limit response
- `500 guest_token_failed`
- `503 guest_access_not_configured`
- `503 turnstile_unavailable`

## 8. POST `/auth-config`

### Legacy Routes

- `POST /.netlify/functions/auth-config`
- `POST /api/auth-config`

### Request Limits

- Body: 2 KiB
- Rate: 60 requests per 60 seconds

### Request

No request fields are required.

### Success `200`

```json
{
  "ok": true,
  "configured": true,
  "supabaseUrl": "https://project.supabase.co",
  "publishableKey": "public-key",
  "guestAccessConfigured": true,
  "turnstileSiteKey": "public-site-key",
  "isLocalDev": false,
  "missing": []
}
```

Only public client configuration may be returned.

## 9. Target Platform Operations

The platform MUST eventually provide compatibility for these logical operations:

- Generate chat completion
- Stream chat completion
- Generate image
- Search web
- Search licensed images
- Discover approved model/provider capabilities

Physical routes, version identifiers, idempotency semantics, correlation headers, stream events, and capability schemas remain **TBD**. They require approval before implementation.

## 10. Versioning and Deprecation

- Existing routes are currently unversioned legacy compatibility routes.
- A future platform API MUST use an explicit versioning strategy.
- Deprecation MUST include an adapter window, telemetry or equivalent usage evidence, rollback instructions, and an approved removal date.
