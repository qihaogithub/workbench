export type RuntimeProfile = "local" | "docker";

export type RuntimeService =
  | "author"
  | "agent"
  | "screenshot"
  | "knowledge"
  | "viewer"
  | "sketch";

export interface RuntimeTopology {
  readonly author: number;
  readonly agent: number;
  readonly screenshot: number;
  readonly knowledge: number;
  readonly viewer: number;
  readonly sketch?: number;
}

export const DEFAULT_CDN_BASE_URL = "https://esm.sh";

export const WORKBENCH_TOPOLOGY: Readonly<
  Record<RuntimeProfile, RuntimeTopology>
> = {
  local: {
    author: 4200,
    agent: 4201,
    screenshot: 4202,
    knowledge: 4203,
    viewer: 4300,
    sketch: 3400,
  },
  docker: {
    author: 3200,
    agent: 3201,
    screenshot: 3202,
    knowledge: 3203,
    viewer: 3300,
  },
};

export function getRuntimeTopology(
  profile: RuntimeProfile = "local",
): RuntimeTopology {
  return WORKBENCH_TOPOLOGY[profile];
}

export function getServicePort(
  profile: RuntimeProfile,
  service: RuntimeService,
): number {
  const port = getRuntimeTopology(profile)[service];
  if (port === undefined) {
    throw new Error(
      `Service "${service}" is not available in the "${profile}" runtime profile`,
    );
  }
  return port;
}

export interface ServiceUrlOptions {
  readonly hostname?: string;
  readonly protocol?: "http" | "https";
  readonly pathname?: string;
}

export function getServiceUrl(
  profile: RuntimeProfile,
  service: RuntimeService,
  options: ServiceUrlOptions = {},
): string {
  const protocol = options.protocol ?? "http";
  const hostname = options.hostname ?? "localhost";
  const pathname = options.pathname
    ? `/${options.pathname.replace(/^\/+/, "")}`
    : "";

  return `${protocol}://${hostname}:${getServicePort(profile, service)}${pathname}`;
}

export function getLocalhostUrl(
  profile: RuntimeProfile,
  service: RuntimeService,
  pathname?: string,
): string {
  return getServiceUrl(profile, service, { pathname });
}
