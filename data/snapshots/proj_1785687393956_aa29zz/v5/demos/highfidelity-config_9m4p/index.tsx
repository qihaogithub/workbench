interface Position {
  x: number;
  y: number;
}

interface BannerModule {
  type: "banner";
  imageUrl?: string;
  text?: string;
}

interface MediaModule {
  type: "media";
  pic?: string;
  caption?: string;
}

interface ProgressModule {
  type: "progress";
  label?: string;
  percent?: number;
}

type ModuleItem = BannerModule | MediaModule | ProgressModule;

interface DemoProps {
  title?: string;
  subtitle?: string;
  modules?: ModuleItem[];
  gallery?: string[];
  article?: string;
  region?: string[];
  tags?: string[];
  floatText?: string;
  floatPos?: Position;
  /** config.schema.json 顶层分组（标题区） */
  标题区?: { title?: string; subtitle?: string };
  /** config.schema.json 顶层分组（模块列表） */
  模块列表?: { modules?: ModuleItem[] };
  /** config.schema.json 顶层分组（图片画廊） */
  图片画廊?: { gallery?: string[] };
  /** config.schema.json 顶层分组（富文本） */
  富文本?: { article?: string };
  /** config.schema.json 顶层分组（级联选择） */
  级联选择?: { region?: string[] };
  /** config.schema.json 顶层分组（多选标签） */
  多选标签?: { tags?: string[] };
  /** config.schema.json 顶层分组（定位元素） */
  定位元素?: { floatText?: string; floatPos?: Position };
}

const TAG_MAP: Record<string, string> = {
  tech: "科技",
  design: "设计",
  music: "音乐",
  sports: "运动",
};

const REGION_OPTIONS: { value: string; label: string; children?: { value: string; label: string }[] }[] = [
  {
    value: "zhejiang",
    label: "浙江",
    children: [
      { value: "hangzhou", label: "杭州" },
      { value: "ningbo", label: "宁波" },
    ],
  },
  {
    value: "jiangsu",
    label: "江苏",
    children: [
      { value: "nanjing", label: "南京" },
      { value: "suzhou", label: "苏州" },
    ],
  },
  {
    value: "guangdong",
    label: "广东",
    children: [
      { value: "guangzhou", label: "广州" },
      { value: "shenzhen", label: "深圳" },
    ],
  },
];

const DEFAULT_BANNER_IMG = "/api/images/img__3I8yQBnAyUtHA";
const DEFAULT_PIC = "/api/images/img_GwsXRx4Q2c0A0g";

const DEFAULT_MODULES: ModuleItem[] = [
  { type: "banner", imageUrl: DEFAULT_BANNER_IMG, text: "欢迎光临" },
  { type: "media", pic: DEFAULT_PIC, caption: "图文模块说明" },
  { type: "progress", label: "完成进度", percent: 72 },
];

const DEFAULT_GALLERY: string[] = [
  "/api/images/img__3I8yQBnAyUtHA",
  "/api/images/img_GwsXRx4Q2c0A0g",
  "/api/images/img_TAHdeo7PUJQMmg",
  "/api/images/img_y3J3ubDJMTF5qw",
];

function regionLabel(path: string[]): string {
  const [p, c] = path;
  const group = REGION_OPTIONS.find((o) => o.value === p);
  if (!group) return path.join(" / ");
  const child = group.children?.find((o) => o.value === c);
  return child ? `${group.label} / ${child.label}` : group.label;
}

