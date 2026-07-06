import type { SketchSceneDocument, SketchSceneNode } from "@workbench/sketch-core";

export interface SketchFixture {
  id: string;
  name: string;
  scene: SketchSceneDocument;
  configData?: Record<string, unknown>;
}

function scene(nodes: SketchSceneNode[], pageSize = { width: 960, height: 640 }): SketchSceneDocument {
  return {
    version: 1,
    pageSize,
    nodes,
    assets: [],
    bindings: {},
    metadata: { fixture: true },
  };
}

const imageSrc = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280"><rect width="480" height="280" fill="#dbeafe"/><circle cx="370" cy="82" r="32" fill="#2563eb"/><path d="M64 216 184 104l86 72 58-46 88 86" fill="none" stroke="#1e3a8a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

export const sketchFixtures: SketchFixture[] = [
  {
    id: "basic-card",
    name: "基础卡片",
    scene: scene([
      { id: "card", type: "card", x: 120, y: 120, width: 360, height: 220, text: "卡片标题", style: { fill: "#ffffff", stroke: "#0f172a", radius: 16, fontSize: 22, color: "#0f172a" } },
      { id: "button", type: "button", x: 280, y: 270, width: 160, height: 48, text: "行动按钮", style: { fill: "#2563eb", stroke: "#1d4ed8", color: "#ffffff", radius: 10 } },
    ]),
  },
  {
    id: "marketing-wireframe",
    name: "营销页线框",
    scene: scene([
      { id: "hero-title", type: "text", x: 80, y: 80, width: 420, height: 72, text: "产品主标题", style: { fontSize: 44, fontWeight: 700, color: "#111827" } },
      { id: "hero-copy", type: "text", x: 82, y: 170, width: 360, height: 72, text: "一句话描述核心价值和适用场景", style: { fontSize: 20, color: "#4b5563" } },
      { id: "hero-image", type: "image", x: 560, y: 80, width: 300, height: 190, src: imageSrc },
      { id: "cta", type: "button", x: 82, y: 270, width: 180, height: 52, text: "立即开始", style: { fill: "#111827", stroke: "#111827", color: "#ffffff" } },
    ]),
  },
  {
    id: "form-page",
    name: "表单页",
    scene: scene([
      { id: "panel", type: "card", x: 260, y: 72, width: 420, height: 470, text: "注册信息", style: { fill: "#ffffff", stroke: "#cbd5e1", radius: 12 } },
      { id: "name", type: "input", x: 320, y: 180, width: 300, height: 48, text: "姓名" },
      { id: "email", type: "input", x: 320, y: 250, width: 300, height: 48, text: "邮箱" },
      { id: "submit", type: "button", x: 320, y: 340, width: 300, height: 52, text: "提交", style: { fill: "#16a34a", stroke: "#15803d", color: "#ffffff" } },
    ]),
  },
  {
    id: "image-page",
    name: "图片页",
    scene: scene([
      { id: "image", type: "image", x: 90, y: 84, width: 520, height: 300, src: imageSrc },
      { id: "caption", type: "text", x: 90, y: 420, width: 520, height: 42, text: "图片说明文字", style: { fontSize: 22, color: "#334155" } },
    ]),
  },
  {
    id: "long-page",
    name: "长页面",
    scene: scene(
      Array.from({ length: 8 }, (_, index) => ({
        id: `section-${index}`,
        type: "card",
        x: 96,
        y: 80 + index * 180,
        width: 760,
        height: 120,
        text: `页面区块 ${index + 1}`,
        style: { fill: index % 2 ? "#f8fafc" : "#ffffff", stroke: "#cbd5e1", radius: 10 },
      })),
      { width: 960, height: 1600 },
    ),
  },
  {
    id: "config-binding",
    name: "配置绑定页",
    configData: { title: "配置驱动标题", primaryColor: "#7c3aed", showBadge: true },
    scene: scene([
      { id: "title", type: "text", x: 96, y: 96, width: 480, height: 56, text: "默认标题", bindings: { text: "title", color: "primaryColor" }, style: { fontSize: 36, fontWeight: 700, color: "#111827" } },
      { id: "badge", type: "button", x: 96, y: 180, width: 190, height: 44, text: "动态显示", bindings: { visible: "showBadge", fill: "primaryColor" }, style: { fill: "#7c3aed", stroke: "#6d28d9", color: "#ffffff" } },
    ]),
  },
];
