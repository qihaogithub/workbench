import { hasAllowedAssetExtension, isAllowedAssetFile, isSpinePackageFilename, MAX_AUDIO_SIZE } from "./asset-validation";

describe("Spine ZIP filename validation", () => {
  it("accepts Flutter's .zip.flutter suffix as a ZIP container", () => {
    const file = { name: "star_second.zip.flutter", type: "application/octet-stream" } as File;

    expect(isSpinePackageFilename(file.name)).toBe(true);
    expect(hasAllowedAssetExtension(file.name)).toBe(true);
    expect(isAllowedAssetFile(file, Buffer.from("PK\\x03\\x04"))).toBe(true);
  });
});

describe("MP3 audio validation", () => {
  it("accepts MP3 files only with the audio/mpeg MIME type", () => {
    expect(hasAllowedAssetExtension("bgm.mp3")).toBe(true);
    expect(isAllowedAssetFile({ name: "bgm.mp3", type: "audio/mpeg" } as File, Buffer.from("ID3"))).toBe(true);
    expect(isAllowedAssetFile({ name: "bgm.mp3", type: "audio/wav" } as File, Buffer.from("RIFF"))).toBe(false);
  });

  it("limits audio files to 1MiB", () => {
    expect(MAX_AUDIO_SIZE).toBe(1 * 1024 * 1024);
  });
});
