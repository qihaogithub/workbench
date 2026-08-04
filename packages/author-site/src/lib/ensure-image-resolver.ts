import fsp from "fs/promises";
import path from "path";

const IMAGE_EXT_RE =
  /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'"`\s)]*)?$/i;

function basename(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

export async function readImageUrlMap(
  workspacePath: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const imagesJsonPath = path.join(workspacePath, "..", "images.json");
    const content = await fsp.readFile(imagesJsonPath, "utf-8");
    const data = JSON.parse(content) as {
      images?: Array<{ filename: string; url: string }>;
    };
    for (const img of data.images ?? []) {
      map.set(img.filename, img.url);
      map.set(`assets/images/${img.filename}`, img.url);
    }
  } catch {
    // images.json 不存在或格式错误，返回空 map
  }
  return map;
}

function resolveConfigDataValue(
  value: unknown,
  imageMap: Map<string, string>,
): unknown {
  if (typeof value === "string" && IMAGE_EXT_RE.test(value)) {
    const file = basename(value);
    return imageMap.get(file) || imageMap.get(value) || value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "object" && item !== null
        ? resolveConfigDataRecursive(
            item as Record<string, unknown>,
            imageMap,
          )
        : typeof item === "string" && IMAGE_EXT_RE.test(item)
          ? imageMap.get(basename(item)) || imageMap.get(item) || item
          : item,
    );
  }
  if (typeof value === "object" && value !== null) {
    return resolveConfigDataRecursive(
      value as Record<string, unknown>,
      imageMap,
    );
  }
  return value;
}

function resolveConfigDataRecursive(
  data: Record<string, unknown>,
  imageMap: Map<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = resolveConfigDataValue(value, imageMap);
  }
  return result;
}

export function resolveConfigDataImagePaths(
  configData: Record<string, unknown>,
  imageMap: Map<string, string>,
): Record<string, unknown> {
  if (imageMap.size === 0) return configData;
  return resolveConfigDataRecursive(configData, imageMap);
}

export function resolveCodeImagePaths(
  code: string,
  imageMap: Map<string, string>,
): string {
  if (imageMap.size === 0) return code;

  const stringLiteralRe = /(['"`])(\.\.?\/[^'"`]*)(\1)/g;
  let result = code.replace(
    stringLiteralRe,
    (match, quote, relativePath, endQuote) => {
      if (!IMAGE_EXT_RE.test(relativePath)) return match;
      const file = basename(relativePath);
      const resolved = imageMap.get(file) || imageMap.get(relativePath);
      return resolved ? quote + resolved + endQuote : match;
    },
  );

  const cssUrlRe = /url\((['"]?)(\.\.?\/[^'"`)]*)(\1)\)/g;
  result = result.replace(
    cssUrlRe,
    (match, quote, relativePath, endQuote) => {
      if (!IMAGE_EXT_RE.test(relativePath)) return match;
      const file = basename(relativePath);
      const resolved = imageMap.get(file) || imageMap.get(relativePath);
      return resolved ? `url(${quote}${resolved}${endQuote})` : match;
    },
  );

  return result;
}