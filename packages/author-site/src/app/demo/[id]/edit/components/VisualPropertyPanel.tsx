"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  Blend,
  Bolt,
  Box,
  Brush,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Grid3X3,
  ImageIcon,
  Link2,
  LinkIcon,
  MousePointer2,
  PanelTop,
  Plus,
  Radius,
  RotateCcw,
  Square,
  TextCursorInput,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BUILT_IN_CONFIG_CATEGORIES,
  type VisualNodeInfo,
  type VisualPropertyChange,
  type VisualPropertyChangeKind,
} from "@opencode-workbench/demo-ui";
import type { VisualConfigMark } from "../hooks/useVisualEditState";

interface VisualPropertyPanelProps {
  selectedNode: VisualNodeInfo | null;
  sessionId?: string;
  propertyChanges: VisualPropertyChange[];
  configMarks: VisualConfigMark[];
  aiInstruction: string;
  usedConfigKeys: string[];
  onPropertyChange: (
    node: VisualNodeInfo,
    property: string,
    label: string,
    value: string,
    kind: VisualPropertyChangeKind,
    previousValue?: string,
    resource?: VisualPropertyChange["resource"],
  ) => void;
  onRestoreProperty: (changeId: string) => void;
  onClearChanges: () => void;
  onMarkConfig: (
    node: VisualNodeInfo,
    property: string,
    label: string,
    value: string,
    kind: VisualPropertyChangeKind,
  ) => void;
  onUpdateConfigMark: (
    markId: string,
    patch: Partial<Pick<VisualConfigMark, "fieldTitle" | "fieldKey" | "defaultValue" | "category" | "scope">>,
  ) => void;
  onRemoveConfigMark: (markId: string) => void;
  onAiInstructionChange: (value: string) => void;
}

type Option = { value: string; label: string; icon?: ReactNode };

interface PropertySpec {
  section: string;
  property: string;
  label: string;
  kind: VisualPropertyChangeKind;
  input: "text" | "textarea" | "color" | "number" | "select" | "file" | "readonly" | "segmented";
  options?: Option[];
  unit?: string;
  placeholder?: string;
}

const POSITION_SPECS: PropertySpec[] = [
  { section: "位置", property: "x", label: "横向位置", kind: "style", input: "readonly", unit: "px" },
  { section: "位置", property: "y", label: "纵向位置", kind: "style", input: "readonly", unit: "px" },
  { section: "位置", property: "width", label: "宽度", kind: "style", input: "number", unit: "px" },
  { section: "位置", property: "height", label: "高度", kind: "style", input: "number", unit: "px" },
];

const LAYOUT_SPECS: PropertySpec[] = [
  {
    section: "布局",
    property: "display",
    label: "排列",
    kind: "style",
    input: "readonly",
  },
];

const APPEARANCE_SPECS: PropertySpec[] = [
  { section: "外观", property: "opacity", label: "不透明度", kind: "style", input: "number", unit: "%" },
  { section: "外观", property: "borderRadius", label: "圆角", kind: "style", input: "number", unit: "px" },
];

const TEXT_SPECS: PropertySpec[] = [
  { section: "文本", property: "textContent", label: "内容", kind: "text", input: "textarea" },
  { section: "文本", property: "fontFamily", label: "字体", kind: "style", input: "text" },
  {
    section: "文本",
    property: "fontWeight",
    label: "字重",
    kind: "style",
    input: "select",
    options: ["300", "400", "500", "600", "700", "800"].map((value) => ({ value, label: value })),
  },
  { section: "文本", property: "fontSize", label: "字号", kind: "style", input: "number", unit: "px" },
  { section: "文本", property: "color", label: "颜色", kind: "style", input: "color" },
  { section: "文本", property: "lineHeight", label: "行高", kind: "style", input: "number", unit: "px" },
  { section: "文本", property: "letterSpacing", label: "字间距", kind: "style", input: "number", unit: "px" },
  {
    section: "文本",
    property: "textAlign",
    label: "对齐",
    kind: "style",
    input: "segmented",
    options: [
      { value: "left", label: "左", icon: <AlignLeft className="h-3.5 w-3.5" /> },
      { value: "center", label: "中", icon: <AlignCenter className="h-3.5 w-3.5" /> },
      { value: "right", label: "右", icon: <AlignRight className="h-3.5 w-3.5" /> },
      { value: "justify", label: "齐", icon: <AlignJustify className="h-3.5 w-3.5" /> },
    ],
  },
];

const IMAGE_SPECS: PropertySpec[] = [
  { section: "图片", property: "src", label: "替换图片", kind: "attribute", input: "file" },
];

const BACKGROUND_SPECS: PropertySpec[] = [
  { section: "背景", property: "backgroundColor", label: "颜色", kind: "style", input: "color" },
];

const BORDER_SPECS: PropertySpec[] = [
  { section: "边框", property: "borderColor", label: "颜色", kind: "style", input: "color" },
  { section: "边框", property: "borderWidth", label: "宽度", kind: "style", input: "number", unit: "px" },
];

const EFFECT_SPECS: PropertySpec[] = [
  { section: "阴影与模糊", property: "boxShadow", label: "阴影", kind: "style", input: "text", placeholder: "无" },
  { section: "阴影与模糊", property: "filter", label: "滤镜", kind: "style", input: "text", placeholder: "无" },
];

const LINK_SPECS: PropertySpec[] = [
  { section: "链接", property: "href", label: "链接地址", kind: "attribute", input: "text" },
];

const SECTION_ORDER = ["位置", "布局", "外观", "图片", "文本", "背景", "边框", "链接", "阴影与模糊"];

function getChangeId(
  node: VisualNodeInfo,
  property: string,
  kind: VisualPropertyChangeKind,
) {
  return `${node.domPath || node.nodeId}:${kind}:${property}`;
}

