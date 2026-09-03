interface DemoProps {
  style: string;
  tags: string[];
  region: string[];
}

const TYPE_BADGES = ["enum", "enum 多选", "cascade"];

const STYLE_META: Record<
  string,
  { label: string; desc: string; cardCls: string; btnCls: string }
> = {
  minimal: {
    label: "极简",
    desc: "干净留白，黑白灰主色",
    cardCls: "bg-white text-slate-800 ring-1 ring-slate-200",
    btnCls: "bg-slate-900 text-white",
  },
  festival: {
    label: "节日",
    desc: "多彩渐变，活泼喜庆",
    cardCls:
      "bg-gradient-to-br from-rose-500 via-orange-400 to-amber-300 text-white",
    btnCls: "bg-white text-rose-600",
  },
  luxury: {
    label: "奢华",
    desc: "深色金调，高端质感",
    cardCls: "bg-slate-900 text-amber-300 ring-1 ring-amber-400/60",
    btnCls: "bg-amber-400 text-slate-900",
  },
};

const TAG_META: Record<string, string> = {
  discount: "折扣",
  new: "新品",
  hot: "热门",
  limited: "限量",
};

const REGION_OPTIONS: {
  value: string;
  label: string;
  children: { value: string; label: string }[];
}[] = [
  {
    value: "beijing",
    label: "北京",
    children: [
      { value: "chaoyang", label: "朝阳" },
      { value: "haidian", label: "海淀" },
    ],
  },
  {
    value: "zhejiang",
    label: "浙江",
    children: [
      { value: "hangzhou", label: "杭州" },
      { value: "ningbo", label: "宁波" },
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

function regionLabel(path: string[]): string {
  if (!path || path.length === 0) return "未选择";
  const parent = REGION_OPTIONS.find((o) => o.value === path[0]);
  if (!parent) return path.join(" / ");
  const child = parent.children.find((c) => c.value === path[1]);
  return child ? `${parent.label} / ${child.label}` : parent.label;
}

export default function ConfigChoice({ style, tags, region }: DemoProps) {
  const meta = STYLE_META[style] ?? STYLE_META.festival;
  return (
    <div className="min-h-screen bg-slate-50 px-5 pb-12 pt-8 font-sans text-slate-800">
      <header className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-amber-500">
          CONFIG TYPES DEMO
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">选择类类型</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TYPE_BADGES.map((t) => (
            <span
              key={t}
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">单选、多选与级联选择的联动展示</p>
      </header>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">视觉风格</h2>
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            enum
          </span>
        </div>
        <div
          className={`rounded-2xl p-5 ${meta.cardCls} transition-all`}
        >
          <p className="text-lg font-bold">{meta.label}风格</p>
          <p className="mt-1 text-xs opacity-80">{meta.desc}</p>
          <span
            className={`mt-4 inline-block rounded-full px-4 py-1.5 text-xs font-semibold ${meta.btnCls}`}
          >
            进入活动
          </span>
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">活动标签</h2>
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            enum 多选
          </span>
        </div>
        {tags.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">未选择标签</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700"
              >
                {TAG_META[t] ?? t}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">投放地区</h2>
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            cascade
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3">
          <span className="text-lg">📍</span>
          <span className="text-sm font-semibold text-slate-700">
            {regionLabel(region)}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          两级级联（省 / 市），当前路径：{region.join(" → ")}
        </p>
      </section>
    </div>
  );
}
