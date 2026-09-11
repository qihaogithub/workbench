export const DEFAULT_E2E_BASE_URL = "http://localhost:4200";
export const DEFAULT_E2E_USER = "test";

export function getE2EBaseURL(...legacyEnvNames) {
  return (
    process.env.E2E_BASE_URL ??
    legacyEnvNames.map((name) => process.env[name]).find(Boolean) ??
    DEFAULT_E2E_BASE_URL
  );
}

export function getE2EUser(...legacyEnvNames) {
  return (
    process.env.E2E_USER ??
    legacyEnvNames.map((name) => process.env[name]).find(Boolean) ??
    DEFAULT_E2E_USER
  );
}

export function getE2EPassword(...legacyEnvNames) {
  const password =
    process.env.E2E_PASSWORD ??
    legacyEnvNames.map((name) => process.env[name]).find(Boolean);
  if (!password) {
    throw new Error(
      "E2E_PASSWORD must be set when executing authenticated E2E scripts",
    );
  }
  return password;
}
