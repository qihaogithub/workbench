import { describe, expect, it } from "vitest";
import {
  createWorkbenchTools,
  formatCapabilityDirectory,
  getInitialActiveToolNames,
  resolveCapabilityToolNames,
} from "../../src/backends/pi-tools";

describe("on-demand tool activation", () => {
  const tools = createWorkbenchTools({ sessionId: "capability-test" });

  it("starts with a compact discovery set while retaining all tool definitions server-side", () => {
    const initial = getInitialActiveToolNames(tools);

    expect(tools.map((tool) => tool.name)).toContain("deletePages");
    expect(tools.map((tool) => tool.name)).toContain("transferPages");
    expect(initial).toContain("activateCapabilities");
    expect(initial).toContain("readPreinstalledSkill");
    expect(initial).toContain("readProjectReference");
    expect(initial).not.toContain("deletePages");
    expect(initial).not.toContain("transferPages");
    expect(initial).not.toContain("figmaMcp");
  });

  it("does not expose author reference reads or image generation in viewer mode", () => {
    const names = createWorkbenchTools({ sessionId: "viewer" }, undefined, {
      mode: "viewer-readonly",
    }).map((tool) => tool.name);
    expect(names).not.toContain("readProjectReference");
    expect(names).not.toContain("generateReferenceImage");
  });

  it("activates requested task capabilities without narrowing the available server toolset", () => {
    const names = resolveCapabilityToolNames(tools, ["workspace", "pages"]);

    expect(names).toContain("writeFile");
    expect(names).toContain("deletePages");
    expect(names).toContain("transferPages");
    expect(names).toContain("activateCapabilities");
    expect(names).toContain("readProjectReference");
    expect(tools.map((tool) => tool.name)).toContain("figmaMcp");
  });

  it("allows the agent to load every registered capability when the task spans areas", () => {
    const names = resolveCapabilityToolNames(tools, ["all"]);

    expect(names).toEqual(tools.map((tool) => tool.name));
  });

  it("describes autonomous loading instead of asking the user to authorize a profile", () => {
    const directory = formatCapabilityDirectory();

    expect(directory).toContain("activateCapabilities");
    expect(directory).toContain("不向用户索取授权");
    expect(directory).not.toContain("档案");
  });

  it("loads capabilities through the agent tool without a user approval callback", async () => {
    const activate = createWorkbenchTools(
      { sessionId: "capability-test" },
      undefined,
      { capabilityActivationHandler: async () => ["writeFile", "editFile"] },
    ).find((tool) => tool.name === "activateCapabilities");

    const result = await activate!.execute("call-1", {
      capabilities: ["workspace"],
      reason: "Need to update the requested page files.",
    });

    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({
      toolNames: ["writeFile", "editFile"],
    });
  });
});
