jest.mock("fs", () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock("@/lib/fs-utils", () => ({
  getSessionWorkspacePath: jest.fn(),
  getSessionMeta: jest.fn(),
}));
jest.mock("@/lib/project-images", () => ({ getProjectImages: jest.fn(() => []) }));
jest.mock("@/lib/image-store", () => ({ getImage: jest.fn() }));

import * as fs from "fs";
import { getSessionWorkspacePath } from "@/lib/fs-utils";
import { GET } from "./route";

describe("session workspace static resources", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getSessionWorkspacePath).mockReturnValue("/tmp/workspace-1");
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, size: 3 } as fs.Stats);
    jest.mocked(fs.readFileSync).mockReturnValue(Buffer.from([1, 2, 3]));
  });

  it("serves MP3 resources with the audio/mpeg response type", async () => {
    const response = await GET({} as never, {
      params: Promise.resolve({ sessionId: "session-1", path: ["assets", "audio", "stamp", "bgm.mp3"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBe("3");
  });
});
