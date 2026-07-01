// 代码化还原版本：保留 JSX，由创作端预览编译器统一转换；已去除 TypeScript 类型语法。
const page = {
    "n": 3,
    "id": "prototype-03",
    "title": "任务中心-活动入口",
    "kind": "taskCenter",
    "accent": "slate",
    "hero": "任务中心",
    "subtitle": "每日任务与活动卡片",
    "cta": "查看活动"
};
const accentMap = {
    rose: { bg: "from-[#ffe2e8] via-[#fff5f1] to-[#ffd074]", ink: "#7f1d1d", pill: "#ef4444", soft: "#fff1f2" },
    slate: { bg: "from-[#eef2ff] via-[#f8fafc] to-[#e2e8f0]", ink: "#0f172a", pill: "#475569", soft: "#f1f5f9" },
    amber: { bg: "from-[#fef3c7] via-[#fff7ed] to-[#fed7aa]", ink: "#7c2d12", pill: "#d97706", soft: "#fffbeb" },
    zinc: { bg: "from-[#18181b] via-[#3f3f46] to-[#a1a1aa]", ink: "#18181b", pill: "#71717a", soft: "#f4f4f5" },
    emerald: { bg: "from-[#d1fae5] via-[#ecfeff] to-[#bbf7d0]", ink: "#064e3b", pill: "#059669", soft: "#ecfdf5" },
    sky: { bg: "from-[#dbeafe] via-[#f8fafc] to-[#bae6fd]", ink: "#075985", pill: "#0284c7", soft: "#eff6ff" },
    teal: { bg: "from-[#ccfbf1] via-[#f0fdfa] to-[#99f6e4]", ink: "#134e4a", pill: "#0d9488", soft: "#f0fdfa" },
    orange: { bg: "from-[#ffedd5] via-[#fff7ed] to-[#fecaca]", ink: "#7c2d12", pill: "#f97316", soft: "#fff7ed" },
    lime: { bg: "from-[#ecfccb] via-[#f7fee7] to-[#d9f99d]", ink: "#365314", pill: "#65a30d", soft: "#f7fee7" },
    red: { bg: "from-[#fee2e2] via-[#fff7ed] to-[#fde68a]", ink: "#7f1d1d", pill: "#dc2626", soft: "#fef2f2" },
};
const theme = accentMap[page.accent];
export default function ChallengePrototypePage({ title = page.title }) {
    return (<main className="min-h-screen w-full bg-[#f3f4f6] px-4 py-6 text-[#111827]">
      <section className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3">
        <div className="w-full text-left">
          <p className="text-xs font-medium text-[#6b7280]">闯关活动 / 代码化还原</p>
          <h1 className="mt-1 text-base font-semibold text-[#111827]">{title}</h1>
        </div>
        <PhoneShell tall={isLongPage()} wide={isWidePage()}>
          {renderPage()}
        </PhoneShell>
      </section>
    </main>);
}
function isLongPage() {
    return page.kind === "longFlowA" || page.kind === "longFlowB" || page.kind === "materialList";
}
function isWidePage() {
    return page.kind === "rules" || page.kind === "timeline" || page.kind === "taskDialog" || page.kind === "longFlowB";
}
function PhoneShell({ children, tall, wide }) {
    const width = wide ? "max-w-[420px]" : "max-w-[360px]";
    const minHeight = tall ? "min-h-[1120px]" : "min-h-[720px]";
    return (<div className={`w-full ${width} overflow-hidden rounded-[26px] bg-white shadow-xl ring-1 ring-black/10`}>
      <div className={`${minHeight} relative bg-gradient-to-br ${theme.bg}`}>
        <StatusBar />
        {children}
      </div>
    </div>);
}
function StatusBar() {
    return (<div className="flex h-9 items-center justify-between px-5 text-[11px] font-semibold text-black/70">
      <span>{page.kind.includes("camera") || page.kind.includes("generate") || page.kind === "shareVideo" ? "10:10" : "9:41"}</span>
      <div className="flex items-center gap-1">
        <span className="h-2 w-3 rounded-[2px] border border-black/50"/>
        <span className="h-2 w-3 rounded-[2px] bg-black/60"/>
        <span className="h-2 w-5 rounded-[3px] border border-black/50"><span className="block h-full w-4 rounded-[2px] bg-black/60"/></span>
      </div>
    </div>);
}
function Header({ compact = false }) {
    return (<header className={`flex items-center justify-between px-5 ${compact ? "py-2" : "py-3"}`}>
      <button className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/70 shadow-sm">‹</button>
      <div className="text-center">
        <p className="text-[11px] font-medium text-black/45">{page.subtitle}</p>
        <h2 className="text-sm font-bold" style={{ color: theme.ink }}>{page.hero}</h2>
      </div>
      <button className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/70 shadow-sm">···</button>
    </header>);
}
function PrimaryButton({ children = page.cta, muted = false }) {
    const style = { backgroundColor: muted ? "#e5e7eb" : theme.pill, color: muted ? "#374151" : "#fff" };
    return (<button className="h-11 w-full rounded-full px-5 text-sm font-bold shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-black/20" style={style}>
      {children}
    </button>);
}
function Mascot({ label = "IP" }) {
    return (<div className="relative mx-auto h-28 w-28">
      <div className="absolute inset-2 rounded-[32px] bg-white/85 shadow-lg ring-1 ring-black/10"/>
      <div className="absolute left-8 top-8 h-4 w-4 rounded-full bg-black/70"/>
      <div className="absolute right-8 top-8 h-4 w-4 rounded-full bg-black/70"/>
      <div className="absolute left-1/2 top-[58px] h-5 w-10 -translate-x-1/2 rounded-b-full border-b-4 border-black/50"/>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold text-white shadow" style={{ backgroundColor: theme.pill }}>{label}</div>
    </div>);
}
function TaskCard({ index, title, done = false }) {
    return (<article className="rounded-[18px] bg-white/90 p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: done ? "#22c55e" : theme.pill }}>{done ? "✓" : index}</span>
          <div>
            <h3 className="text-sm font-bold text-[#111827]">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-[#6b7280]">完成指定动作后可解锁奖励，进度会自动同步到活动页。</p>
          </div>
        </div>
        <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold text-black/55">{done ? "已完成" : "待完成"}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-black/10">
        <div className="h-full rounded-full" style={{ width: done ? "100%" : "42%", backgroundColor: done ? "#22c55e" : theme.pill }}/>
      </div>
    </article>);
}
function BottomTabs() {
    return (<nav className="absolute bottom-0 left-0 right-0 grid grid-cols-4 border-t border-black/5 bg-white/95 px-4 py-2 text-center text-[10px] text-[#6b7280]">
      {["首页", "任务", "作品", "我的"].map((item, index) => (<div key={item} className={index === 1 ? "font-bold" : ""} style={{ color: index === 1 ? theme.pill : undefined }}>
          <span className="mx-auto mb-1 block h-5 w-5 rounded-md bg-black/10"/>
          {item}
        </div>))}
    </nav>);
}
function VideoPanel({ landscape = false }) {
    return (<div className={`${landscape ? "aspect-video" : "aspect-[9/16]"} grid place-items-center rounded-[22px] bg-[#737373] text-white shadow-inner`}>
      <div className="text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full border-2 border-white/80">
          <span className="ml-[18px] mt-[13px] block h-0 w-0 border-y-[10px] border-l-[14px] border-y-transparent border-l-white"/>
        </div>
        <p className="text-lg font-semibold">视频</p>
        <p className="mt-1 text-xs text-white/70">{landscape ? "横版播放占位" : "竖版播放占位"}</p>
      </div>
    </div>);
}
function SceneCard({ title, children }) {
    return (<section className="rounded-[22px] bg-white/88 p-4 shadow-sm ring-1 ring-black/5">
      <h3 className="text-sm font-bold" style={{ color: theme.ink }}>{title}</h3>
      <div className="mt-3">{children}</div>
    </section>);
}
function renderPage() {
    if (page.kind === "reward")
        return <RewardPage />;
    if (page.kind === "detail")
        return <DetailPage />;
    if (page.kind === "taskCenter")
        return <TaskCenterPage />;
    if (page.kind === "poemHome")
        return <PoemHomePage />;
    if (page.kind === "videoPortrait")
        return <VideoOnly landscape={false}/>;
    if (page.kind === "festivalStart")
        return <FestivalStartPage />;
    if (page.kind === "rules")
        return <RulesPage />;
    if (page.kind === "timeline")
        return <TimelinePage />;
    if (page.kind === "animalPopup")
        return <AnimalPopupPage />;
    if (page.kind === "longFlowA")
        return <LongFlowPage type="A"/>;
    if (page.kind === "videoLandscape")
        return <VideoOnly landscape/>;
    if (page.kind === "longFlowB")
        return <LongFlowPage type="B"/>;
    if (page.kind === "taskDialog")
        return <TaskDialogPage />;
    if (page.kind === "videoPlayer")
        return <VideoPlayerPage />;
    if (page.kind === "shootEntry")
        return <ShootEntryPage />;
    if (page.kind === "cameraLive")
        return <CameraPage confirm={false}/>;
    if (page.kind === "generating")
        return <GeneratingPage />;
    if (page.kind === "cameraConfirm")
        return <CameraPage confirm/>;
    if (page.kind === "materialPreview")
        return <MaterialPreviewPage />;
    if (page.kind === "shareVideo")
        return <ShareVideoPage />;
    if (page.kind === "keyboardState")
        return <KeyboardStatePage />;
    if (page.kind === "generateBottom")
        return <GenerateBottomPage />;
    if (page.kind === "successModal")
        return <SuccessModalPage />;
    if (page.kind === "materialList")
        return <MaterialListPage />;
    if (page.kind === "raceAvailable")
        return <RacePage done={false}/>;
    if (page.kind === "raceDone")
        return <RacePage done/>;
    return <LotteryPage />;
}
function RewardPage() {
    return (<>
      <Header compact/>
      <div className="px-6 pt-8">
        <div className="rounded-[28px] bg-black/55 p-5 text-center text-white shadow-xl backdrop-blur">
          <Mascot label="OU"/>
          <h2 className="mt-3 text-2xl font-black leading-tight">{page.hero}</h2>
          <p className="mt-2 text-sm text-white/80">{page.subtitle}</p>
          <div className="mt-5 rounded-[20px] bg-white p-4 text-left text-[#111827]">
            <p className="text-xs font-semibold text-[#ef4444]">体验包权益</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
              {["每日表达", "AI纠音", "闯关奖励"].map((item) => <span key={item} className="rounded-xl bg-[#fff1f2] p-2 font-semibold">{item}</span>)}
            </div>
            <div className="mt-4"><PrimaryButton /></div>
          </div>
        </div>
      </div>
      <BottomTabs />
    </>);
}
function DetailPage() {
    return (<>
      <Header />
      <div className="space-y-4 px-5 pb-20">
        <SceneCard title="活动视频">
          <div className="grid h-40 place-items-center rounded-[18px] bg-[#d1d5db] text-sm font-bold text-[#6b7280]">2.5 关卡视频</div>
        </SceneCard>
        <div className="grid grid-cols-2 gap-3">
          {["4.8版本icon", "2.页面背景色", "页面弹窗", "活动入口"].map((item) => <div key={item} className="h-24 rounded-[16px] bg-white/90 p-3 text-xs font-semibold shadow-sm ring-1 ring-black/5">{item}</div>)}
        </div>
      </div>
      <BottomTabs />
    </>);
}
function TaskCenterPage() {
    return (<>
      <Header />
      <div className="space-y-4 px-5 pb-20">
        <div className="grid grid-cols-3 gap-3">
          {["诗仙李白", "动物园奇遇", "端午大作战"].map((item, index) => <div key={item} className="rounded-[16px] bg-white p-3 shadow-sm"><div className="mb-2 h-16 rounded-xl" style={{ backgroundColor: index === 1 ? "#ccfbf1" : "#fee2e2" }}/><p className="text-[11px] font-bold">{item}</p></div>)}
        </div>
        <SceneCard title="叫叫活动卡片">
          <div className="grid h-36 place-items-center rounded-[18px] bg-[#e5e7eb] text-sm font-bold text-[#6b7280]">活动横幅占位</div>
        </SceneCard>
      </div>
      <BottomTabs />
    </>);
}
function PoemHomePage() {
    return (<>
      <Header compact/>
      <div className="px-5 pb-24">
        <div className="rounded-[28px] bg-[#fff7ed]/90 p-5 text-center shadow-lg ring-1 ring-black/5">
          <h2 className="text-2xl font-black leading-tight" style={{ color: theme.ink }}>{page.hero}</h2>
          <Mascot label="李白"/>
          <p className="text-xs text-[#92400e]">跟随诗词线索，完成每日挑战</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <TaskCard index={1} title="启蒙练习" done/>
            <TaskCard index={2} title="诗词挑战"/>
          </div>
        </div>
      </div>
      <BottomTabs />
    </>);
}
function VideoOnly({ landscape }) {
    return (<div className="flex min-h-[680px] flex-col justify-between p-5">
      <button className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-black">×</button>
      <VideoPanel landscape={landscape}/>
      <div className="flex justify-end"><button className="rounded-full bg-white px-4 py-2 text-xs font-bold text-[#6b7280]">跳过</button></div>
    </div>);
}
function FestivalStartPage() {
    return (<div className="flex min-h-[680px] flex-col items-center justify-center px-7 text-center">
      <Mascot label="端午"/>
      <h2 className="mt-5 text-3xl font-black text-white drop-shadow" style={{ color: theme.ink }}>{page.hero}</h2>
      <p className="mt-2 text-sm font-medium text-black/60">{page.subtitle}</p>
      <div className="mt-8 w-full"><PrimaryButton /></div>
    </div>);
}
function RulesPage() {
    return (<div className="grid grid-cols-[1fr_112px] gap-4 p-5">
      <section className="min-h-[640px] rounded-[18px] bg-white p-5 shadow-sm">
        <div className="mx-auto h-20 w-24 rounded-2xl bg-[#e5e7eb]"/>
        <h2 className="mt-5 text-center text-lg font-bold">{page.hero}</h2>
        <div className="mt-5 space-y-3 text-xs leading-6 text-[#6b7280]">
          {["活动期间完成每日关卡即可累计进度。", "奖励将在任务完成后自动发放到账号。", "同一用户每天最多领取一次任务奖励。", "页面信息以活动实际配置为准。", "如遇网络延迟，可返回任务中心刷新。"].map((item) => <p key={item} className="border-b border-dashed border-black/10 pb-2">{item}</p>)}
        </div>
      </section>
      <aside className="space-y-3">
        <button className="h-9 w-full rounded-full border border-[#93c5fd] bg-white text-xs font-bold text-[#2563eb]">按钮配置</button>
        <div className="h-[560px] rounded-[18px] border border-dashed border-[#93c5fd] bg-white/70 p-3 text-[11px] leading-5 text-[#2563eb]">右侧保留原型标注区域，用于创作端配置说明。</div>
      </aside>
    </div>);
}
function TimelinePage() {
    return (<div className="grid grid-cols-[150px_1fr] gap-4 p-5">
      <section className="rounded-[18px] bg-white/80 p-3">
        {["关注健康营养", "关卡一奥秘", "关卡二闯关", "奖励领取", "作品生成"].map((item, index) => <div key={item} className="relative border-l-2 border-dashed border-[#60a5fa] pb-5 pl-4 text-[11px] font-bold text-[#2563eb]"><span className="absolute -left-[7px] top-0 h-3 w-3 rounded-full bg-[#2563eb]"/>{item}<p className="mt-1 text-[10px] font-normal text-[#64748b]">配置标注 {index + 1}</p></div>)}
      </section>
      <section className="space-y-3">
        {[1, 2, 3, 4].map((item) => <SceneCard key={item} title={`关卡 ${item}`}><p className="text-xs text-[#6b7280]">文案、按钮、奖励和跳转配置区域。</p></SceneCard>)}
      </section>
    </div>);
}
function AnimalPopupPage() {
    return (<>
      <Header compact/>
      <div className="px-6 pt-16">
        <div className="rounded-[28px] bg-black/50 p-5 text-center text-white shadow-2xl">
          <h2 className="text-2xl font-black">{page.hero}</h2>
          <Mascot label="dolphin"/>
          <p className="mt-2 text-sm text-white/80">收集动物卡片，解锁趣味任务</p>
          <div className="mt-5"><PrimaryButton /></div>
        </div>
      </div>
      <BottomTabs />
    </>);
}
function LongFlowPage({ type }) {
    const cards = type === "A" ? ["入口弹窗", "任务列表", "奖励弹窗", "完成页", "底部导航"] : ["视频任务", "弹窗状态", "素材选择", "分享结果", "规则说明"];
    return (<div className={`grid ${type === "B" ? "grid-cols-[1fr_150px]" : "grid-cols-[110px_1fr]"} gap-4 p-5`}>
      <section className="space-y-3">
        <Header compact/>
        {cards.map((item, index) => <TaskCard key={item} index={index + 1} title={item} done={index < 2}/>)}
      </section>
      <aside className="space-y-3 rounded-[18px] border border-dashed border-[#93c5fd] bg-white/80 p-3 text-[11px] leading-5 text-[#2563eb]">
        {cards.map((item) => <p key={item}>配置标注：{item}</p>)}
      </aside>
    </div>);
}
function TaskDialogPage() {
    return (<div className="grid min-h-[760px] grid-cols-[1fr_150px] gap-4 bg-black/60 p-5">
      <section className="flex items-end">
        <div className="w-full rounded-t-[28px] bg-white p-5 shadow-xl">
          <h2 className="text-lg font-black">{page.hero}</h2>
          <p className="mt-2 text-xs text-[#6b7280]">任务说明、奖励权益和操作按钮集中展示。</p>
          <div className="mt-4 space-y-3"><TaskCard index={1} title="观看视频并完成答题"/><PrimaryButton /></div>
        </div>
      </section>
      <aside className="space-y-3 text-[11px] text-[#2563eb]"><p className="rounded-full border border-dashed border-[#93c5fd] bg-white px-3 py-2">行弹窗卡片-相关文案</p><p className="rounded-full border border-dashed border-[#93c5fd] bg-white px-3 py-2">行按钮-跳转</p></aside>
    </div>);
}
function VideoPlayerPage() {
    return (<div className="min-h-[680px] bg-black p-5 text-white">
      <button className="h-8 w-8 rounded-full bg-white/10">×</button>
      <div className="mt-24"><VideoPanel landscape/></div>
      <div className="mt-5 h-1 rounded-full bg-white/20"><div className="h-full w-1/3 rounded-full bg-[#facc15]"/></div>
      <div className="mt-6 flex justify-end"><button className="rounded-full bg-white/15 px-4 py-2 text-xs font-bold">全屏观看</button></div>
    </div>);
}
function ShootEntryPage() {
    return (<>
      <Header compact/>
      <CameraStage label="拍摄入口"/>
      <div className="absolute bottom-0 left-0 right-0 rounded-t-[26px] bg-white p-5">
        <p className="text-center text-xs font-bold">分享给所有人</p>
        <div className="mt-4 grid grid-cols-5 gap-3 text-center text-[10px] text-[#6b7280]">{["微信", "朋友圈", "抖音", "小红书", "保存"].map((item) => <span key={item}><i className="mx-auto mb-1 block h-8 w-8 rounded-full bg-black/10"/>{item}</span>)}</div>
      </div>
    </>);
}
function CameraPage({ confirm }) {
    return (<>
      <Header compact/>
      <CameraStage label={confirm ? "确认动作" : "实时预览"} large/>
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-8">
        <button className="h-12 w-12 rounded-full bg-white/80 shadow">↺</button>
        <button className="grid h-20 w-20 place-items-center rounded-full border-[8px] border-white bg-[#f97316] shadow-xl"><span className="h-8 w-8 rounded-full bg-white/80"/></button>
        <button className="h-12 w-12 rounded-full bg-white/80 shadow">{confirm ? "✓" : "···"}</button>
      </div>
    </>);
}
function CameraStage({ label, large = false }) {
    return (<section className={`mx-5 mt-3 rounded-[24px] bg-white/55 p-4 shadow-inner ${large ? "h-[560px]" : "h-[470px]"}`}>
      <div className="relative h-full overflow-hidden rounded-[22px] bg-gradient-to-b from-[#fed7aa] to-[#fef3c7]">
        <div className="absolute left-1/2 top-10 h-48 w-32 -translate-x-1/2 rounded-t-full bg-white/85 shadow"/>
        <div className="absolute bottom-8 left-1/2 h-56 w-44 -translate-x-1/2 rounded-t-[60px] bg-[#111827]/75"/>
        <div className="absolute bottom-20 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-[#fde68a] shadow"/>
        <h2 className="absolute bottom-36 left-1/2 w-52 -translate-x-1/2 text-center text-3xl font-black text-white drop-shadow">{page.hero}</h2>
        <span className="absolute right-4 top-4 rounded-full bg-white/80 px-3 py-1 text-[10px] font-bold">{label}</span>
      </div>
    </section>);
}
function GeneratingPage() {
    return (<>
      <Header compact/>
      <CameraStage label="生成中"/>
      <div className="absolute bottom-0 left-0 right-0 bg-white p-5">
        <div className="mb-4 h-2 rounded-full bg-black/10"><div className="h-full w-2/3 rounded-full bg-[#f97316]"/></div>
        <PrimaryButton>生成作品</PrimaryButton>
      </div>
    </>);
}
function MaterialPreviewPage() {
    return (<>
      <Header compact/>
      <div className="px-5 pt-12">
        <SceneCard title="00:00:06">
          <div className="h-[420px] rounded-[22px] bg-gradient-to-b from-white to-[#d1d5db]"/>
        </SceneCard>
      </div>
      <Keyboard />
    </>);
}
function ShareVideoPage() {
    return (<>
      <Header compact/>
      <div className="px-5 pt-5">
        <VideoPanel />
        <div className="mt-4 text-center"><h2 className="text-lg font-black">{page.hero}</h2><p className="text-xs text-[#6b7280]">{page.subtitle}</p></div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 rounded-t-[24px] bg-white p-5">
        <PrimaryButton />
      </div>
    </>);
}
function KeyboardStatePage() {
    return (<>
      <Header compact/>
      <div className="px-5 pt-12"><SceneCard title="输入祝福文案"><div className="h-[360px] rounded-[20px] bg-white/70 p-4 text-xs text-[#6b7280]">在这里输入希望生成到作品里的祝福语。</div></SceneCard></div>
      <Keyboard />
    </>);
}
function GenerateBottomPage() {
    return (<>
      <Header compact/>
      <div className="px-5 pt-8"><SceneCard title="作品预览"><div className="h-[440px] rounded-[22px] bg-gradient-to-b from-white to-[#d1d5db]"/></SceneCard></div>
      <div className="absolute bottom-0 left-0 right-0 grid grid-cols-[72px_1fr] gap-3 bg-white p-5"><button className="rounded-full bg-black/5 text-xs font-bold">相册</button><PrimaryButton /></div>
    </>);
}
function Keyboard() {
    return <div className="absolute bottom-0 left-0 right-0 grid grid-cols-10 gap-1 bg-[#d1d5db] p-2">{Array.from({ length: 30 }, (_, index) => <span key={index} className="h-8 rounded bg-white shadow-sm"/>)}</div>;
}
function SuccessModalPage() {
    return (<div className="flex min-h-[680px] items-center justify-center bg-black/50 p-6">
      <div className="w-full rounded-[26px] bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#dcfce7] text-3xl font-black text-[#16a34a]">✓</div>
        <h2 className="mt-4 text-xl font-black">{page.hero}</h2>
        <p className="mt-2 text-sm text-[#6b7280]">任务已完成，奖励已进入账户。</p>
        <div className="mt-6"><PrimaryButton /></div>
      </div>
    </div>);
}
function MaterialListPage() {
    return (<div className="space-y-4 p-5">
      <Header compact/>
      {[1, 2, 3, 4].map((group) => (<SceneCard key={group} title={`素材分组 ${group}`}>
          <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-[16px] bg-white p-2 shadow-sm ring-1 ring-black/5"><div className="h-24 rounded-xl bg-gradient-to-br from-[#fed7aa] to-[#bfdbfe]"/><p className="mt-2 text-xs font-bold">素材 {group}-{index + 1}</p></div>)}</div>
        </SceneCard>))}
    </div>);
}
function RacePage({ done }) {
    return (<>
      <Header />
      <div className="space-y-4 px-5 pb-20">
        <SceneCard title="连续计分计划">
          <div className="flex items-center justify-between rounded-[18px] bg-white p-4">
            <div><p className="text-sm font-black">正在冲计划（{done ? "1/1" : "0/1"}）</p><p className="mt-1 text-xs text-[#6b7280]">完成今日挑战即可增加计分。</p></div>
            <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold">{done ? "已完成" : "未完成"}</span>
          </div>
          <div className="mt-4"><PrimaryButton>{done ? "查看奖励" : "去补卡"}</PrimaryButton></div>
        </SceneCard>
        <TaskCard index={2} title="补卡5个计划" done={done}/>
      </div>
    </>);
}
function LotteryPage() {
    return (<>
      <Header compact/>
      <div className="px-5 pb-24 text-center">
        <h2 className="mt-4 text-3xl font-black leading-tight" style={{ color: theme.ink }}>{page.hero}</h2>
        <p className="mt-2 text-sm text-black/60">{page.subtitle}</p>
        <div className="mt-6 rounded-[28px] bg-white/85 p-5 shadow-lg ring-1 ring-black/5">
          <Mascot label="礼物"/>
          <div className="mt-4 grid grid-cols-3 gap-3">{["礼盒", "课程", "徽章"].map((item) => <div key={item} className="rounded-[18px] bg-[#fee2e2] p-4 text-xs font-bold text-[#991b1b]">{item}</div>)}</div>
          <div className="mt-5"><PrimaryButton /></div>
        </div>
      </div>
      <BottomTabs />
    </>);
}
