export type ExternalAuthProvider = "figma" | "dingtalk";

export type ExternalAuthStatus =
  | "connected"
  | "pending"
  | "needs_reauth"
  | "unsupported"
  | "disconnected";

export interface ExternalAuthProviderStatus {
  provider: ExternalAuthProvider;
  status: ExternalAuthStatus;
  accountLabel?: string;
  connectedAt?: number;
  expiresAt?: number;
  message?: string;
}

export interface ExternalAuthStatusResponse {
  providers: ExternalAuthProviderStatus[];
}

export interface ExternalAuthStartResponse {
  provider: ExternalAuthProvider;
  status: ExternalAuthStatus;
  authUrl?: string;
  userCode?: string;
  verificationUrl?: string;
  expiresAt?: number;
  message?: string;
}

export interface ExternalAuthRequiredDetails {
  kind: "external_auth_required";
  provider: ExternalAuthProvider;
  reason: "not_connected" | "expired" | "needs_reauth" | "unsupported";
  title: string;
  message: string;
}

export interface FigmaExternalAuthCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

export interface DingtalkExternalAuthCredential {
  configDir: string;
}

export interface ExternalAuthSessionConfig {
  figma?: {
    enabled: boolean;
    accessToken?: string;
    expiresAt?: number;
    accountLabel?: string;
  };
  dingtalk?: {
    enabled: boolean;
    configDir?: string;
    accountLabel?: string;
  };
}
