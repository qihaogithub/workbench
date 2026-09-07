# Architecture And Flow

Use this reference first when designing or explaining the DingTalk login chain.

## End-To-End Sequence

1. User reaches a protected route or clicks a login action.
2. React redirects to a local login route, usually `/login`, carrying the intended post-login route as `redirect`.
3. The login route creates a DingTalk OAuth URL with `clientId`, `redirectUri`, `scope`, `prompt`, and a random `state`.
4. The frontend stores `state` and the normalized post-login redirect in session storage.
5. Browser leaves the app and opens DingTalk OAuth.
6. DingTalk redirects back to the configured callback route, usually `/auth/dingtalk/callback`, with `code` or `authCode` and optional `state`.
7. React callback route verifies or tolerates state according to product policy, then calls backend `POST /api/auth/dingtalk/login` with `{ code, state }`.
8. Backend exchanges the code for DingTalk user information, enriches the profile, matches or creates the local user, checks account status, issues local login state, and returns user info.
9. Frontend persists the local authenticated marker or token according to the app's auth policy.
10. Frontend redirects to the saved post-login route or a safe fallback such as `/`.

## Recommended Route Contract

- `GET /login`: frontend route that starts DingTalk login.
- `GET /auth/dingtalk/callback`: frontend callback route that receives DingTalk query params.
- `GET /api/auth/dingtalk/status`: optional backend route for public configuration status, never secrets.
- `POST /api/auth/dingtalk/login`: backend route that accepts `{ code, state? }` and returns local login result.
- `GET /api/auth/me`: backend route that returns the current local user after login.
- `POST /api/auth/logout`: backend route that clears local login state.

Keep the callback route frontend-owned when using a SPA. The backend login endpoint should receive the code from the callback page rather than acting as the browser redirect target, unless the host app intentionally uses server-rendered login.

## State And Redirect Rules

- Generate a high-entropy `state` per login attempt.
- Store the `state` in `sessionStorage`, not long-lived storage.
- Store the intended redirect separately from the OAuth URL.
- Normalize redirect paths before saving or using them.
- Block absolute external redirects such as `http://`, `https://`, and `//` unless the app has an explicit allowlist.
- Remove the stored state and redirect after callback processing.
- Prefer `window.location.replace()` after a successful callback to avoid returning users to a one-time callback page through Back navigation.

## Login Result Shape

A portable login result usually contains:

```json
{
  "token": "optional-local-token",
  "tokenType": "Bearer",
  "user": {
    "id": 1,
    "username": "local-user",
    "displayName": "User Name",
    "role": "USER",
    "status": "ACTIVE"
  },
  "dingtalkProfile": {
    "unionId": "optional",
    "dingtalkUserId": "optional"
  }
}
```

For HttpOnly Cookie auth, the backend can set `Set-Cookie` and redact `token` from the JSON response. The frontend should then persist only an authenticated marker and use `GET /api/auth/me` to recover the current user after reload.

## Backend Responsibilities

- Exchange the authorization code with DingTalk.
- Resolve a profile with stable identifiers, especially `unionId` and `dingtalkUserId`.
- Enrich the profile with organization data when needed.
- Match local users by stable fields in a deterministic order.
- Create or update the local user inside a transaction.
- Check local account status before issuing a token.
- Issue the app's own login state, not a DingTalk access token.
- Return local user info shaped for the frontend.

## Frontend Responsibilities

- Build the DingTalk authorization URL from public config.
- Keep callback URL and redirect path consistent across environments.
- Store and verify OAuth state.
- Call the backend login endpoint from the callback page.
- Persist only local auth state.
- Recover current user via the backend after reload.
- Route unauthenticated users to login with a safe redirect parameter.

## Common Variants

- **Header token auth**: backend returns a token; frontend stores it and sends `Authorization: Bearer ...`.
- **HttpOnly Cookie auth**: backend writes a cookie; frontend uses `withCredentials: true` and stores only a marker.
- **Hybrid migration**: support legacy token storage while moving to cookies; clear old token storage after successful cookie auth.
- **Backend callback**: DingTalk redirects to backend; backend exchanges code and redirects the browser to frontend. Use this only when the deployment and CSRF/open-redirect policy are designed for it.

## Acceptance Checks

- Login URL contains the expected `client_id`, encoded `redirect_uri`, and `state`.
- DingTalk console callback URL exactly matches the deployed callback URL.
- Callback accepts both `code` and `authCode` if the project supports both names.
- Backend rejects empty code.
- Local account status is checked before token issuance.
- Refreshing a protected page after login recovers the current user.
- Logout clears both client marker and backend cookie or token state.
