import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const valuesPaths = [
  path.join(
    testDirectory,
    "../../../data/workspaces/projects/proj_1785135808250_r4cb4a/live-1785205322879-latagwnoh/demos/闯关活动页-进行中_ec853d/config.values.json",
  ),
  path.join(
    testDirectory,
    "../../../data/projects/proj_1785135808250_r4cb4a/workspace/demos/闯关活动页-进行中_ec853d/config.values.json",
  ),
];

describe("闯关活动页关卡图配置值", () => {
  it.each(valuesPaths)("%s 使用 position 保存关卡坐标，不再写入顶层 x/y", (valuesPath) => {
    const values = JSON.parse(fs.readFileSync(valuesPath, "utf8")) as {
      modules?: Array<{ type?: string; levels?: Array<Record<string, unknown>> }>;
    };
    const levelModule = values.modules?.find((module) => module.type === "level");
    const levels = levelModule?.levels ?? [];
    const positions = levels
      .map((level) => level.position)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

    expect(levels).toHaveLength(3);
    expect(positions).toEqual([
      { x: 14, y: 1 },
      { x: 196, y: 147 },
      { x: 40, y: 316 },
    ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
    expect(levels.every((level) => !("x" in level) && !("y" in level))).toBe(true);
  });
});
