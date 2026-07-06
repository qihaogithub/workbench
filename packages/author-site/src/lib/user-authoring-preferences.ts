import type { UserAuthoringPreferences } from "@workbench/shared";

import { getDb } from "@/lib/db";

interface UserAuthoringPreferencesRow {
  preferences_json: string;
  updated_at: number;
}

export interface SafeUserAuthoringPreferences {
  preferences: UserAuthoringPreferences;
  updatedAt: number;
}

function normalizeUserAuthoringPreferences(
  value: unknown,
): UserAuthoringPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const sketchEditorEngine = record.sketchEditorEngine;
  if (sketchEditorEngine === "native") {
    return { sketchEditorEngine };
  }
  return {};
}

export function readUserAuthoringPreferences(
  userId: string,
): SafeUserAuthoringPreferences | null {
  const row = getDb()
    .prepare(
      "SELECT preferences_json, updated_at FROM user_authoring_preferences WHERE user_id = ?",
    )
    .get(userId) as UserAuthoringPreferencesRow | undefined;

  if (!row) return null;
  return {
    preferences: normalizeUserAuthoringPreferences(JSON.parse(row.preferences_json)),
    updatedAt: row.updated_at,
  };
}

export function upsertUserAuthoringPreferences(
  userId: string,
  preferences: UserAuthoringPreferences,
): SafeUserAuthoringPreferences {
  const normalized = normalizeUserAuthoringPreferences(preferences);
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO user_authoring_preferences (user_id, preferences_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         preferences_json = ?,
         updated_at = ?`,
    )
    .run(
      userId,
      JSON.stringify(normalized),
      now,
      JSON.stringify(normalized),
      now,
    );

  return { preferences: normalized, updatedAt: now };
}

export function deleteUserAuthoringPreferences(userId: string): void {
  getDb()
    .prepare("DELETE FROM user_authoring_preferences WHERE user_id = ?")
    .run(userId);
}
