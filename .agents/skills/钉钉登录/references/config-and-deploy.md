# Config And Deploy

Use this reference when setting environment variables, Docker, reverse proxy, CORS, Cookie policy, or DingTalk console callback values.

## Environment Keys

Use placeholders in documentation and examples:

```properties
DINGTALK_CLIENT_ID=<oauth-client-id>
DINGTALK_CLIENT_SECRET=<oauth-client-secret>
DINGTALK_REDIRECT_URI=https://example.com/auth/dingtalk/callback
DINGTALK_APP_KEY=<internal-app-key>
DINGTALK_APP_SECRET=<internal-app-secret>
DINGTALK_CORP_ID=<corp-id>
DINGTALK_AGENT_ID=<agent-id>
DINGTALK_FRONTEND_URL=https://example.com
DINGTALK_AUTH_CONTROLLER_ENABLED=true
APP_AUTH_JWT_SECRET=<long-random-secret>
APP_AUTH_JWT_COOKIE_NAME=<cookie-name>
APP_AUTH_JWT_COOKIE_SECURE=true
APP_AUTH_JWT_COOKIE_SAME_SITE=Lax
APP_CORS_ALLOWED_ORIGINS=https://example.com
```

Do not include real values in commits, docs, issue comments, screenshots, or generated skills.

## Spring Boot Mapping

A generic `application.yml` mapping can look like:

```yaml
dingtalk:
  client-id: ${DINGTALK_CLIENT_ID:}
  client-secret: ${DINGTALK_CLIENT_SECRET:}
  redirect-uri: ${DINGTALK_REDIRECT_URI:}
  app-key: ${DINGTALK_APP_KEY:}
  app-secret: ${DINGTALK_APP_SECRET:}
  corp-id: ${DINGTALK_CORP_ID:}
  agent-id: ${DINGTALK_AGENT_ID:0}
  frontend-url: ${DINGTALK_FRONTEND_URL:http://localhost:5173}
  auth-controller-enabled: ${DINGTALK_AUTH_CONTROLLER_ENABLED:true}
```

Keep defaults empty for secrets. It is acceptable for local development examples to use placeholder values, but not tenant secrets.

## Frontend Public Config

The frontend may need only public values:

- OAuth client id or app id.
- Callback URL if it cannot derive it from `window.location.origin`.
- Optional corp id if the OAuth URL builder supports it.
- Backend API base URL.

Do not expose `clientSecret`, `appSecret`, or backend JWT secret to frontend code.

## DingTalk Console Checklist

Verify in the DingTalk developer console:

- OAuth or login app is enabled.
- Callback domain and exact callback URL match the deployed app.
- The app has permissions needed for profile, user id, department, and work notice calls.
- The app is published or visible to the intended organization/users.
- `agentId` belongs to the same app/corp context as `appKey` and `appSecret`.
- The environment being tested uses the same callback URL configured in DingTalk.

Callback mismatches are one of the most common causes of login failure.

## Docker Compose

Pass environment variables explicitly:

```yaml
services:
  backend:
    environment:
      DINGTALK_CLIENT_ID: ${DINGTALK_CLIENT_ID}
      DINGTALK_CLIENT_SECRET: ${DINGTALK_CLIENT_SECRET}
      DINGTALK_REDIRECT_URI: ${DINGTALK_REDIRECT_URI}
      DINGTALK_APP_KEY: ${DINGTALK_APP_KEY:-}
      DINGTALK_APP_SECRET: ${DINGTALK_APP_SECRET:-}
      DINGTALK_CORP_ID: ${DINGTALK_CORP_ID:-}
      DINGTALK_AGENT_ID: ${DINGTALK_AGENT_ID:-0}
      DINGTALK_FRONTEND_URL: ${DINGTALK_FRONTEND_URL:-http://localhost:5173}
      DINGTALK_AUTH_CONTROLLER_ENABLED: ${DINGTALK_AUTH_CONTROLLER_ENABLED:-true}
```

Prefer `.env.example` files with placeholders and a separate private `.env` ignored by git.

## Reverse Proxy

For a SPA deployment:

- Serve frontend routes including `/login` and `/auth/dingtalk/callback` through the frontend app.
- Proxy `/api/` to backend.
- Preserve `Host`, `X-Forwarded-Proto`, and `X-Forwarded-Host` if the backend derives absolute URLs.
- Ensure HTTPS is terminated before Cookie `Secure` is required.
- If frontend and backend are on different origins, configure CORS credentials and Cookie attributes deliberately.

## CORS And Credentials

For Cookie auth with a separate frontend origin:

- Backend CORS must set the exact allowed origin, not `*`.
- `Access-Control-Allow-Credentials` must be true.
- Frontend Axios/fetch must enable credentials.
- Cookie `SameSite=None; Secure` may be required for truly cross-site requests.

For same-origin reverse-proxy deployments, `SameSite=Lax` is often simpler and safer.

## Local Development

Local callback options:

- `http://localhost:5173/auth/dingtalk/callback` for Vite direct frontend.
- `http://localhost/auth/dingtalk/callback` for local reverse proxy.
- `http://<lan-ip>:<port>/auth/dingtalk/callback` when DingTalk on a mobile device must reach the developer machine.

The callback URL used by the OAuth request must match the URL registered in DingTalk. If a mobile device cannot reach `localhost`, use a LAN IP, tunnel, or deployed test domain.

## Production Safety

- Use a strong random JWT secret.
- Set Cookie `Secure=true` under HTTPS.
- Avoid logging request bodies containing auth codes or tokens.
- Avoid returning stack traces to the login page.
- Rotate secrets if they were committed or shared.
- Keep environment examples scrubbed before sharing.

## Preflight Endpoint

A public status endpoint can help frontend show better states. Return only booleans and public fields:

```json
{
  "authControllerEnabled": true,
  "loginConfigured": true,
  "noticeConfigured": false,
  "clientId": "<public-client-id>",
  "redirectUri": "https://example.com/auth/dingtalk/callback",
  "frontendUrl": "https://example.com",
  "loginEndpoint": "/api/auth/dingtalk/login"
}
```

Do not include any secret.
