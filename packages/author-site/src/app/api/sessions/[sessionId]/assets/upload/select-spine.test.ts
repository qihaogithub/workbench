import fs from "fs";
import os from "os";
import path from "path";
import { selectSpinePackage } from "./extract-spine-package";

function writeFiles(files: Record<string, string>): Record<string, string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spine-select-"));
  const result: Record<string, string> = {};
  for (const name of Object.keys(files)) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, files[name]);
    result[name] = p;
  }
  return result;
}

// 单套标准 Spine 包：骨架 + 图集 + 纹理
const standardFiles = writeFiles({
  "character.skel": "binary",
  "character.atlas": "character.png\n size: 256, 256\n filter: Linear, Linear\n",
  "character.png": "png",
});

// 官方 spineboy 示例 zip 解压后的典型结构：多套导出 + 拆包纹理切片
const spineboyFiles = writeFiles({
  "spineboy-ess.skel": "binary",
  "spineboy-pro.skel": "binary",
  "spineboy.atlas": "spineboy.png\n size: 1024, 256\n filter: Linear, Linear\n",
  "spineboy-pma.atlas": "spineboy-pma.png\n size: 1024, 256\n filter: Linear, Linear\n pma: true\n",
  "spineboy-run.atlas": "spineboy-run.png\n size: 1826, 634\n filter: Linear, Linear\n",
  "spineboy.png": "png",
  "spineboy-pma.png": "png",
  "spineboy-run.png": "png",
  "head.png": "png",
  "torso.png": "png",
  "mouth-grind.png": "png",
});

describe("selectSpinePackage 选择自洽的 Spine 三元组", () => {
  afterAll(() => {
    const dirs = new Set(Object.values(standardFiles).concat(Object.values(spineboyFiles)).map((p) => path.dirname(p)));
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it("标准单包：选择骨架 + 图集引用纹理", () => {
    const sel = selectSpinePackage(standardFiles);
    expect(sel).toEqual({
      skeleton: standardFiles["character.skel"],
      atlas: standardFiles["character.atlas"],
      texture: standardFiles["character.png"],
    });
  });

  it("spineboy 示例：多套导出 + 拆包切片下仍选出自洽三元组", () => {
    const sel = selectSpinePackage(spineboyFiles);
    expect(sel).not.toBeNull();
    // 纹理由图集引用解析，绝不落到拆包切片（如 head.png / mouth-grind.png）
    expect(sel!.texture).toBe(spineboyFiles["spineboy-pma.png"]);
    // 骨架与图集同属 spineboy-pro 导出（基准图集 spineboy 或变体 pma 均可）
    expect(sel!.skeleton).toBe(spineboyFiles["spineboy-pro.skel"]);
    expect(sel!.texture).not.toBe(spineboyFiles["head.png"]);
    expect(sel!.texture).not.toBe(spineboyFiles["mouth-grind.png"]);
  });

  it("骨架以 .skel 优先", () => {
    const files = writeFiles({
      "a.json": "j",
      "a.skel": "b",
      "a.atlas": "a.png\n size: 1, 1\n",
      "a.png": "png",
    });
    const sel = selectSpinePackage(files);
    expect(sel!.skeleton).toBe(files["a.skel"]);
    fs.rmSync(path.dirname(files["a.json"]), { recursive: true, force: true });
  });

  it("图集引用的纹理缺失时不选该包", () => {
    const files = writeFiles({
      "a.skel": "b",
      "a.atlas": "missing.png\n size: 1, 1\n",
      "other.png": "png",
    });
    expect(selectSpinePackage(files)).toBeNull();
    fs.rmSync(path.dirname(files["a.skel"]), { recursive: true, force: true });
  });

  it("缺少骨架或图集时返回 null", () => {
    const onlyPng = writeFiles({ "a.png": "png", "b.png": "png" });
    expect(selectSpinePackage(onlyPng)).toBeNull();
    fs.rmSync(path.dirname(onlyPng["a.png"]), { recursive: true, force: true });

    const missingAtlas = writeFiles({ "a.skel": "b", "a.png": "png" });
    expect(selectSpinePackage(missingAtlas)).toBeNull();
    fs.rmSync(path.dirname(missingAtlas["a.skel"]), { recursive: true, force: true });
  });
});