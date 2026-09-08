# Frontend Integration

Use this reference when implementing React routes, login URL generation, callback handling, and frontend auth state.

## DingtalkAuthClient Surface

A reusable frontend package can expose:

```ts
type DingtalkLoginPayload = {
  code: string;
  state?: string;
};

type DingtalkAuthResult<TUser = unknown> = {
  token?: string | null;
  tokenType?: string | null;
  user: TUser;
  dingtalkProfile?: unknown;
};

type DingtalkAuthClientOptions<TUser = unknown> = {
  clientId: string;
  corpId?: string;
  redirectUri?: string | (() => string);
  oauth2Url?: string;
  scope?: string;
  prompt?: string;
  loginApi: (payload: DingtalkLoginPayload) => Promise<DingtalkAuthResult<TUser>>;
  onLoginSuccess: (result: DingtalkAuthResult<TUser>) => void | Promise<void>;
  onLoginError?: (error: Error) => void | Promise<void>;
  resolveSuccessRedirect?: (result: DingtalkAuthResult<TUser>) => string | undefined | null;
  fallbackRedirectPath?: string;
  stateStorageKey?: string;
  redirectStorageKey?: string;
  blockedRedirectPrefixes?: string[];
};
```

Important methods and helpers:

- `new DingtalkAuthClient(options)`: holds public OAuth config and app callbacks.
- `beginLogin({ redirectPath })`: stores state and redirect path, returns the DingTalk OAuth URL.
- `handleCallback(searchParams)`: reads code/state from callback params, calls `loginApi`, runs success/error hooks, and returns the final redirect path.
- `createDingtalkLoginUrl(...)`: low-level URL builder for projects that do not use a client class.
- `getDefaultRedirectUri(callbackPath?)`: derives the callback URL from `window.location.origin`.
- Default storage keys can be `dingtalk_state` and `post_login_redirect`.

## Login Route Pattern

The login route should do one thing: start OAuth and render a loading state while navigating away.

```tsx
function DingtalkLoginRoute({ client }: { client: DingtalkAuthClient<CurrentUser> }) {
  const location = useLocation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const redirect = new URLSearchParams(location.search).get('redirect');
    const fallback = `${location.pathname}${location.search}${location.hash}`;
    window.location.href = client.beginLogin({ redirectPath: redirect || fallback });
  }, [client, location]);

  return <FullScreenLoading text="正在打开钉钉登录..." />;
}
```

If the current route is already `/login`, avoid saving `/login` as the post-login target. Normalize to `/` or the protected route captured by the route guard.

## Callback Route Pattern

The callback route should accept both parameter names when the app needs compatibility:

```tsx
function DingtalkCallbackRoute({ onLoginSuccess }: Props) {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    async function run() {
      try {
        const code = searchParams.get('code') || searchParams.get('authCode');
        const state = searchParams.get('state') || undefined;
        if (!code) throw new Error('未获取到钉钉授权码，请重新登录');

        const result = await postDingtalkLogin({ code, state });
        await onLoginSuccess(result);
        window.location.replace(readAndClearSafeRedirect() || '/');
      } catch (err) {
        setError(err instanceof Error ? err.message : '登录失败，请重试');
      }
    }

    void run();
  }, [onLoginSuccess, searchParams]);

  return error ? <LoginError message={error} /> : <FullScreenLoading text="正在完成登录..." />;
}
```

Use a ref guard if React Strict Mode could invoke effects twice in development.

## Auth Client Creation

Create the client only after public DingTalk login status/config is known:

```ts
const client = new DingtalkAuthClient<CurrentUser>({
  clientId: status.clientId,
  redirectUri: status.redirectUri,
  loginApi: async ({ code, state }) => {
    const response = await api.post('/api/auth/dingtalk/login', { code, state });
    return response.data.data;
  },
  onLoginSuccess: persistLoginResult,
  fallbackRedirectPath: '/',
  blockedRedirectPrefixes: ['http://', 'https://', '//']
});
```

When the backend uses HttpOnly cookies and redacts the token, normalize the result so the client class still sees a valid local auth result:

```ts
async function postDingtalkCookieLogin(payload: { code: string; state?: string }) {
  const result = await postDingtalkLogin(payload);
  return {
    ...result,
    token: result.token ?? '',
    tokenType: result.tokenType ?? 'Cookie'
  };
}
```

## Storage Policy

- Use `sessionStorage` for one-time OAuth state and redirect path.
- Use `localStorage` only for non-secret auth markers or legacy token migration.
- Do not store DingTalk access tokens in browser storage.
- If using HttpOnly cookies, the frontend stores a marker such as `{ authenticated: true, updatedAt }` and recovers the user through `GET /api/auth/me`.
- Clear legacy token keys after moving to Cookie auth.

## Axios Or Fetch Setup

For Cookie auth:

```ts
const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  timeout: 15000
});
```

For Bearer token auth:

```ts
api.interceptors.request.use((config) => {
  const token = readLocalToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Do not enable both without a migration reason. If both are supported, document precedence.

## Route Guard

- If no local auth marker exists, redirect to `/login?redirect=<current-path>`.
- If a marker exists but current user is missing, call `GET /api/auth/me`.
- If backend returns an expired or disabled-account message, clear local state and route to login or home.
- Avoid infinite loops by excluding `/login`, callback routes, and logout routes from redirect targets.

## UI States

Provide distinct states for:

- Loading public DingTalk status.
- DingTalk login not configured.
- Frontend auth package failed to load.
- Callback processing.
- Callback failed and user can retry.

Avoid showing secrets or raw backend stack traces in login errors.
