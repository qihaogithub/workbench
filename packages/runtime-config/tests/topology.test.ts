import {
  DEFAULT_CDN_BASE_URL,
  WORKBENCH_TOPOLOGY,
  getLocalhostUrl,
  getServicePort,
  getServiceUrl,
} from "../src/topology.js";

describe("runtime topology", () => {
  it("contains the local and docker service ports", () => {
    expect(WORKBENCH_TOPOLOGY).toEqual({
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
    });
    expect(DEFAULT_CDN_BASE_URL).toBe("https://esm.sh");
  });

  it("builds service URLs and rejects unavailable services", () => {
    expect(getServicePort("local", "author")).toBe(4200);
    expect(getLocalhostUrl("docker", "knowledge", "/health")).toBe(
      "http://localhost:3203/health",
    );
    expect(getServiceUrl("local", "viewer", {
      hostname: "viewer.internal",
      protocol: "https",
      pathname: "api/status",
    })).toBe("https://viewer.internal:4300/api/status");
    expect(() => getServicePort("docker", "sketch")).toThrow(
      /not available/,
    );
  });
});
