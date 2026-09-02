import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyPageDesignSpecSync,
  buildPageDesignSpecSyncWrites,
} from "../page-design-spec-sync";

let workspacePath: string;

beforeEach(() => {
  workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "page-design-spec-"));
});

afterEach(() => {
  fs.rmSync(workspacePath, { recursive: true, force: true });
});

function readDoc() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(workspacePath, "design-spec", "manifest.json"), "utf-8"),
  ) as { items: Array<{ id: string; title: string }> };
  const doc = JSON.parse(
    fs.readFileSync(path.join(workspacePath, "design-spec", `spec-${manifest.items[0].id}.json`), "utf-8"),
  ) as {
    title: string;
    autoManagedPageId?: string;
    entries: Array<{
      id: string;
      title: string;
      markdown: string;
      target: unknown;
      autoManagedFieldKey?: string;
    }>;
  };
  return { manifest, doc };
}

describe("页面设计规范自动同步", () => {
  it("首次出现图片或动效字段时创建页面文档和空说明条目", () => {
    applyPageDesignSpecSync({
      workspacePath,
      pageId: "home",
      pageName: "首页",
      schema: JSON.stringify({
        properties: {
          heroImage: { type: "image", title: "首屏图片" },
          enterAnimation: { type: "motion", title: "入场动效" },
          headline: { type: "string", title: "标题" },
        },
      }),
    });

    const { manifest, doc } = readDoc();
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0].title).toBe("首页设计规范");
    expect(doc.autoManagedPageId).toBe("home");
    expect(doc.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "首屏图片", markdown: "", autoManagedFieldKey: "heroImage", target: { type: "config", refs: [{ scope: "page", pageId: "home", fieldKey: "heroImage" }] } }),
      expect.objectContaining({ title: "入场动效", markdown: "", autoManagedFieldKey: "enterAnimation", target: { type: "config", refs: [{ scope: "page", pageId: "home", fieldKey: "enterAnimation" }] } }),
    ]));
  });

  it("删除或改为普通类型时只删除对应自动条目，并保留手工条目", () => {
    const initial = JSON.stringify({
      properties: {
        heroImage: { type: "image", title: "首屏图片" },
        enterAnimation: { type: "motion", title: "入场动效" },
      },
    });
    applyPageDesignSpecSync({ workspacePath, pageId: "home", pageName: "首页", schema: initial });
    const { manifest, doc } = readDoc();
    doc.entries.push({ id: "manual", title: "人工说明", markdown: "保留", target: { type: "page", pageIds: ["home"] } });
    fs.writeFileSync(
      path.join(workspacePath, "design-spec", `spec-${manifest.items[0].id}.json`),
      JSON.stringify(doc, null, 2),
      "utf-8",
    );

    applyPageDesignSpecSync({
      workspacePath,
      pageId: "home",
      pageName: "首页",
      schema: JSON.stringify({
        properties: {
          heroImage: { type: "string", title: "首屏文字" },
        },
      }),
    });

    const after = readDoc().doc;
    expect(after.entries).toEqual([
      expect.objectContaining({ title: "人工说明", markdown: "保留" }),
    ]);
  });

  it("页面改名时更新自动文档标题", () => {
    const input = {
      workspacePath,
      pageId: "home",
      pageName: "首页",
      schema: JSON.stringify({ properties: { logo: { type: "image", title: "Logo" } } }),
    };
    applyPageDesignSpecSync(input);
    applyPageDesignSpecSync({ ...input, pageName: "新版首页" });

    expect(readDoc().doc.title).toBe("新版首页设计规范");
  });

  it("无符合条件字段且没有自动文档时不产生写入", () => {
    expect(buildPageDesignSpecSyncWrites({
      workspacePath,
      pageId: "home",
      pageName: "首页",
      schema: JSON.stringify({ properties: { headline: { type: "string" } } }),
    })).toEqual([]);
  });

  it("同步配置项规范时不删除手工页面规范", () => {
    applyPageDesignSpecSync({
      workspacePath,
      pageId: "home",
      pageName: "首页",
      schema: JSON.stringify({ properties: { hero: { type: "image", title: "首图" } } }),
    });
    const { manifest, doc } = readDoc();
    doc.entries.push({
      id: "page-rule",
      title: "玩法介绍",
      markdown: "拖动图片完成配对。",
      target: { type: "page", pageIds: ["home", "lesson-2"] },
    });
    fs.writeFileSync(
      path.join(workspacePath, "design-spec", `spec-${manifest.items[0].id}.json`),
      JSON.stringify(doc, null, 2),
      "utf-8",
    );

    applyPageDesignSpecSync({
      workspacePath,
      pageId: "home",
      pageName: "首页",
      schema: JSON.stringify({ properties: {} }),
    });

    expect(readDoc().doc.entries).toEqual([
      expect.objectContaining({
        id: "page-rule",
        target: { type: "page", pageIds: ["home", "lesson-2"] },
      }),
    ]);
  });
});
