# User Sync And Troubleshooting

Use this reference when defining local account matching, profile updates, department or job-title enrichment, account restrictions, or login-failure diagnosis.

## Identity Matching

Recommended default order:

1. Match by `unionId`.
2. Match by email if the tenant reliably returns verified email.
3. Match by mobile if the tenant reliably returns mobile and the app already treats mobile as unique.
4. Create a new local user.

Do not silently merge two active local accounts unless the product has an explicit account-linking policy. If email or mobile can be reused or stale, prefer manual review over automatic merge.

## Local User Fields

Common local fields:

- `unionId`
- `dingtalkUserId`
- `username`
- `authSource`
- `displayName`
- `email`
- `mobile`
- `avatarUrl`
- `jobTitle`
- `deptId`
- `deptName`
- `workPlace`
- `role`
- `status`
- `active`
- `firstLogin`
- `lastLoginAt`

Keep app-specific fields such as permissions, preferences, submission state, or audit fields under the host app's ownership.

## Create Rules

On first login:

- Apply profile fields from DingTalk.
- Generate username from email, mobile, or stable identifier.
- Set auth source to DingTalk.
- Set default role from app config.
- Set status to active unless the app has an allowlist or approval flow.
- Set first-login flag if onboarding needs it.
- Initialize notification preferences according to product defaults.
- Save within a transaction.

## Update Rules

On repeat login:

- Check whether the local user is allowed to log in before issuing a token.
- Refresh profile fields that DingTalk owns: name, avatar, email, mobile, DingTalk user id, department, title, workplace.
- Preserve local fields that DingTalk omitted.
- Avoid clearing department name when department id is unchanged and the new profile omitted the name.
- Clear department name only when department id changed and no new name can be resolved.
- Update `lastLoginAt`.
- Keep local role and admin flags unless the product explicitly syncs them from DingTalk.

## Department And Job Title Backfill

DingTalk login profile may omit department name or job title. A resilient integration can:

- Use `deptName` directly when present.
- If only `deptId` is present, call organization APIs through `DingtalkApiClient.findDepartmentName(deptId)`.
- If title is missing, call a user-detail endpoint or package helper to fetch title or extension fields.
- Treat organization API failures as non-fatal for login; log a warning and keep existing values.

Do not block login solely because optional organization enrichment failed.

## Account Status

Check local account status at three points:

- Before updating an existing local user from DingTalk.
- Before issuing the local token.
- When loading current user from token or cookie.

Recommended policy:

- `ACTIVE`: login and normal actions allowed.
- `RESTRICTED`: login allowed, selected contribution or write actions blocked according to product rules.
- `INACTIVE` or disabled: login and current-user recovery rejected.

Return user-friendly messages such as `当前账号已禁用` instead of raw exceptions.

## Common Failures

### Login button says DingTalk is not configured

Check:

- `DINGTALK_CLIENT_ID`
- `DINGTALK_CLIENT_SECRET`
- `DINGTALK_REDIRECT_URI`
- Backend status endpoint response
- Whether frontend is calling the intended backend environment

### Callback has no code

Check:

- DingTalk redirected to the expected callback URL.
- The callback route reads both `code` and `authCode` if needed.
- The URL was not stripped by a reverse proxy.
- User did not deny authorization.

### State mismatch

Check:

- The app is not starting login twice.
- React Strict Mode effects are guarded with a ref.
- Callback uses the same origin/session storage as the login route.
- Multiple tabs did not overwrite the one-time state.

Decide whether mismatch should block login or warn and continue. Security-sensitive apps should block.

### Backend code exchange fails

Check:

- `clientId` and `clientSecret` belong to the same DingTalk app.
- `redirectUri` in the OAuth URL matches DingTalk console configuration.
- Code is single-use and not retried after a successful exchange.
- Server clock and outbound network access are healthy.
- Backend logs contain DingTalk error code/message without exposing secrets.

### User is created repeatedly

Check:

- `unionId` is being persisted.
- `findByUnionId` handles blank input and exact matching.
- Email/mobile fallback matching is not bypassed.
- Transactions commit before redirect/current-user fetch.

### Current user fails after successful callback

Check:

- Cookie was written with the expected name, path, domain, SameSite, and Secure attributes.
- Frontend request uses `withCredentials: true` for Cookie auth.
- CORS allows credentials and exact frontend origin.
- JWT secret and expiration match the token issuance and validation paths.
- JSON token redaction did not remove the cookie itself.

### Department or title missing

Check:

- DingTalk app has organization/user-detail permissions.
- `appKey`, `appSecret`, `corpId`, and `agentId` are from the same tenant/app.
- Backfill calls handle API failure without aborting login.
- Existing local department/title fields are preserved when DingTalk omits optional fields.

### Work notice not sent

Check:

- Notice configuration includes app key, app secret, corp id, and positive agent id.
- Local user has `unionId` or a DingTalk user id resolvable from union id.
- Notification preference bridge returns enabled for the notification type.
- Action URL is reachable and, for desktop DingTalk, optionally wrapped to open in system browser.

## Debug Checklist

Collect these facts before changing code:

- Frontend URL and callback URL used in the browser.
- Backend status endpoint response with secrets redacted.
- DingTalk console callback configuration.
- Request payload sent to backend login endpoint, with code/token redacted.
- Backend error message and DingTalk error code if present.
- Whether auth is Header token, HttpOnly Cookie, or hybrid.
- Cookie attributes from browser devtools.
- Local user record fields: id, unionId presence, dingtalkUserId presence, status, role, lastLoginAt.

Never paste real authorization codes, access tokens, secrets, or private tenant ids into shared skill docs.
