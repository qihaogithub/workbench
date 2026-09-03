interface DemoProps {
  brandName?: string
  badgeText?: string
  heroAccent?: string
  primaryButtonText?: string
  storyTitle?: string
  accentColor?: string
  buttonBg?: string
}

export default function SunnyReading({
  brandName = '晨光阅读屋',
  badgeText = '今日开放',
  heroAccent = '打开一扇窗。',
  primaryButtonText = '开始今日共读',
  storyTitle = '云朵邮差',
  accentColor = '#df765b',
  buttonBg = '#e06050',
}: DemoProps) {
  return (
    <main className="min-h-[100dvh] bg-[#fff8ed] px-5 py-5 text-[#20344a] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-[#e9d8bd] pb-4">
          <div className="flex items-center gap-2 text-sm font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#ffcf58] text-base">✦</span>
            {brandName}
          </div>
          <span className="rounded-full bg-[#e6f2ed] px-3 py-1 text-xs font-bold text-[#39715d]">{badgeText}</span>
        </header>

        <section className="grid items-center gap-10 py-14 md:grid-cols-[1.05fr_.95fr] md:py-20">
          <div>
            <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[#d57758]">亲子阅读实验室</p>
            <h1 className="max-w-xl text-5xl font-black leading-[0.98] tracking-[-0.07em] sm:text-7xl">
              读一个故事，<br /><span style={{ color: accentColor }}>{heroAccent}</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[#6d7d87]">用15分钟的共读时光，陪孩子练习想象、表达和倾听。</p>
            <button className="mt-8 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-[0_5px_0_#b84a3d] transition-transform hover:-translate-y-1 active:translate-y-0" style={{ backgroundColor: buttonBg }}>{primaryButtonText} <span className="ml-3">↗</span></button>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[2rem] bg-[#b8dfe0] p-7 shadow-[10px_12px_0_#f0cf91]">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#ffcf58]" />
            <div className="absolute bottom-8 left-8 h-28 w-28 rounded-full bg-[#ef8b72]" />
            <div className="relative flex h-full flex-col justify-between rounded-[1.5rem] border-2 border-dashed border-[#39715d]/40 bg-[#edf8f2]/70 p-6">
              <span className="text-5xl">☀</span>
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#39715d]">今日故事</p><p className="mt-2 text-3xl font-black tracking-tight">{storyTitle}</p></div>
              <p className="text-sm font-bold text-[#39715d]">适合 4-7 岁</p>
            </div>
          </div>
        </section>

        <section className="border-t border-[#e9d8bd] py-10">
          <h2 className="text-2xl font-black tracking-tight">今天会收获什么？</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[['01', '听故事', '给想象力一块柔软的土壤。'], ['02', '说一说', '把心里的画面讲给家人听。'], ['03', '做一做', '用一张纸完成故事小任务。']].map(([number, title, body]) => (
              <article key={number} className="rounded-2xl border border-[#e9d8bd] bg-white/60 p-5">
                <span className="text-xs font-extrabold text-[#d57758]">{number}</span>
                <h3 className="mt-8 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6d7d87]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-[#e9d8bd] py-5 text-xs text-[#7f8c91]"><span className="font-bold text-[#20344a]">{brandName}</span><span>让每天的故事，都有一点光。</span></footer>
      </div>
    </main>
  )
}