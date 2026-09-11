#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function parseArgs(argv) {
  const options = { apply: false, confirm: "", db: "", backup: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--db") options.db = argv[++index] || "";
    else if (arg === "--backup") options.backup = argv[++index] || "";
    else if (arg === "--confirm") options.confirm = argv[++index] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.db) throw new Error("--db <users.db> is required");
  if (options.apply && !options.backup) throw new Error("--backup is required with --apply");
  if (options.apply && options.confirm !== "CLEAR_ENCRYPTED_CREDENTIALS") {
    throw new Error("--confirm CLEAR_ENCRYPTED_CREDENTIALS is required with --apply");
  }
  return options;
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} contains invalid JSON`);
  }
}

function inspect(db) {
  return {
    userModelConfigs: tableExists(db, "user_model_configs")
      ? db.prepare("SELECT COUNT(*) AS count FROM user_model_configs").get().count
      : 0,
    externalAuthConfigs: tableExists(db, "user_external_auth_configs")
      ? db.prepare("SELECT COUNT(*) AS count FROM user_external_auth_configs WHERE config_json LIKE '%encryptedCredential%'").get().count
      : 0,
    globalModelConfig: tableExists(db, "system_configs")
      ? Number(Boolean(db.prepare("SELECT 1 FROM system_configs WHERE id='model_config'").get()))
      : 0,
  };
}

function clearCredentials(db) {
  const run = db.transaction(() => {
    if (tableExists(db, "user_model_configs")) {
      const rows = db.prepare("SELECT user_id, config_json FROM user_model_configs").all();
      const update = db.prepare("UPDATE user_model_configs SET config_json=?, updated_at=? WHERE user_id=?");
      for (const row of rows) {
        const config = parseJson(row.config_json, "user_model_configs.config_json");
        if (config.provider) {
          delete config.provider.encryptedApiKey;
          delete config.provider.apiKey;
          config.provider.hasApiKey = false;
        }
        update.run(JSON.stringify(config), Date.now(), row.user_id);
      }
    }
    if (tableExists(db, "user_external_auth_configs")) {
      const rows = db.prepare("SELECT user_id, provider, config_json FROM user_external_auth_configs").all();
      const update = db.prepare("UPDATE user_external_auth_configs SET config_json=?, updated_at=? WHERE user_id=? AND provider=?");
      for (const row of rows) {
        const config = parseJson(row.config_json, "user_external_auth_configs.config_json");
        delete config.encryptedCredential;
        config.status = "needs_reauth";
        config.message = "加密密钥已轮换，请重新授权";
        update.run(JSON.stringify(config), Date.now(), row.user_id, row.provider);
      }
    }
    if (tableExists(db, "system_configs")) {
      const row = db.prepare("SELECT config_json FROM system_configs WHERE id='model_config'").get();
      if (row) {
        const config = parseJson(row.config_json, "system_configs.model_config");
        for (const provider of config.backendProviders?.providers ?? []) {
          delete provider.apiKey;
          delete provider.encryptedApiKey;
        }
        if (config.imageGen) {
          delete config.imageGen.apiKey;
          delete config.imageGen.encryptedApiKey;
        }
        db.prepare("UPDATE system_configs SET config_json=?, updated_at=?, updated_by=? WHERE id='model_config'")
          .run(JSON.stringify(config), Date.now(), "credential-reset");
      }
    }
  });
  run();
}

const options = parseArgs(process.argv.slice(2));
const dbFile = path.resolve(options.db);
if (!fs.existsSync(dbFile)) throw new Error(`Database does not exist: ${dbFile}`);
const db = new Database(dbFile, { readonly: !options.apply });
try {
  const counts = inspect(db);
  console.log(JSON.stringify({ mode: options.apply ? "apply" : "dry-run", counts }, null, 2));
  if (options.apply) {
    const backupFile = path.resolve(options.backup);
    if (fs.existsSync(backupFile)) throw new Error(`Backup already exists: ${backupFile}`);
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    await db.backup(backupFile);
    clearCredentials(db);
    console.log(JSON.stringify({ cleared: true, backup: backupFile }));
  }
} finally {
  db.close();
}
