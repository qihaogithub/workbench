import { Crepe, type CrepeConfig } from "@milkdown/crepe";
import type {
  ConfigReferenceCandidate,
  DocumentUploadHandler,
} from "../DocumentEditor";
import { HEADING_STYLE_OPTIONS } from "./heading-style-toolbar";

const videoIcon = '<span aria-hidden="true">▶</span>';
const attachmentIcon = '<span aria-hidden="true">⌕</span>';
const referenceIcon = '<span aria-hidden="true">@</span>';

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
  enableUploads?: boolean;
  referenceCandidates?: ConfigReferenceCandidate[];
  enableProjectReferences?: boolean;
}

export function buildCrepeConfig({
  placeholder,
  actions,
  enableUploads = false,
  referenceCandidates = [],
  enableProjectReferences = false,
}: BuildCrepeConfigOptions): Pick<CrepeConfig, "features" | "featureConfigs"> {
  return {
    features: {
      [Crepe.Feature.Cursor]: true,
      [Crepe.Feature.ListItem]: true,
      [Crepe.Feature.LinkTooltip]: true,
      [Crepe.Feature.ImageBlock]: true,
      [Crepe.Feature.BlockEdit]: true,
      [Crepe.Feature.Placeholder]: true,
      [Crepe.Feature.Toolbar]: true,
      [Crepe.Feature.CodeMirror]: true,
      [Crepe.Feature.Table]: true,
      [Crepe.Feature.Latex]: false,
      [Crepe.Feature.TopBar]: true,
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
        headingOptions: HEADING_STYLE_OPTIONS,
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: "文本",
          text: { label: "正文" },
          h1: { label: "H1" },
          h2: { label: "H2" },
          h3: { label: "H3" },
          h4: { label: "H4" },
          h5: { label: "H5" },
          h6: { label: "H6" },
          quote: { label: "引用" },
          divider: { label: "分隔线" },
        },
        listGroup: {
          label: "列表",
          bulletList: { label: "无序列表" },
          orderedList: { label: "有序列表" },
          taskList: { label: "任务列表" },
        },
        advancedGroup: {
          label: "插入",
          image: { label: "图片" },
          codeBlock: { label: "代码块" },
          table: { label: "表格" },
          math: null,
        },
        buildMenu(builder) {
          if (referenceCandidates.length > 0) {
            const group = builder.addGroup("project-references", "引用配置项");
            referenceCandidates.forEach((candidate) => {
              group.addItem(`reference-${candidate.key}`, {
                label: candidate.label,
                icon: referenceIcon,
                onRun: () => actions.insertReference(candidate),
              });
            });
          }

          if (enableProjectReferences && actions.openProjectReference) {
            builder
              .addGroup("entity-references", "插入项目引用")
              .addItem("insert-project-reference", {
                label: "选择项目 / 页面 / 文档",
                icon: referenceIcon,
                onRun: actions.openProjectReference,
              });
          }

          if (enableUploads) {
            builder
              .addGroup("project-uploads", "上传")
              .addItem("upload-video", {
                label: "上传视频",
                icon: videoIcon,
                onRun: actions.uploadVideo,
              })
              .addItem("upload-file", {
                label: "上传附件",
                icon: attachmentIcon,
                onRun: actions.uploadFile,
              });
          }
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
