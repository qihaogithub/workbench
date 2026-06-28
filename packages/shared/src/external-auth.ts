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

export interface DingtalkEnterpriseIdentity {
  corpId: string;
  userId: string;
  unionId?: string;
  name?: string;
  avatar?: string;
  lastLoginAt?: number;
}

export type ExternalDocumentProvider = "dingtalk";

export type ExternalDocumentSyncMode = "snapshot" | "manual" | "auto";

export type ExternalDocumentSyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "failed"
  | "needs_auth";

export interface ExternalDocumentReference {
  provider: ExternalDocumentProvider;
  sourceUrl: string;
  corpId?: string;
  documentId?: string;
  spaceId?: string;
  nodeId?: string;
  dentryId?: string;
  title?: string;
}

export interface ExternalDocumentSnapshot {
  reference: ExternalDocumentReference;
  syncMode: ExternalDocumentSyncMode;
  syncStatus: ExternalDocumentSyncStatus;
  markdown?: string;
  lastSyncedAt?: number;
  message?: string;
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
