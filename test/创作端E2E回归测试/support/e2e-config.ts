export type E2ELoginCredentials = {
  baseURL: string;
  username: string;
  password: string;
};

export const DEFAULT_E2E_BASE_URL = "http://localhost:4200";
export const DEFAULT_E2E_USER = "test";

/**
 * Read the test target without requiring credentials. Keeping this safe at
 * module evaluation time allows Playwright to load and list tests offline.
 */
export function getE2EBaseURL(): string {
  return process.env.E2E_BASE_URL ?? DEFAULT_E2E_BASE_URL;
}

/** Read the non-secret test username. */
export function getE2EUser(): string {
  return process.env.E2E_USER ?? DEFAULT_E2E_USER;
}

export const E2E_BASE_URL = getE2EBaseURL();
export const E2E_USER = getE2EUser();

/**
 * Password validation is intentionally deferred until a test actually needs
 * to authenticate. This keeps `playwright --list` usable without secrets.
 */
export function getE2EPassword(): string {
  const password = process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error(
      "E2E_PASSWORD must be set when executing authenticated E2E tests",
    );
  }
  return password;
}

export function getE2ELoginCredentials(
  baseURL = getE2EBaseURL(),
): E2ELoginCredentials {
  return {
    baseURL,
    username: getE2EUser(),
    password: getE2EPassword(),
  };
}
