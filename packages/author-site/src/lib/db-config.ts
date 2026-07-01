/**
 * 数据库配置读写封装
 *
 * 提供 system_configs 表的 CRUD 操作
 * 用于管理后台动态配置的持久化存储
 *
 * 使用 db/index.ts 的单例连接,确保与主应用使用同一数据库文件
 */

import { getDb } from "./db";

/**
 * 系统配置数据结构
 */
export interface SystemConfig {
  id: string;
  config_json: string;
  updated_at: number;
  updated_by?: string;
}

export interface DbConfigWithMeta {
  config: Record<string, unknown>;
  updatedAt: number;
  updatedBy?: string;
}

/**
 * 读取配置
 * @param id 配置项唯一标识 (如 "model_config")
 * @returns 配置对象,不存在时返回 null
 */
export function readDbConfig(id: string): Record<string, any> | null {
  const db = getDb();
  const row = db
    .prepare("SELECT config_json FROM system_configs WHERE id = ?")
    .get(id) as SystemConfig | undefined;

  return row ? JSON.parse(row.config_json) : null;
}

/**
 * 读取配置及元信息
 * @param id 配置项唯一标识
 * @returns 配置对象和更新时间，不存在时返回 null
 */
export function readDbConfigWithMeta(id: string): DbConfigWithMeta | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT config_json, updated_at, updated_by FROM system_configs WHERE id = ?",
    )
    .get(id) as SystemConfig | undefined;

  if (!row) return null;

  return {
    config: JSON.parse(row.config_json) as Record<string, unknown>,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * 写入配置 (不存在则创建,存在则更新)
 * @param id 配置项唯一标识
 * @param config 配置对象
 * @param updatedBy 可选的修改者标识
 */
export function writeDbConfig(
  id: string,
  config: Record<string, any>,
  updatedBy?: string,
): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO system_configs (id, config_json, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET 
       config_json = ?,
       updated_at = ?,
       updated_by = ?`,
  ).run(
    id,
    JSON.stringify(config),
    now,
    updatedBy || null,
    JSON.stringify(config),
    now,
    updatedBy || null,
  );
}

/**
 * 删除配置
 * @param id 配置项唯一标识
 */
export function deleteDbConfig(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM system_configs WHERE id = ?").run(id);
}

/**
 * 获取所有配置列表
 */
export function listDbConfigs(): Array<{ id: string; updated_at: number }> {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, updated_at FROM system_configs ORDER BY updated_at DESC",
    )
    .all() as Array<{ id: string; updated_at: number }>;
}

/**
 * 初始化默认配置 (如果不存在)
 * @param id 配置项唯一标识
 * @param defaultConfig 默认配置对象
 */
export function initDefaultConfig(
  id: string,
  defaultConfig: Record<string, any>,
): void {
  const existing = readDbConfig(id);
  if (!existing) {
    writeDbConfig(id, defaultConfig, "system");
  }
}
