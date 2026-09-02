import { hasAllowedAssetExtension, isAllowedAssetFile, isSpinePackageFilename } from "./asset-validation";

describe("Spine ZIP filename validation", () => {
  it("accepts Flutter's .zip.flutter suffix as a ZIP container", () => {
    const file = { name: "star_second.zip.flutter", type: "application/octet-stream" } as File;

    expect(isSpinePackageFilename(file.name)).toBe(true);
    expect(hasAllowedAssetExtension(file.name)).toBe(true);
    expect(isAllowedAssetFile(file, Buffer.from("PK\\x03\\x04"))).toBe(true);
  });
});
