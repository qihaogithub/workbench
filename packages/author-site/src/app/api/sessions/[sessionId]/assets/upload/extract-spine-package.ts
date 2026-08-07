import fs from "fs";
import path from "path";

export const ANIMATION_ASSET_EXTS = new Set([".json", ".skel", ".atlas", ".png"]);

function fileStem(filename: string): string {
  return path.basename(filename).replace(/\.[^.]+$/, "");
}

// 解析 .atlas 声明的第一张纹理名（图集第一页首行）。多页图集仅取首张，
// 与渲染端 SpinePlayer 单纹理加载契约一致。
export function parseAtlasPrimaryTexture(atlasText: string): string | null {
  const pages = atlasText.split(/\r?\n\s*\r?\n/);
  for (const page of pages) {
    const firstLine = page
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (firstLine) return firstLine;
  }
  return null;
}

// 图集与骨架的匹配度：共同前缀越长越好；图集名是骨架名的前缀时视为基准图集（如 spineboy.atlas 之于 spineboy-pro），优先于带变体后缀的图集；再以更短图集名兜底。
function atlasMatchScore(skeletonStem: string, atlasStem: string): [number, number, number] {
  let i = 0;
  const minLen = Math.min(skeletonStem.length, atlasStem.length);
  while (i < minLen && skeletonStem[i] === atlasStem[i]) i++;
  const atlasIsPrefix = atlasStem === skeletonStem.slice(0, atlasStem.length);
  return [i, atlasIsPrefix ? 1 : 0, -atlasStem.length];
}

function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// 从解压出的文件集合里选择一套自洽的 Spine 三元组（骨架 + 图集 + 纹理）。
// 处理 zip 内混入多套导出或拆包纹理切片（如官方 spineboy 示例）的情况：
// 不再贪心取"最后一个"，而是按图集引用的纹理解析 + 骨架前缀匹配兜底。
export function selectSpinePackage(
  files: Record<string, string>,
): { skeleton: string; atlas: string; texture: string } | null {
  const allNames = Object.keys(files);
  const skelNames = allNames.filter((f) => f.toLowerCase().endsWith(".skel"));
  const jsonNames = allNames.filter((f) => f.toLowerCase().endsWith(".json"));
  const skeletonNames = skelNames.length > 0 ? skelNames : jsonNames;
  const atlasNames = allNames.filter((f) => f.toLowerCase().endsWith(".atlas"));
  if (skeletonNames.length === 0 || atlasNames.length === 0) return null;

  let best: { skeleton: string; atlas: string; texture: string } | null = null;
  let bestScore: number[] | null = null;

  for (const skeletonName of skeletonNames) {
    const skeletonStem = fileStem(skeletonName);
    for (const atlasName of atlasNames) {
      // 图集引用纹理必须已解压，否则这套包不可用
      const atlasText = fs.readFileSync(files[atlasName], "utf8");
      const textureName = parseAtlasPrimaryTexture(atlasText);
      const texturePath = textureName ? files[textureName.toLowerCase()] : undefined;
      if (!texturePath) continue;

      const a = atlasMatchScore(skeletonStem, fileStem(atlasName).toLowerCase());
      // 图集匹配 > 骨架 .skel 优先 > 骨架文件名更长（更完整）> 骨架字典序稳定
      const score: number[] = [
        a[0],
        a[1],
        a[2],
        skelNames.length > 0 && skeletonName.toLowerCase().endsWith(".skel") ? 1 : 0,
        -skeletonStem.length,
      ];
      if (!bestScore || cmpTuple(score, bestScore) > 0) {
        bestScore = score;
        best = { skeleton: files[skeletonName], atlas: files[atlasName], texture: texturePath };
      }
    }
  }

  return best;
}