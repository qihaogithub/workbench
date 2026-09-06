export const LOCAL_CORS_ORIGINS = [
  "http://localhost:4200",
  "http://localhost:4300",
  "http://127.0.0.1:4200",
  "http://127.0.0.1:4300",
] as const;

export const DOCKER_CORS_ORIGINS = [
  "http://localhost:3200",
  "http://localhost:3300",
  "http://127.0.0.1:3200",
  "http://127.0.0.1:3300",
] as const;

export interface CorsConfiguration {
  origins: string[];
  warning?: CorsOriginWarning;
}

export interface CorsOriginWarning {
  expectedProfile: "local" | "docker";
  port: number;
  configuredOrigins: string[];
  conflictingOrigins: string[];
  missingOrigins: string[];
}

export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );
}

function getKnownProfile(port: number): {
  name: "local" | "docker";
  origins: readonly string[];
  oppositeOrigins: readonly string[];
} | null {
  if (port === 4201) {
    return {
      name: "local",
      origins: LOCAL_CORS_ORIGINS,
      oppositeOrigins: DOCKER_CORS_ORIGINS,
    };
  }

  if (port === 3201) {
    return {
      name: "docker",
      origins: DOCKER_CORS_ORIGINS,
      oppositeOrigins: LOCAL_CORS_ORIGINS,
    };
  }

  return null;
}

export function getDefaultCorsOrigins(port: number): string[] {
  return [...(port === 3201 ? DOCKER_CORS_ORIGINS : LOCAL_CORS_ORIGINS)];
}

export function getCorsOriginWarning(
  port: number,
  configuredOrigins: string[],
): CorsOriginWarning | undefined {
  const profile = getKnownProfile(port);
  if (!profile) return undefined;

  const conflictingOrigins = configuredOrigins.filter((origin) =>
    profile.oppositeOrigins.includes(origin),
  );
  const missingOrigins = profile.origins.filter(
    (origin) => !configuredOrigins.includes(origin),
  );

  if (conflictingOrigins.length === 0 || missingOrigins.length === 0) {
    return undefined;
  }

  return {
    expectedProfile: profile.name,
    port,
    configuredOrigins,
    conflictingOrigins,
    missingOrigins,
  };
}

export function resolveCorsConfiguration(options: {
  port: number;
  configuredOrigins?: string;
}): CorsConfiguration {
  const configuredOrigins = parseCorsOrigins(options.configuredOrigins);
  const origins =
    configuredOrigins.length > 0
      ? configuredOrigins
      : getDefaultCorsOrigins(options.port);

  return {
    origins,
    warning: getCorsOriginWarning(options.port, origins),
  };
}

export function formatCorsOriginWarning(warning: CorsOriginWarning): string {
  const expectedPorts =
    warning.expectedProfile === "local" ? "4200/4300" : "3200/3300";
  const conflictingProfile =
    warning.expectedProfile === "local" ? "Docker" : "local";
  return [
    `CORS_ORIGINS appears to use the ${conflictingProfile} sources while agent-service is listening on ${warning.port}.`,
    `Expected ${warning.expectedProfile} sources for this port: ${expectedPorts}.`,
    `Missing expected sources: ${warning.missingOrigins.join(", ")}.`,
    "CORS_ORIGINS remains an explicit allowlist; update the environment and restart agent-service.",
  ].join(" ");
}