export default function HighFidelityConfigDemo(props: DemoProps) {
  console.log("[highfidelity-config] props =", JSON.stringify(props));
  const raw = props as Record<string, unknown>;
  const headerGroup = (raw["标题区"] as Record<string, unknown>) || {};
  const modulesGroup = (raw["模块列表"] as Record<string, unknown>) || {};
  const galleryGroup = (raw["图片画廊"] as Record<string, unknown>) || {};
  const richtextGroup = (raw["富文本"] as Record<string, unknown>) || {};
  const cascadeGroup = (raw["级联选择"] as Record<string, unknown>) || {};
  const tagsGroup = (raw["多选标签"] as Record<string, unknown>) || {};
  const positionGroup = (raw["定位元素"] as Record<string, unknown>) || {};

  const title = (raw.title as string) || headerGroup.title || "高保真页配置演示";
  const subtitle = (raw.subtitle as string) || headerGroup.subtitle || "仅高保真页面支持的复合配置类型";
  const modules = (
    Array.isArray(raw.modules)
      ? raw.modules
      : Array.isArray(modulesGroup.modules)
        ? modulesGroup.modules
        : DEFAULT_MODULES
  ) as ModuleItem[];
  const gallery = (
    Array.isArray(raw.gallery)
      ? raw.gallery
      : Array.isArray(galleryGroup.gallery)
        ? galleryGroup.gallery
        : DEFAULT_GALLERY
  ) as string[];
  const article = (raw.article as string) || richtextGroup.article || "";
  const region = (
    Array.isArray(raw.region)
      ? raw.region
      : Array.isArray(cascadeGroup.region)
        ? cascadeGroup.region
        : ["zhejiang", "hangzhou"]
  ) as string[];
  const tags = (
    Array.isArray(raw.tags)
      ? raw.tags
      : Array.isArray(tagsGroup.tags)
        ? tagsGroup.tags
        : ["tech", "design"]
  ) as string[];
  const floatText = (raw.floatText as string) || positionGroup.floatText || "拖动我";
  const floatPos = (raw.floatPos as Position) || positionGroup.floatPos || { x: 24, y: 24 };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[375px] bg-gray-100 pb-8">
      <header className="bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-500 px-6 pb-7 pt-10 text-center text-white">
        <p className="mb-3 inline-block rounded-full border border-white/40 bg-white/10 px-3 py-0.5 text-[11px] font-semibold tracking-[2px]">
          HIGH-FIDELITY
        </p>
        <h1 className="text-2xl font-bold tracking-wide">{title}</h1>
        <p className="mt-2 text-[13px] opacity-85">{subtitle}</p>
      </header>

      <main className="flex flex-col gap-4 px-4 pt-5">
        {/* array 模块数组 + sortable + maxItems */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gray-500">
            <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">array · 模块数组</span>
            <code className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-400">modules</code>
            <span className="ml-auto text-[11px] font-normal text-gray-400">可拖拽排序 / 限量</span>
          </h2>
          <div className="flex flex-col gap-3">
            {modules.map((module, index) => {
              switch (module.type) {
                case "banner":
                  return (
                    <div key={index} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                      <div className="relative h-[150px] w-full overflow-hidden">
                        <img className="block h-full w-full object-cover" src={module.imageUrl || DEFAULT_BANNER_IMG} alt="横幅模块" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-4 pb-3 pt-8">
                          <span className="text-lg font-semibold text-white">{module.text}</span>
                        </div>
                      </div>
                    </div>
                  );
                case "media":
                  return (
                    <div key={index} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                      <img className="block h-[130px] w-full object-cover" src={module.pic || DEFAULT_PIC} alt="图文模块" />
                      <p className="px-4 py-3 text-center text-[13px] text-gray-500">{module.caption}</p>
                    </div>
                  );
                case "progress":
                  return (
                    <div key={index} className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
                      <div className="mb-2 flex items-center justify-between text-[13px]">
                        <span className="text-gray-600">{module.label}</span>
                        <span className="font-bold text-indigo-500">{module.percent ?? 0}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                          style={{ width: `${Math.min(100, Math.max(0, module.percent ?? 0))}%` }}
                        />
                      </div>
                    </div>
                  );
                default:
                  return (
                    <div key={index} className="rounded-xl bg-white px-4 py-5 text-center text-sm text-gray-400">
                      未知模块类型
                    </div>
                  );
              }
            })}
          </div>
        </section>

        {/* imageList 图片画廊 */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gray-500">
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">imageList · 多图</span>
            <code className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-400">gallery</code>
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              {gallery.map((src, index) => (
                <img
                  key={index}
                  className="h-[110px] w-full rounded-lg object-cover"
                  src={src}
                  alt={`画廊图片 ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* richtext 富文本 */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gray-500">
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">richtext · 富文本</span>
            <code className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-400">article</code>
          </h2>
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
            <div
              className="max-w-none text-[14px] leading-relaxed text-gray-700 [&_h3]:mb-2 [&_h3]:text-[16px] [&_h3]:font-bold [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-bold"
              dangerouslySetInnerHTML={{ __html: article }}
            />
          </div>
        </section>

        {/* cascade 级联选择 */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gray-500">
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700">cascade · 级联</span>
            <code className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-400">region</code>
          </h2>
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-gray-400">当前地区</span>
              <span className="rounded-full bg-purple-50 px-3 py-1 text-[13px] font-semibold text-purple-600">
                {regionLabel(region)}
              </span>
            </div>
          </div>
        </section>

        {/* enum 多选 */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gray-500">
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">enum · 多选</span>
            <code className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-400">tags</code>
          </h2>
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full bg-indigo-50 px-3 py-1 text-[13px] font-medium text-indigo-600">
                  {TAG_MAP[tag] || tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* position 拖拽定位 */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gray-500">
            <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-semibold text-white">position · 定位</span>
            <code className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-400">floatPos</code>
            <span className="ml-auto text-[11px] font-normal text-gray-400">配置面板可拖动</span>
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="relative h-[200px] w-full rounded-xl bg-gray-50">
              <div
                data-pos-key="floatBadge"
                className="absolute select-none whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md"
                style={{ left: floatPos.x, top: floatPos.y, background: "#6366f1", cursor: "move" }}
              >
                {floatText}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
