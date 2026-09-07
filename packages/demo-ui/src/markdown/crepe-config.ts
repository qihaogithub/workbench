import { Crepe, type CrepeConfig } from "@milkdown/crepe";
import type { Ctx } from "@milkdown/kit/ctx";
import type {
  ConfigReferenceCandidate,
  DocumentUploadHandler,
} from "../DocumentEditor";
import { PRIMARY_HEADING_STYLE_OPTIONS } from "./heading-style-toolbar";
import { documentHeadingMenuApi } from "./document-heading-menu";

export interface CrepeProjectActions {
  uploadImage: (file: File) => Promise<string>;
  uploadVideo: () => void;
  uploadFile: () => void;
  insertReference: (candidate: ConfigReferenceCandidate) => void;
  /** Opens the typed project/page/document reference picker at the cursor. */
  openProjectReference?: () => void;
}

interface BuildCrepeConfigOptions {
  placeholder: string;
  actions: CrepeProjectActions;
  /** 是否显示固定顶部格式工具栏；选区浮动工具栏由 Toolbar 特性独立控制。 */
  showTopBar?: boolean;
}

export function buildCrepeConfig({
  placeholder,
  actions,
  showTopBar = true,
}: BuildCrepeConfigOptions): Pick<CrepeConfig, "features" | "featureConfigs"> {
  return {
    features: {
      [Crepe.Feature.Cursor]: true,
      [Crepe.Feature.ListItem]: true,
      [Crepe.Feature.LinkTooltip]: true,
      [Crepe.Feature.ImageBlock]: true,
      [Crepe.Feature.BlockEdit]: false,
      [Crepe.Feature.Placeholder]: true,
      [Crepe.Feature.Toolbar]: false,
      [Crepe.Feature.CodeMirror]: true,
      [Crepe.Feature.Table]: true,
      [Crepe.Feature.Latex]: false,
      [Crepe.Feature.TopBar]: showTopBar,
      [Crepe.Feature.AI]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: placeholder,
        mode: "doc",
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: actions.uploadImage,
        blockUploadButton: "上传图片",
        inlineUploadButton: "上传图片",
        blockCaptionPlaceholderText: "添加图片说明",
        blockUploadPlaceholderText: "或粘贴图片地址",
        inlineUploadPlaceholderText: "或粘贴图片地址",
      },
      [Crepe.Feature.TopBar]: {
        headingOptions: PRIMARY_HEADING_STYLE_OPTIONS,
        buildTopBar(builder) {
          builder
            .getGroup("heading")
            .clear()
            .addItem("document-heading", {
              icon: "<span data-document-heading-trigger>正文 ▾</span>",
              active: () => false,
              onRun: (ctx: Ctx) => ctx.get(documentHeadingMenuApi.key).toggle(),
            });
        },
      },
    },
  };
}

export async function uploadImage(
  handler: DocumentUploadHandler | undefined,
  file: File,
): Promise<string> {
  if (!handler) return URL.createObjectURL(file);
  const result = await handler(file);
  if (result.kind !== "image") {
    throw new Error("请选择图片文件");
  }
  return result.url;
}
