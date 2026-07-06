import fs from "fs";
import os from "os";
import path from "path";

describe("user authoring preferences", () => {
  let dataDir: string;

  async function createUser(id: string): Promise<void> {
    const { getDb } = await import("@/lib/db");
    getDb()
      .prepare(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, `user-${id}`, "hash", Date.now());
  }

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-user-authoring-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(async () => {
    const { closeDb } = await import("@/lib/db");
    closeDb();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("saves reads and clears handdraw editor preference", async () => {
    const {
      deleteUserAuthoringPreferences,
      readUserAuthoringPreferences,
      upsertUserAuthoringPreferences,
    } = await import("@/lib/user-authoring-preferences");
    await createUser("u1");

    const saved = upsertUserAuthoringPreferences("u1", {
      sketchEditorEngine: "native",
    });
    expect(saved.preferences).toEqual({ sketchEditorEngine: "native" });
    expect(readUserAuthoringPreferences("u1")?.preferences).toEqual({
      sketchEditorEngine: "native",
    });

    deleteUserAuthoringPreferences("u1");
    expect(readUserAuthoringPreferences("u1")).toBeNull();
  });

  it("drops invalid and legacy persisted values when reading", async () => {
    const { getDb } = await import("@/lib/db");
    const { readUserAuthoringPreferences } = await import(
      "@/lib/user-authoring-preferences"
    );
    await createUser("u1");

    getDb()
      .prepare(
        "INSERT INTO user_authoring_preferences (user_id, preferences_json, updated_at) VALUES (?, ?, ?)",
      )
      .run(
        "u1",
        JSON.stringify({ sketchEditorEngine: ["open", "pencil"].join("") }),
        Date.now(),
      );

    expect(readUserAuthoringPreferences("u1")?.preferences).toEqual({});
  });
});
