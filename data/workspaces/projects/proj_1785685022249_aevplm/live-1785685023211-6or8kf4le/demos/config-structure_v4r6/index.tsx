interface DemoProps {
  title: string;
  price: number;
  stock: number;
  enabled: boolean;
  desc: string;
}

const TYPE_BADGES = ["string", "number", "integer", "boolean", "text"];

export default function ConfigBasics({
  title,
  price,
  stock,
  enabled,
  desc,
}: DemoProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-indigo-50/70 px-5 pb-12 pt-8 font-sans text-slate-800">
      <header className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-indigo-500">
          CONFIG TYPES DEMO
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">基础字段类型</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TYPE_BADGES.map((t) => (
            <span
              key={t}
              className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          在右侧配置面板修改字段，页面内容实时联动
        </p>
      </header>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">活动标题</h2>
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
            string
          </span>
        </div>
        <p className="text-lg font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-[11px] text-slate-400">单行文本，默认「夏日清凉大促」</p>
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">优惠价格</h2>
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
            number
          </span>
        </div>
        <p className="text-2xl font-extrabold text-emerald-600">¥{price}</p>
        <p className="mt-1 text-[11px] text-slate-400">浮点数，支持小数</p>
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">库存数量</h2>
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
            integer
          </span>
        </div>
        <p className="text-lg font-bold text-slate-900">
          {stock}
          <span className="ml-1 text-xs font-medium text-slate-400">件</span>
        </p>
        <p className="mt-1 text-[11px] text-slate-400">整数，步进调节</p>
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">是否开启</h2>
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
            boolean
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
          <span className="text-sm font-medium text-slate-600">
            {enabled ? "已开启" : "已关闭"}
          </span>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">活动描述</h2>
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
            text
          </span>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{desc}</p>
      </section>
    </div>
  );
}