function getCurrentValue(node: VisualNodeInfo, spec: PropertySpec): string {
  if (spec.property === "x") return String(Math.round(node.rect.x));
  if (spec.property === "y") return String(Math.round(node.rect.y));
  if (spec.kind === "text") return node.textContent ?? "";
  if (spec.kind === "attribute") {
    if (spec.property === "src") {
      return node.attrs?.src ?? node.attrs?.currentSrc ?? "";
    }
    if (spec.property === "href") return node.attrs?.href ?? "";
  }
  const style = node.computedStyle;
  switch (spec.property) {
    case "color":
      return style?.color ?? "";
    case "backgroundColor":
      return style?.backgroundColor ?? "";
    case "borderColor":
      return style?.borderColor ?? "";
    case "borderWidth":
      return style?.borderWidth ?? "";
    case "borderRadius":
      return style?.borderRadius ?? "";
    case "boxShadow":
      return style?.boxShadow ?? "";
    case "filter":
      return style?.filter ?? "";
    case "opacity":
      return style?.opacity && Number.isFinite(Number(style.opacity))
        ? String(Math.round(Number(style.opacity) * 100))
        : (style?.opacity ?? "");
    case "fontFamily":
      return style?.fontFamily ?? "";
    case "fontSize":
      return style?.fontSize ?? "";
    case "fontWeight":
      return style?.fontWeight ?? "";
    case "lineHeight":
      return style?.lineHeight ?? "";
    case "letterSpacing":
      return style?.letterSpacing ?? "";
    case "textAlign":
      return style?.textAlign ?? "";
    case "width":
      return style?.width ?? "";
    case "height":
      return style?.height ?? "";
    case "padding":
      return style?.padding ?? "";
    case "paddingTop":
      return style?.paddingTop ?? "";
    case "paddingRight":
      return style?.paddingRight ?? "";
    case "paddingBottom":
      return style?.paddingBottom ?? "";
    case "paddingLeft":
      return style?.paddingLeft ?? "";
    case "margin":
      return style?.margin ?? "";
    case "marginTop":
      return style?.marginTop ?? "";
    case "marginRight":
      return style?.marginRight ?? "";
    case "marginBottom":
      return style?.marginBottom ?? "";
    case "marginLeft":
      return style?.marginLeft ?? "";
    case "display":
      return style?.display ?? "";
    case "flexDirection":
      return style?.flexDirection ?? "";
    case "justifyContent":
      return style?.justifyContent ?? "";
    case "alignItems":
      return style?.alignItems ?? "";
    case "gap":
      return style?.gap ?? "";
    default:
      return "";
  }
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (trimmed.toLowerCase() === "transparent") return null;
  const match = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(",").slice(0, 3).map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return `#${parts
    .map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function colorToHex(value: string): string {
  return normalizeHexColor(value) ?? "#000000";
}

function formatColorInputValue(value: string): string {
  return normalizeHexColor(value) ?? value;
}

function normalizeColorInputValue(value: string): string {
  return normalizeHexColor(value) ?? value;
}

function isTransparentColor(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "transparent") return true;
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return false;
  const alpha = match[1].split(",")[3];
  return alpha != null && Number(alpha.trim()) === 0;
}

function getLayerName(node: VisualNodeInfo) {
  if (node.editCapabilities.includes("image") || node.attrs?.src || node.attrs?.currentSrc) return "图片";
  if (node.attrs?.ariaLabel) return node.attrs.ariaLabel;
  if (node.attrs?.role === "button") return node.textContent || "按钮";
  if (node.attrs?.role === "dialog") return "弹窗";
  if (node.attrs?.role === "navigation") return "导航";
  if (node.editCapabilities.includes("text") && node.textContent) return node.textContent;
  if (node.componentName && node.componentName !== node.tagName) {
    const name = node.componentName.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    if (!/^(div|span)$/i.test(name)) return name;
  }
  if (node.attrs?.href) return "链接";
  const tagName = node.tagName.toLowerCase();
  const className = node.className?.toLowerCase() ?? "";
  if (tagName === "button") return node.textContent || "按钮";
  if (tagName === "a") return node.textContent || "链接";
  if (tagName === "input") return "输入框";
  if (tagName === "textarea") return "多行输入";
  if (tagName === "select") return "选择框";
  if (/^h[1-6]$/.test(tagName)) return node.textContent || "标题";
  if (tagName === "p") return node.textContent || "段落";
  if (tagName === "label") return node.textContent || "标签";
  if (tagName === "nav") return "导航";
  if (tagName === "header") return "页眉";
  if (tagName === "footer") return "页脚";
  if (tagName === "main") return "页面主体";
  if (tagName === "section") return "页面区块";
  if (tagName === "article") return "内容卡片";
  if (tagName === "ul" || tagName === "ol") return "列表";
  if (tagName === "li") return "列表项";
  if (tagName === "form") return "表单";
  if (className.includes("modal") || className.includes("dialog") || className.includes("popover")) return "弹窗";
  if (className.includes("card") || className.includes("panel")) return "卡片";
  if (className.includes("button") || className.includes("action") || className.includes("cta")) return "操作区";
  if (className.includes("content") || className.includes("body")) return "内容区域";
  if (className.includes("container") || className.includes("wrapper")) return "容器";
  if (tagName === "span") return "文本";
  return "内容区域";
}

function getLayerKind(node: VisualNodeInfo) {
  if (node.editCapabilities.includes("image") || node.attrs?.src || node.attrs?.currentSrc) return "图片";
  if (node.editCapabilities.includes("link") || node.attrs?.href) return "链接";
  if (node.editCapabilities.includes("text")) return "文字";
  return "容器";
}

function getLayerPurpose(node: VisualNodeInfo) {
  if (node.editCapabilities.includes("image") || node.attrs?.src || node.attrs?.currentSrc) return "可替换图片";
  if (node.editCapabilities.includes("link") || node.attrs?.href) return "可编辑链接";
  if (node.editCapabilities.includes("text")) return "可编辑文字";
  const style = node.computedStyle;
  if (style?.display === "flex" || style?.display === "inline-flex" || style?.display === "grid") return "可调布局";
  return "可调样式";
}

function hasVisibleContainerStyle(node: VisualNodeInfo) {
  const style = node.computedStyle;
  if (!style) return false;
  const borderWidth = Number((style.borderWidth ?? "").replace("px", ""));
  const radius = Number((style.borderRadius ?? "").replace("px", ""));
  const shadow = (style.boxShadow ?? "").trim().toLowerCase();
  return (
    !isTransparentColor(style.backgroundColor ?? "") ||
    (Number.isFinite(borderWidth) && borderWidth > 0 && style.borderStyle !== "none" && style.borderStyle !== "hidden") ||
    (Number.isFinite(radius) && radius > 0) ||
    (shadow.length > 0 && shadow !== "none")
  );
}

function getContextualLayerName(node: VisualNodeInfo, layers: VisualNodeInfo[], index: number) {
  const name = getLayerName(node);
  if (name !== "内容区域" && name !== "容器") return name;
  const descendants = layers.slice(index + 1);
  if (hasVisibleContainerStyle(node)) return "视觉容器";
  if (descendants.some((item) => item.editCapabilities.includes("image") || item.attrs?.src || item.attrs?.currentSrc)) return "图片区";
  if (descendants.some((item) => item.attrs?.href || item.attrs?.role === "button" || item.tagName.toLowerCase() === "button")) return "操作区";
  if (descendants.some((item) => item.editCapabilities.includes("text"))) return "文字区";
  const style = node.computedStyle;
  if (style?.display === "flex" || style?.display === "inline-flex" || style?.display === "grid") return "排列区域";
  return index === 0 ? "页面区域" : "内容组";
}

function shouldShowLayerItem(
  node: VisualNodeInfo,
  layers: VisualNodeInfo[],
  selectedNode: VisualNodeInfo,
  index: number,
) {
  if (node.domPath === selectedNode.domPath) return true;
  if (index === 0 || index === layers.length - 1) return true;
  if (node.editCapabilities.includes("image") || node.editCapabilities.includes("text") || node.attrs?.href) return true;
  if (hasVisibleContainerStyle(node)) return true;
  const name = getContextualLayerName(node, layers, index);
  return name !== "内容组" && name !== "内容区域" && name !== "容器";
}

function getVisibleLayerItems(layers: VisualNodeInfo[], selectedNode: VisualNodeInfo) {
  const items = layers
    .map((node, index) => ({
      node,
      index,
      name: getContextualLayerName(node, layers, index),
      purpose: getLayerPurpose(node),
      kind: getLayerKind(node),
    }))
    .filter((item) => shouldShowLayerItem(item.node, layers, selectedNode, item.index));

  const deduped = items.filter((item, index) => {
    const previous = items[index - 1];
    if (!previous) return true;
    if (item.node.domPath === selectedNode.domPath) return true;
    if (item.kind !== "容器") return true;
    return item.name !== previous.name || item.purpose !== previous.purpose;
  });

  return deduped.some((item) => item.node.domPath === selectedNode.domPath)
    ? deduped
    : [
        ...deduped,
        {
          node: selectedNode,
          index: layers.findIndex((node) => node.domPath === selectedNode.domPath),
          name: getContextualLayerName(selectedNode, layers, layers.findIndex((node) => node.domPath === selectedNode.domPath)),
          purpose: getLayerPurpose(selectedNode),
          kind: getLayerKind(selectedNode),
        },
      ].sort((a, b) => a.index - b.index);
}

function getGroupIcon(group: string) {
  if (group === "文本") return <TextCursorInput className="h-3.5 w-3.5" />;
  if (group === "图片") return <ImageIcon className="h-3.5 w-3.5" />;
  if (group === "链接") return <LinkIcon className="h-3.5 w-3.5" />;
  if (group === "外观") return <Brush className="h-3.5 w-3.5" />;
  if (group === "布局") return <AlignCenter className="h-3.5 w-3.5" />;
  if (group === "位置") return <Box className="h-3.5 w-3.5" />;
  if (group === "背景") return <PanelTop className="h-3.5 w-3.5" />;
  if (group === "边框") return <Square className="h-3.5 w-3.5" />;
  if (group === "阴影与模糊") return <Brush className="h-3.5 w-3.5" />;
  return <Box className="h-3.5 w-3.5" />;
}

function getSpecsForNode(node: VisualNodeInfo): PropertySpec[] {
  const specs = [
    ...POSITION_SPECS,
    ...LAYOUT_SPECS,
    ...APPEARANCE_SPECS,
  ];
  if (node.editCapabilities.includes("text")) {
    specs.push(...TEXT_SPECS);
  }
  if (node.editCapabilities.includes("image") || node.attrs?.src || node.attrs?.currentSrc) {
    specs.push(...IMAGE_SPECS);
  }
  specs.push(...BACKGROUND_SPECS, ...BORDER_SPECS);
  if (node.editCapabilities.includes("link") || node.attrs?.href) {
    specs.push(...LINK_SPECS);
  }
  specs.push(...EFFECT_SPECS);
  return specs;
}

function getDisplayValue(value: string, spec: PropertySpec) {
  if (!value || !spec.unit) return value;
  return value.endsWith(spec.unit) ? value.slice(0, -spec.unit.length).trim() : value;
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("读取文件失败"));
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export function VisualPropertyPanel({
  selectedNode,
  sessionId,
  propertyChanges,
  configMarks,
  aiInstruction,
  usedConfigKeys,
  onPropertyChange,
  onRestoreProperty,
  onClearChanges,
  onMarkConfig,
  onUpdateConfigMark,
  onRemoveConfigMark,
  onAiInstructionChange,
}: VisualPropertyPanelProps) {
  const [uploadingChangeId, setUploadingChangeId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cornerRadiusExpanded, setCornerRadiusExpanded] = useState(false);
  const [editingConfigChangeId, setEditingConfigChangeId] = useState<string | null>(null);
  const specsBySection = useMemo(() => {
    if (!selectedNode) return [];
    const grouped = new Map<string, PropertySpec[]>();
    for (const spec of getSpecsForNode(selectedNode)) {
      grouped.set(spec.section, [...(grouped.get(spec.section) ?? []), spec]);
    }
    return SECTION_ORDER
      .map((section) => [section, grouped.get(section) ?? []] as const)
      .filter(([, specs]) => specs.length > 0);
  }, [selectedNode]);

  const uploadImageReplacement = async (
    file: File,
    changeId: string,
    applyValue: (value: string, resource: VisualPropertyChange["resource"]) => void,
  ) => {
    setUploadingChangeId(changeId);
    setUploadError(null);
    try {
      if (sessionId) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`/api/sessions/${sessionId}/assets/upload`, {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as
          | {
              success: true;
              data: {
                url: string;
                filename: string;
                size: number;
                mimeType: string;
              };
            }
          | { success: false; error?: { message?: string } };
        if (response.ok && data.success) {
          applyValue(data.data.url, {
            fileName: data.data.filename || file.name,
            mimeType: data.data.mimeType || file.type,
            size: data.data.size || file.size,
            url: data.data.url,
          });
          return;
        }
        setUploadError(data.success ? "上传失败" : data.error?.message || "上传失败，已改用临时预览");
      }

      const dataUrl = await readFileAsDataUrl(file);
      applyValue(dataUrl, {
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        temporary: true,
      });
      if (!sessionId) {
        setUploadError("当前没有会话资源目录，已使用临时 data URL 预览");
      }
    } catch {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        applyValue(dataUrl, {
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          temporary: true,
        });
        setUploadError("上传失败，已使用临时 data URL 预览");
      } catch {
        setUploadError("读取图片失败，请重试");
      }
    } finally {
      setUploadingChangeId(null);
    }
  };

  if (!selectedNode) {
    return (
      <div className="flex h-full flex-col bg-card">
        <div className="flex items-center border-b px-4 py-3">
          <h2 className="text-sm font-medium">属性编辑</h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <MousePointer2 className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">点击左侧预览选择对象</p>
            <p className="mt-1 text-xs text-muted-foreground">
              右侧会显示当前点击位置的图层和可编辑属性。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const styleRecord = selectedNode.computedStyle as Record<string, string | undefined> | undefined;
  const getStyleChange = (property: string) => {
    const changeId = getChangeId(selectedNode, property, "style");
    return propertyChanges.find((item) => item.id === changeId);
  };
  const getStyleValue = (property: string) => {
    return getStyleChange(property)?.value ?? styleRecord?.[property] ?? "";
  };
  const getStyleNumberValue = (property: string, unit = "px") => {
    const value = getStyleValue(property);
    return value.endsWith(unit) ? value.slice(0, -unit.length).trim() : value;
  };
  const getOpacityValue = () => {
    const change = getStyleChange("opacity");
    const raw = change ? change.value.trim() : getStyleValue("opacity").trim();
    if (!raw) return change ? "" : "100";
    const numeric = Number(raw.replace("%", ""));
    if (!Number.isFinite(numeric)) return raw;
    if (raw.endsWith("%")) return String(Math.max(0, Math.min(100, Math.round(numeric))));
    return String(Math.round(Math.max(0, Math.min(numeric <= 1 ? numeric * 100 : numeric, 100))));
  };
  const applyStyleValue = (property: string, label: string, value: string) => {
    onPropertyChange(
      selectedNode,
      property,
      label,
      value,
      "style",
      styleRecord?.[property] || undefined,
    );
  };
  const displayValue = getStyleValue("display");
  const directionValue = getStyleValue("flexDirection");
  const flowValue =
    displayValue === "grid"
      ? "grid"
      : displayValue === "flex" || displayValue === "inline-flex"
        ? directionValue === "column"
          ? "column"
          : "row"
        : "free";
  const alignValue = `${getStyleValue("justifyContent") || "flex-start"}:${getStyleValue("alignItems") || "stretch"}`;
  const paddingXValue = (() => {
    const left = getStyleNumberValue("paddingLeft");
    const right = getStyleNumberValue("paddingRight");
    return left === right ? left : "";
  })();
  const paddingYValue = (() => {
    const top = getStyleNumberValue("paddingTop");
    const bottom = getStyleNumberValue("paddingBottom");
    return top === bottom ? top : "";
  })();
  const cornerRadiusFields = [
    { property: "borderTopLeftRadius", label: "左上圆角", icon: <CornerUpLeft className="h-3.5 w-3.5" /> },
    { property: "borderTopRightRadius", label: "右上圆角", icon: <CornerUpRight className="h-3.5 w-3.5" /> },
    { property: "borderBottomRightRadius", label: "右下圆角", icon: <CornerDownRight className="h-3.5 w-3.5" /> },
    { property: "borderBottomLeftRadius", label: "左下圆角", icon: <CornerDownLeft className="h-3.5 w-3.5" /> },
  ] as const;
  const hasCornerRadiusChanges = cornerRadiusFields.some((field) => Boolean(getStyleChange(field.property)));
  const radiusValues = cornerRadiusFields.map((field) => getStyleNumberValue(field.property));
  const fallbackRadiusValue = getStyleNumberValue("borderRadius");
  const uniformRadiusValue =
    hasCornerRadiusChanges
      ? radiusValues.every((value) => value === radiusValues[0])
        ? radiusValues[0]
        : ""
      : fallbackRadiusValue || (radiusValues.every((value) => value === radiusValues[0]) ? radiusValues[0] : "");
  const borderWidthValue = getStyleNumberValue("borderWidth");
  const borderWidthNumber = Number(borderWidthValue);
  const borderStyleValue = getStyleValue("borderStyle");
  const backgroundColorValue = getStyleValue("backgroundColor");
  const hasBackgroundColor =
    !isTransparentColor(backgroundColorValue) ||
    Boolean(getStyleChange("backgroundColor"));
  const hasVisibleBorder =
    Number.isFinite(borderWidthNumber) &&
    borderWidthNumber > 0 &&
    borderStyleValue !== "none" &&
    borderStyleValue !== "hidden";
  const boxShadowValue = getStyleValue("boxShadow").trim();
  const filterValue = getStyleValue("filter").trim();
  const hasVisibleShadow =
    boxShadowValue.length > 0 &&
    boxShadowValue.toLowerCase() !== "none";
  const hasVisibleFilter =
    filterValue.length > 0 &&
    filterValue.toLowerCase() !== "none";
  const hasEffectChanges =
    Boolean(getStyleChange("boxShadow")) ||
    Boolean(getStyleChange("filter"));
  const hasVisibleEffect = hasVisibleShadow || hasVisibleFilter || hasEffectChanges;
  const clipContent = getStyleValue("overflow") === "hidden";
  const selectedNodeChangeCount =
    propertyChanges.filter(
      (change) =>
        change.domPath === selectedNode.domPath ||
        change.nodeId === selectedNode.nodeId,
    ).length +
    configMarks.filter(
      (mark) =>
        mark.domPath === selectedNode.domPath ||
        mark.nodeId === selectedNode.nodeId,
    ).length;
  const selectedConfigMarks = configMarks.filter(
    (mark) =>
      mark.domPath === selectedNode.domPath ||
      mark.nodeId === selectedNode.nodeId,
  );
  const editingConfigMark = editingConfigChangeId
    ? configMarks.find((mark) => mark.changeId === editingConfigChangeId) ?? null
    : null;

  const getConfigMarkForSpec = (spec: Pick<PropertySpec, "property" | "kind">) =>
    configMarks.find(
      (mark) =>
        mark.changeId === getChangeId(selectedNode, spec.property, spec.kind),
    );

  const openConfigMarkEditor = (
    spec: Pick<PropertySpec, "property" | "label" | "kind">,
    value: string,
  ) => {
    const changeId = getChangeId(selectedNode, spec.property, spec.kind);
    if (!getConfigMarkForSpec(spec)) {
      onMarkConfig(selectedNode, spec.property, spec.label, value, spec.kind);
    }
    setEditingConfigChangeId(changeId);
  };

  const renderConfigMarkLabel = (
    spec: Pick<PropertySpec, "property" | "label" | "kind">,
    value: string,
    className?: string,
    displayLabel = spec.label,
  ) => {
    const active = Boolean(getConfigMarkForSpec(spec));
    return (
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full cursor-pointer items-center rounded-sm px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "",
          className,
        )}
        title={active ? "编辑配置项" : "设为配置项"}
        aria-label={`${spec.label}${active ? "编辑配置项" : "设为配置项"}`}
        onClick={() => openConfigMarkEditor(spec, value)}
      >
        {displayLabel}
      </button>
    );
  };

  const renderConfigMarkDialog = () => {
    const mark = editingConfigMark;
    const hasConflict = mark ? usedConfigKeys.includes(mark.fieldKey.trim()) : false;
    return (
      <Dialog
        open={editingConfigChangeId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingConfigChangeId(null);
        }}
      >
        <DialogContent className="max-w-sm gap-4 p-4">
          <DialogHeader>
            <DialogTitle className="text-base">配置项设置</DialogTitle>
            <DialogDescription className="text-xs">
              将当前属性交给 AI 写入配置字段，后续可在配置栏中调整。
            </DialogDescription>
          </DialogHeader>
          {mark ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs font-medium">{mark.label}</p>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {mark.kind}:{mark.property}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">配置名称</Label>
                <Input
                  value={mark.fieldTitle}
                  className="h-8 text-xs"
                  placeholder="配置名称"
                  onChange={(event) =>
                    onUpdateConfigMark(mark.id, { fieldTitle: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">字段 key</Label>
                <Input
                  value={mark.fieldKey}
                  className={cn(
                    "h-8 font-mono text-xs",
                    hasConflict ? "border-destructive focus-visible:ring-destructive" : "",
                  )}
                  placeholder="字段标识"
                  onChange={(event) =>
                    onUpdateConfigMark(mark.id, { fieldKey: event.target.value })
                  }
                />
                {hasConflict && (
                  <p className="text-xs text-destructive">
                    字段 key 与已有配置冲突，请调整后再发送。
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">默认值</Label>
                <Input
                  value={mark.defaultValue}
                  className="h-8 font-mono text-xs"
                  placeholder="默认值"
                  onChange={(event) =>
                    onUpdateConfigMark(mark.id, { defaultValue: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">分类</Label>
                <Input
                  value={mark.category ?? ""}
                  list="visual-config-mark-category-options"
                  className="h-8 text-xs"
                  placeholder="分类（可选，例如 设计）"
                  onChange={(event) =>
                    onUpdateConfigMark(mark.id, { category: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">配置范围</Label>
                <Select
                  value={mark.scope}
                  onValueChange={(value) =>
                    onUpdateConfigMark(mark.id, {
                      scope: value === "project" ? "project" : "page",
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page">页面级配置</SelectItem>
                    <SelectItem value="project">项目级配置</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
              正在创建配置项...
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={!mark}
              onClick={() => {
                if (!mark) return;
                onRemoveConfigMark(mark.id);
                setEditingConfigChangeId(null);
              }}
            >
              移除
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => setEditingConfigChangeId(null)}
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const applyArrangement = (nextArrangement: "free" | "row" | "column" | "grid") => {
    if (nextArrangement === "free") {
      applyStyleValue("display", "排列方式", "block");
      return;
    }
    if (nextArrangement === "grid") {
      applyStyleValue("display", "排列方式", "grid");
      return;
    }
    applyStyleValue("display", "排列方式", "flex");
    applyStyleValue("flexDirection", "排列方向", nextArrangement === "column" ? "column" : "row");
  };

  const applyAlignment = (justifyContent: string, alignItems: string) => {
    if (flowValue === "free") {
      applyStyleValue("display", "排列方式", "flex");
      applyStyleValue("flexDirection", "排列方向", "row");
    }
    applyStyleValue("justifyContent", "水平对齐", justifyContent);
    applyStyleValue("alignItems", "垂直对齐", alignItems);
  };

  const renderLayoutSection = () => {
    const flowOptions = [
      { value: "free", label: "自由", icon: <Square className="h-3.5 w-3.5" /> },
      { value: "row", label: "横向排列", icon: <ArrowRight className="h-3.5 w-3.5" /> },
      { value: "column", label: "纵向排列", icon: <ArrowDown className="h-3.5 w-3.5" /> },
      { value: "grid", label: "网格", icon: <Grid3X3 className="h-3.5 w-3.5" /> },
    ] as const;
    const alignmentOptions = [
      ["flex-start", "flex-start"],
      ["center", "flex-start"],
      ["flex-end", "flex-start"],
      ["flex-start", "center"],
      ["center", "center"],
      ["flex-end", "center"],
      ["flex-start", "flex-end"],
      ["center", "flex-end"],
      ["flex-end", "flex-end"],
    ] as const;

    return (
      <section key="布局" className="border-b bg-card">
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
          {getGroupIcon("布局")}
          布局
        </div>
        <div className="space-y-3 px-3 pb-3">
          <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2">
            <div className="flex items-center">
              {renderConfigMarkLabel(
                { property: "display", label: "排列方式", kind: "style" },
                getStyleValue("display") || flowValue,
                undefined,
                "排列",
              )}
            </div>
            <div className="inline-flex h-8 w-fit rounded-md border bg-muted/30 p-0.5">
              {flowOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex h-7 min-w-8 cursor-pointer items-center justify-center rounded px-2 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    flowValue === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                  title={option.label}
                  onClick={() => applyArrangement(option.value)}
                >
                  {option.icon}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[68px_minmax(0,1fr)] items-start gap-2">
            <div className="flex items-center pt-1">
              {renderConfigMarkLabel(
                { property: "justifyContent", label: "内容对齐", kind: "style" },
                alignValue,
                undefined,
                "对齐",
              )}
            </div>
            <div className="grid w-[88px] grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1">
              {alignmentOptions.map(([justifyContent, alignItems]) => {
                const active = alignValue === `${justifyContent}:${alignItems}`;
                return (
                  <button
                    key={`${justifyContent}-${alignItems}`}
                    type="button"
                    className={cn(
                      "flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                    title="设置内容对齐"
                    onClick={() => applyAlignment(justifyContent, alignItems)}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-primary" : "bg-current")} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2">
            <div className="flex items-center">
              {renderConfigMarkLabel(
                { property: "gap", label: "元素间距", kind: "style" },
                getStyleNumberValue("gap"),
                undefined,
                "间距",
              )}
            </div>
            <div className="relative">
              <Input
                value={getStyleNumberValue("gap")}
                className="h-8 pr-8 font-mono text-xs"
                onChange={(event) => applyStyleValue("gap", "元素间距", event.target.value)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                px
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2">
            <div className="flex items-center">
              {renderConfigMarkLabel(
                { property: "paddingLeft", label: "左右内边距", kind: "style" },
                paddingXValue,
                undefined,
                "内边距",
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  value={paddingXValue}
                  placeholder="左右"
                  className="h-8 pr-8 font-mono text-xs"
                  onChange={(event) => {
                    applyStyleValue("paddingLeft", "左右内边距", event.target.value);
                    applyStyleValue("paddingRight", "左右内边距", event.target.value);
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  px
                </span>
              </div>
              <div className="relative">
                <Input
                  value={paddingYValue}
                  placeholder="上下"
                  className="h-8 pr-8 font-mono text-xs"
                  onChange={(event) => {
                    applyStyleValue("paddingTop", "上下内边距", event.target.value);
                    applyStyleValue("paddingBottom", "上下内边距", event.target.value);
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  px
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2">
            <div className="flex items-center">
              {renderConfigMarkLabel(
                { property: "overflow", label: "裁剪内容", kind: "style" },
                clipContent ? "hidden" : "visible",
                undefined,
                "裁剪",
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={clipContent}
                onCheckedChange={(checked) =>
                  applyStyleValue("overflow", "裁剪内容", checked ? "hidden" : "visible")
                }
              />
              <span className="text-xs text-muted-foreground">隐藏超出内容</span>
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderAppearanceSection = () => {
    const applyUniformRadius = (value: string) => {
      if (hasCornerRadiusChanges) {
        cornerRadiusFields.forEach((field) => applyStyleValue(field.property, field.label, value));
      }
      applyStyleValue("borderRadius", "圆角", value);
    };

    return (
      <section key="外观" className="border-b bg-card">
        <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
          {getGroupIcon("外观")}
          外观
        </div>
        <div className="space-y-2 px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center">
                {renderConfigMarkLabel(
                  { property: "opacity", label: "不透明度", kind: "style" },
                  getOpacityValue(),
                  "text-[11px]",
                )}
              </div>
              <div className="relative">
                <Blend className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={getOpacityValue()}
                  className="h-8 pr-7 pl-7 font-mono text-xs"
                  onChange={(event) => applyStyleValue("opacity", "不透明度", event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center">
                  {renderConfigMarkLabel(
                    { property: "borderRadius", label: "圆角", kind: "style" },
                    uniformRadiusValue,
                    "text-[11px]",
                  )}
                </div>
                <button
                  type="button"
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={cornerRadiusExpanded ? "合并四角圆角" : "单独设置四角圆角"}
                  onClick={() => setCornerRadiusExpanded((value) => !value)}
                >
                  {cornerRadiusExpanded ? <Link2 className="h-3.5 w-3.5" /> : <Radius className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="relative">
                <Radius className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={uniformRadiusValue}
                  placeholder={cornerRadiusExpanded ? "混合" : "0"}
                  className="h-8 pr-7 pl-7 font-mono text-xs"
                  onChange={(event) => applyUniformRadius(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  px
                </span>
              </div>
            </div>
          </div>

          {cornerRadiusExpanded && (
            <div className="grid grid-cols-2 gap-2">
              {cornerRadiusFields.map((field) => (
                <div key={field.property} className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {field.icon}
                  </span>
                  <Input
                    value={getStyleNumberValue(field.property) || fallbackRadiusValue}
                    className="h-8 pr-7 pl-7 font-mono text-xs"
                    onChange={(event) => applyStyleValue(field.property, field.label, event.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                    px
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderBorderSection = () => {
    const addBorder = () => {
      applyStyleValue("borderStyle", "边框样式", "solid");
      applyStyleValue("borderWidth", "边框宽度", "1");
      applyStyleValue("borderColor", "边框颜色", colorToHex(getStyleValue("borderColor")));
    };

    return (
      <section key="边框" className="border-b bg-card">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            {getGroupIcon("边框")}
            边框
          </div>
          {!hasVisibleBorder && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="添加边框"
              onClick={addBorder}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {hasVisibleBorder && (
          <div className="space-y-2 px-3 pb-3">
            <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2">
              <div className="flex items-center">
                {renderConfigMarkLabel(
                  { property: "borderColor", label: "边框颜色", kind: "style" },
                  getStyleValue("borderColor"),
                  undefined,
                  "颜色",
                )}
              </div>
              <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-2">
                <Input
                  type="color"
                  value={colorToHex(getStyleValue("borderColor"))}
                  className="h-8 cursor-pointer p-1"
                  onChange={(event) => applyStyleValue("borderColor", "边框颜色", event.target.value)}
                />
                <Input
                  value={formatColorInputValue(getStyleValue("borderColor"))}
                  className="h-8 font-mono text-xs"
                  onChange={(event) =>
                    applyStyleValue("borderColor", "边框颜色", normalizeColorInputValue(event.target.value))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2">
              <div className="flex items-center">
                {renderConfigMarkLabel(
                  { property: "borderWidth", label: "边框宽度", kind: "style" },
                  borderWidthValue,
                  undefined,
                  "宽度",
                )}
              </div>
              <div className="relative">
                <Input
                  value={borderWidthValue}
                  className="h-8 pr-8 font-mono text-xs"
                  onChange={(event) => applyStyleValue("borderWidth", "边框宽度", event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                  px
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderBackgroundSection = () => {
    const addBackground = () => {
      applyStyleValue("backgroundColor", "背景颜色", "#FFFFFF");
    };
    const spec = BACKGROUND_SPECS[0];
    const changeId = getChangeId(selectedNode, spec.property, spec.kind);
    const currentValue = getCurrentValue(selectedNode, spec);
    const change = propertyChanges.find((item) => item.id === changeId);
    const value = change?.value ?? currentValue;
    const displayValue = formatColorInputValue(value);

    return (
      <section key="背景" className="border-b bg-card">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            {getGroupIcon("背景")}
            背景
          </div>
          {!hasBackgroundColor && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="添加背景"
              onClick={addBackground}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {hasBackgroundColor && (
          <div className="px-3 pb-3">
            <div className="grid grid-cols-[68px_minmax(0,1fr)_60px] items-center gap-2">
              <div className="flex items-center">
                {renderConfigMarkLabel(spec, value, undefined, "颜色")}
              </div>
              <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-2">
                <Input
                  type="color"
                  value={colorToHex(value)}
                  className="h-8 cursor-pointer p-1"
                  onChange={(event) =>
                    onPropertyChange(
                      selectedNode,
                      spec.property,
                      spec.label,
                      event.target.value,
                      spec.kind,
                      currentValue || undefined,
                    )
                  }
                />
                <Input
                  value={displayValue}
                  className="h-8 font-mono text-xs"
                  onChange={(event) =>
                    onPropertyChange(
                      selectedNode,
                      spec.property,
                      spec.label,
                      normalizeColorInputValue(event.target.value),
                      spec.kind,
                      currentValue || undefined,
                    )
                  }
                />
              </div>
              <div className="flex items-center justify-end gap-1">
                {change && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="恢复此项"
                    onClick={() => onRestoreProperty(change.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderEffectSection = () => {
    const addEffect = () => {
      applyStyleValue("boxShadow", "阴影", "0 8px 24px rgba(0, 0, 0, 0.16)");
    };

    return (
      <section key="阴影与模糊" className="border-b bg-card">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            {getGroupIcon("阴影与模糊")}
            阴影与模糊
          </div>
          {!hasVisibleEffect && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="添加阴影"
              onClick={addEffect}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {hasVisibleEffect && (
          <div className="space-y-2 px-3 pb-3">
            {EFFECT_SPECS.map((spec) => {
              const changeId = getChangeId(selectedNode, spec.property, spec.kind);
              const currentValue = getCurrentValue(selectedNode, spec);
              const change = propertyChanges.find((item) => item.id === changeId);
              const value = change?.value ?? currentValue;

              return (
                <div
                  key={`${spec.kind}-${spec.property}-${spec.label}`}
                  className="grid grid-cols-[68px_minmax(0,1fr)_30px] items-center gap-2"
                >
                  <div className="flex items-center">
                    {renderConfigMarkLabel(spec, value)}
                  </div>
                  <Input
                    value={value}
                    placeholder={spec.placeholder}
                    className="h-8 font-mono text-xs"
                    onChange={(event) =>
                      onPropertyChange(
                        selectedNode,
                        spec.property,
                        spec.label,
                        event.target.value,
                        spec.kind,
                        currentValue || undefined,
                      )
                    }
                  />
                  <div className="flex items-center justify-end gap-1">
                    {change && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="恢复此项"
                        onClick={() => onRestoreProperty(change.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-medium">属性编辑</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={selectedNodeChangeCount === 0}
          onClick={onClearChanges}
        >
          清空
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <datalist id="visual-config-mark-category-options">
            {BUILT_IN_CONFIG_CATEGORIES.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <section className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Bolt className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">AI 修改说明</Label>
            </div>
            <Textarea
              value={aiInstruction}
              className="min-h-[84px] resize-none text-xs"
              placeholder="补充本次属性修改的意图，或只描述选中元素希望达到的效果。"
              onChange={(event) => onAiInstructionChange(event.target.value)}
            />
          </section>

          {selectedConfigMarks.length > 0 && (
            <section className="space-y-2">
              {selectedConfigMarks.map((mark) => {
                const hasConflict = usedConfigKeys.includes(mark.fieldKey.trim());
                return (
                  <div
                    key={mark.id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2 rounded-md border bg-muted/20 p-2",
                      hasConflict ? "border-destructive/70" : "",
                    )}
                  >
                    <button
                      type="button"
                      className="grid min-w-0 cursor-pointer grid-cols-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${mark.fieldTitle || mark.label} ${mark.fieldKey || "未命名"} 编辑配置项`}
                      onClick={() => setEditingConfigChangeId(mark.changeId)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {mark.fieldTitle || mark.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {mark.fieldKey || "未填写 key"} · {mark.scope === "project" ? "项目级配置" : "页面级配置"}
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="移除配置标记"
                      onClick={() => onRemoveConfigMark(mark.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </section>
          )}

          {specsBySection.map(([section, specs]) => {
            if (section === "布局") return renderLayoutSection();
            if (section === "外观") return renderAppearanceSection();
            if (section === "背景") return renderBackgroundSection();
            if (section === "边框") return renderBorderSection();
            if (section === "阴影与模糊") return renderEffectSection();
            return (
              <section key={section} className="border-b bg-card">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    {getGroupIcon(section)}
                    {section}
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <div className="grid gap-2">
                    {specs.map((spec) => {
                      const changeId = getChangeId(selectedNode, spec.property, spec.kind);
                      const currentValue = getCurrentValue(selectedNode, spec);
                      const change = propertyChanges.find((item) => item.id === changeId);
                      const value = change?.value ?? currentValue;
                      const controlValue = getDisplayValue(value, spec);
                      return (
                        <div
                          key={`${spec.kind}-${spec.property}-${spec.label}`}
                          className={cn(
                            "grid gap-2",
                            spec.input === "textarea"
                              ? "grid-cols-1"
                              : "grid-cols-[68px_minmax(0,1fr)_30px] items-center",
                          )}
                        >
                          <div className="flex items-center">
                            {renderConfigMarkLabel(spec, value)}
                          </div>
                      <div className="min-w-0">
                        {spec.input === "textarea" ? (
                          <Textarea
                            value={controlValue}
                            className="min-h-[64px] resize-none text-xs"
                            onChange={(event) =>
                              onPropertyChange(
                                selectedNode,
                                spec.property,
                                spec.label,
                                event.target.value,
                                spec.kind,
                                currentValue || undefined,
                              )
                            }
                          />
                        ) : spec.input === "readonly" ? (
                          <div className="flex h-8 items-center rounded-md border bg-muted/30 px-2 font-mono text-xs text-muted-foreground">
                            <span className="min-w-0 flex-1 truncate">{controlValue || "自动"}</span>
                            {spec.unit && <span className="ml-1 text-[10px]">{spec.unit}</span>}
                          </div>
                        ) : spec.input === "segmented" ? (
                          <div className="inline-flex h-8 rounded-md border bg-muted/30 p-0.5">
                            {(spec.options ?? []).map((option) => {
                              const active = value === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={cn(
                                    "flex h-7 min-w-8 cursor-pointer items-center justify-center rounded px-2 text-xs transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                                  )}
                                  title={option.label}
                                  onClick={() =>
                                    onPropertyChange(
                                      selectedNode,
                                      spec.property,
                                      spec.label,
                                      option.value,
                                      spec.kind,
                                      currentValue || undefined,
                                    )
                                  }
                                >
                                  {option.icon ?? option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : spec.input === "select" ? (
                          <Select
                            value={value}
                            onValueChange={(nextValue) =>
                              onPropertyChange(
                                selectedNode,
                                spec.property,
                                spec.label,
                                nextValue,
                                spec.kind,
                                currentValue || undefined,
                              )
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="选择" />
                            </SelectTrigger>
                            <SelectContent>
                              {(spec.options ?? []).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : spec.input === "color" ? (
                          <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-2">
                            <Input
                              type="color"
                              value={colorToHex(value)}
                              className="h-8 cursor-pointer p-1"
                              onChange={(event) =>
                                onPropertyChange(
                                  selectedNode,
                                  spec.property,
                                  spec.label,
                                  event.target.value,
                                  spec.kind,
                                  currentValue || undefined,
                                )
                              }
                            />
                            <Input
                              value={formatColorInputValue(value)}
                              className="h-8 font-mono text-xs"
                              onChange={(event) =>
                                onPropertyChange(
                                  selectedNode,
                                  spec.property,
                                  spec.label,
                                  normalizeColorInputValue(event.target.value),
                                  spec.kind,
                                  currentValue || undefined,
                                )
                              }
                            />
                          </div>
                        ) : spec.input === "file" ? (
                          <div className="space-y-1">
                            <Input
                              type="file"
                              accept="image/*"
                              className="h-8 text-xs"
                              disabled={uploadingChangeId === changeId}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                void uploadImageReplacement(file, changeId, (nextValue, resource) => {
                                  onPropertyChange(
                                    selectedNode,
                                    spec.property,
                                    "替换图片",
                                    nextValue,
                                    spec.kind,
                                    currentValue || undefined,
                                    resource,
                                  );
                                });
                              }}
                            />
                            {uploadingChangeId === changeId && (
                              <p className="text-[11px] text-muted-foreground">正在保存到资源目录...</p>
                            )}
                            {uploadError && (
                              <p className="text-[11px] text-muted-foreground">{uploadError}</p>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              type="text"
                              value={controlValue}
                              placeholder={spec.placeholder}
                              className={cn("h-8 font-mono text-xs", spec.unit ? "pr-8" : "")}
                              onChange={(event) =>
                                onPropertyChange(
                                  selectedNode,
                                  spec.property,
                                  spec.label,
                                  event.target.value,
                                  spec.kind,
                                  currentValue || undefined,
                                )
                              }
                            />
                            {spec.unit && (
                              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
                                {spec.unit}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={cn(
                        "flex items-center justify-end gap-1",
                        spec.input === "textarea" ? "col-start-1" : "",
                      )}>
                        {spec.input !== "readonly" && (
                          <>
                          {change && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="恢复此项"
                              onClick={() => onRestoreProperty(change.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          </>
                        )}
                        </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </section>
              );
            })}
        </div>
      </ScrollArea>

      {renderConfigMarkDialog()}
    </div>
  );
}
