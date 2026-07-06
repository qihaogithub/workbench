import type { VisualNodeInfo } from "@workbench/demo-ui";

import {
  applyVisualConfiguration,
  buildVisualConfigCandidates,
} from "../visual-configurator";
import { applyPrototypeVisualConfiguration } from "../prototype-visual-editor";

function node(overrides: Partial<VisualNodeInfo> = {}): VisualNodeInfo {
  return {
    nodeId: "body > div:nth-of-type(1)",
    tagName: "h1",
    textContent: "Hello",
    domPath: "div:nth-of-type(1) > h1:nth-of-type(1)",
    rect: { x: 0, y: 0, width: 100, height: 40 },
    editCapabilities: ["annotate", "text", "className", "structure"],
    computedStyle: {
      color: "rgb(17, 24, 39)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderColor: "rgb(17, 24, 39)",
    },
    ...overrides,
  };
}

const schema = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Demo 配置",
  type: "object",
  properties: {},
  required: [],
});

describe("visual-configurator", () => {
  it("应为叶子文本节点生成文本和颜色候选", () => {
    const candidates = buildVisualConfigCandidates(node());
    expect(candidates.map((item) => item.id)).toEqual([
      "text:value",
      "color:color",
      "color:borderColor",
    ]);
  });

  it("应把唯一文本转换为字符串配置项", () => {
    const code = `import React from 'react';

interface DemoProps {
}

export default function Demo({}: DemoProps) {
  return <h1>Hello</h1>;
}
`;

    const result = applyVisualConfiguration({
      code,
      schema,
      node: node(),
      target: {
        kind: "text",
        fieldKey: "heroTitle",
        title: "主标题",
        defaultValue: "Hello",
        category: "设计",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("heroTitle?: string;");
    expect(result.code).toContain('heroTitle = "Hello"');
    expect(result.code).toContain("<h1>{heroTitle}</h1>");
    expect(JSON.parse(result.schema).properties.heroTitle).toEqual({
      type: "string",
      title: "主标题",
      default: "Hello",
      "ui:options": { category: "设计" },
    });
  });

  it("应把唯一图片 src 转换为图片配置项", () => {
    const code = `interface DemoProps {
}

export default function Demo({}: DemoProps) {
  return <img src="/banner.png" alt="Banner" />;
}
`;

    const result = applyVisualConfiguration({
      code,
      schema,
      node: node({
        tagName: "img",
        textContent: undefined,
        attrs: { src: "/banner.png", alt: "Banner" },
      }),
      target: {
        kind: "image",
        fieldKey: "bannerImage",
        title: "Banner",
        defaultValue: "/banner.png",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("src={bannerImage}");
    expect(JSON.parse(result.schema).properties.bannerImage.format).toBe("image");
  });

  it("应把唯一文本所在元素追加颜色 style", () => {
    const code = `interface DemoProps {
}

export default function Demo({}: DemoProps) {
  return <h1 className="text-xl">Hello</h1>;
}
`;

    const result = applyVisualConfiguration({
      code,
      schema,
      node: node(),
      target: {
        kind: "color",
        fieldKey: "titleColor",
        title: "标题颜色",
        defaultValue: "rgb(17, 24, 39)",
        colorProperty: "color",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain(
      '<h1 className="text-xl" style={{ color: titleColor }}>Hello</h1>',
    );
    expect(JSON.parse(result.schema).properties.titleColor.format).toBe("color");
  });

  it("文本重复时应拒绝自动写回", () => {
    const result = applyVisualConfiguration({
      code: `interface DemoProps {
}

export default function Demo({}: DemoProps) {
  return <><h1>Hello</h1><p>Hello</p></>;
}
`,
      schema,
      node: node(),
      target: {
        kind: "text",
        fieldKey: "title",
        title: "标题",
        defaultValue: "Hello",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("出现多次");
  });

  it("原型页配置化应保存配置分类", () => {
    const result = applyPrototypeVisualConfiguration({
      html: '<h1 data-ow-id="hero-title">Hello</h1>',
      schema,
      node: node({
        nodeId: "hero-title",
        domPath: "h1:nth-of-type(1)",
      }),
      target: {
        kind: "text",
        fieldKey: "heroTitle",
        title: "主标题",
        defaultValue: "Hello",
        category: "设计",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('data-bind-text="heroTitle"');
    expect(JSON.parse(result.schema).properties.heroTitle).toEqual({
      type: "string",
      title: "主标题",
      default: "Hello",
      "ui:options": { category: "设计" },
    });
  });
});
