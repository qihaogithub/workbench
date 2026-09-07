# Backend Integration

Use this reference when wiring Spring Boot auth endpoints, DingTalk starter classes, local user sync, token issuance, and Cookie handling.

## Dependencies And Components

A typical Spring Boot integration uses:

- `DingtalkStarterProperties`: configuration properties for login, organization APIs, frontend URL, and controller enablement.
- `DingtalkAuthFacade.login(code)`: orchestration entrypoint that exchanges the code, resolves profile, syncs local user, and returns a login response.
- `DingtalkApiClient`: low-level DingTalk API client.
- `DingtalkUserBridge<TUser>`: host-app account lookup, create, and update adapter.
- `DingtalkTokenBridge<TUser>`: host-app token and login-user response adapter.
- Optional `DingtalkNotifyPreferenceBridge`: host-app notification preference and unionId lookup adapter.

Keep local business rules in the host app's services. The DingTalk starter should call bridges rather than knowing the host app's user table.

## Public Methods To Know

`DingtalkStarterProperties` commonly exposes:

- `getClientId()` / `getClientSecret()` / `getRedirectUri()`
- `getAppKey()` / `getAppSecret()` / `getCorpId()` / `getAgentId()`
- `getFrontendUrl()`
- `isAuthControllerEnabled()`
- `toClientProperties()`

`DingtalkAuthFacade`:

- `login(String code)`: exchange code, resolve profile, bridge local user, issue local token, and return login response.

`DingtalkApiClient`:

- `resolveProfileFromAuthCode(String code)`
- `exchangeUserAccessToken(String code)`
- `getCurrentUser(String accessToken)`
- `enrichProfile(DingtalkProfile profile)`
- `getCorpAccessToken()`
- `findUserIdByUnionId(String unionId)`
- `findDepartmentName(Long deptId)`
- `sendWorkNotice(String unionId, DingtalkWorkNotice notice)`

`DingtalkProfile` fields usually include:

- `unionId`
- `dingtalkUserId`
- `nick`
- `name`
- `mobile`
- `email`
- `avatarUrl`
- `title`
- `deptId`
- `deptName`
- `workPlace`

## Login Endpoint

The backend endpoint should validate input and delegate to the auth facade or an equivalent service:

```java
@RestController
@RequestMapping("/api/auth/dingtalk")
class DingtalkLoginController {
    private final DingtalkAuthFacade authFacade;

    @PostMapping("/login")
    ApiResponse<DingtalkLoginResponse> login(@RequestBody DingtalkLoginRequest request) {
        if (!StringUtils.hasText(request.getCode())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "缺少钉钉授权码");
        }
        return ApiResponse.success("登录成功", authFacade.login(request.getCode()));
    }
}
```

If the starter already provides this controller, prefer enabling and configuring it instead of duplicating the endpoint.

## Status Endpoint

Expose only public, non-secret login status to the frontend:

```java
@GetMapping("/dingtalk/status")
ApiResponse<DingtalkStatusResponse> status() {
    boolean loginConfigured =
        hasText(properties.getClientId()) &&
        hasText(properties.getClientSecret()) &&
        hasText(properties.getRedirectUri());

    return ApiResponse.success("OK", new DingtalkStatusResponse(
        properties.isAuthControllerEnabled(),
        loginConfigured,
        hasText(properties.getAppKey()) && hasText(properties.getAppSecret()),
        properties.getClientId(),
        properties.getRedirectUri(),
        properties.getFrontendUrl(),
        "/api/auth/dingtalk/login"
    ));
}
```

Never return `clientSecret`, `appSecret`, database credentials, or internal tenant secrets.

## User Bridge

Implement `DingtalkUserBridge<TUser>` in the host app service:

```java
@Service
class AppUserDingtalkBridge implements DingtalkUserBridge<AppUser> {
    public Optional<AppUser> findByUnionId(String unionId) { ... }
    public Optional<AppUser> findByEmail(String email) { ... }
    public Optional<AppUser> findByPhone(String phone) { ... }

    @Transactional
    public AppUser createFromDingtalk(DingtalkProfile profile) {
        AppUser user = new AppUser();
        applyProfile(user, profile);
        user.setRole(defaultRole());
        user.setStatus(UserStatus.ACTIVE);
        return repository.save(user);
    }

    @Transactional
    public AppUser updateFromDingtalk(AppUser user, DingtalkProfile profile) {
        ensureLoginAllowed(user);
        applyProfile(user, profile);
        return repository.save(user);
    }
}
```

Recommended matching order:

1. `unionId`
2. email, if the tenant reliably exposes it
3. mobile/phone, if the tenant reliably exposes it
4. create a new account

Only change this order when the host app has a stronger identity model.

## Token Bridge

Implement `DingtalkTokenBridge<TUser>` to issue the app's local login state:

```java
@Service
class AppDingtalkTokenBridge implements DingtalkTokenBridge<AppUser> {
    public String issueToken(AppUser user) {
        ensureLoginAllowed(user);
        return jwtService.issueToken(user.getId());
    }

    public Object buildLoginUserInfo(AppUser user) {
        ensureLoginAllowed(user);
        return currentUserMapper.toResponse(user);
    }
}
```

Do not return DingTalk access tokens as the app session token.

## HttpOnly Cookie Login

If the app uses Cookie auth:

- Intercept successful login responses for `/api/auth/dingtalk/login`.
- Extract the local token from the response body.
- Add `Set-Cookie` with `HttpOnly`, `Path=/`, suitable `SameSite`, and `Secure` in HTTPS environments.
- Redact `token` from the JSON body before returning it.
- Clear the cookie on logout.

Minimal cookie service shape:

```java
ResponseCookie.from(cookieName, token)
    .httpOnly(true)
    .secure(isProductionHttps)
    .sameSite("Lax")
    .path("/")
    .maxAge(Duration.ofSeconds(expirationSeconds))
    .build();
```

Use `SameSite=None; Secure` only when cross-site embedding or cross-site API calls are required and the deployment is HTTPS.

## Security Filter

Permit public auth routes and protect all other app routes:

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/health", "/error").permitAll()
    .requestMatchers("/api/auth/dingtalk/**").permitAll()
    .requestMatchers(HttpMethod.POST, "/api/auth/logout").permitAll()
    .anyRequest().authenticated()
)
```

The JWT filter should read from Cookie, Authorization header, or both according to the app's documented precedence.

## Optional Work Notice Bridge

For DingTalk work notifications, implement:

- `DingtalkNotifyPreferenceBridge.isEnabled(Long userId, String notificationType)`
- `DingtalkNotifyPreferenceBridge.getUnionIdByUserId(Long userId)`

Then call facade methods such as:

- `sendToSystemUser(userId, title, content, notificationType)`
- `sendToSystemUser(userId, title, content, actionUrl, buttonText, notificationType)`
- `sendToUnionId(unionId, title, content, actionUrl, buttonText)`

Check that `appKey`, `appSecret`, `corpId`, and positive `agentId` are configured before sending.

## Tests To Add

- Missing code returns `400`.
- Disabled or inactive local user cannot receive a token.
- Restricted local user follows the host app's policy.
- New DingTalk profile creates a user with default role and active status.
- Existing user updates profile fields without clobbering fields omitted by DingTalk.
- Cookie auth writes `Set-Cookie` and redacts token.
- Non-login responses do not write cookies.
