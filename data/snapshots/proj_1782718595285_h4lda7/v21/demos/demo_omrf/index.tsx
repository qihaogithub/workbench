interface DemoProps {}

export default function Demo(props: DemoProps) {
  // 项目级共享配置（由 PreviewPanel 运行时注入）
  const {
    inviteColor1 = "#FF6B35",
    inviteColor2 = "#F7C59F",
    mallColor1 = "#FEF7E5",
    mallColor2 = "#FEF7E5",
    inviteImage1URL = "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E9%82%80%E8%AF%B7%E6%B4%BB%E5%8A%A801.png",
    inviteImage2URL = "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E9%82%80%E8%AF%B7%E6%B4%BB%E5%8A%A802.png",
    mallImage1URL = "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E5%95%86%E5%9C%BA1.png",
    mallImage2URL = "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E5%95%86%E5%9C%BA2.png",
  } = props as Record<string, unknown>;

  return (
    <div className="w-full h-screen overflow-hidden relative bg-white">
      <style>{`
        .scroll-hide::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* 可滑动内容区域 */}
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden scroll-hide">
        <div className="w-[1133px] min-h-screen relative mx-auto bg-white">
          {/* 装饰背景图 */}
          <img
            className="absolute left-[177px] top-5 object-cover"
            src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_e545eaf5.png"
            alt="装饰背景"
            style={{ width: 780, height: 527 }}
          />

          {/* 邀友得奖模块 */}
          <div className="absolute left-[177px] top-[587px] w-[780px] inline-flex flex-col items-start gap-5">
            <div className="w-full h-[34px] px-1 flex justify-between items-center shrink-0">
              <span className="text-[#666] text-[22.5px] font-medium leading-[33.75px] whitespace-nowrap shrink-0">
                邀友得奖
              </span>
              <div className="flex justify-end items-center shrink-0 gap-0.5">
                <span className="text-[#b2b2b2] text-lg font-normal leading-[27px] whitespace-nowrap text-right">
                  邀请奖励记录
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                  <path
                    d="M6 4L10 8L6 12"
                    stroke="#b2b2b2"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <div className="self-stretch inline-flex justify-start items-center gap-2.5 shrink-0">
              <div
                className="flex items-center justify-center overflow-hidden"
                style={{ width: 385, height: 80, backgroundColor: inviteColor1, borderRadius: 20 }}
              >
                <img src={inviteImage1URL} alt="邀请活动图片1" className="h-full w-auto object-contain" />
              </div>
              <div
                className="flex items-center justify-center overflow-hidden"
                style={{ width: 385, height: 80, backgroundColor: inviteColor2, borderRadius: 20 }}
              >
                <img src={inviteImage2URL} alt="邀请活动图片2" className="h-full w-auto object-contain" />
              </div>
            </div>
          </div>

          {/* 叫叫商城模块 */}
          <div className="absolute left-[177px] top-[761px] w-[780px] inline-flex flex-col items-start gap-5">
            <div className="self-stretch inline-flex justify-start items-end gap-2.5 shrink-0">
              <div className="grow basis-0 px-1 flex justify-between items-center">
                <span className="text-[#666] text-[22.5px] font-medium leading-[33.75px] whitespace-nowrap shrink-0">
                  叫叫商城
                </span>
                <div className="opacity-0 flex justify-end items-center shrink-0 gap-0.5 pointer-events-none">
                  <span className="text-[#acb2bb] text-lg font-normal leading-[27px] whitespace-nowrap text-right">
                    邀请奖励记录
                  </span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <path
                      d="M6 4L10 8L6 12"
                      stroke="#acb2bb"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="self-stretch inline-flex justify-start items-center gap-2.5 shrink-0">
              <div
                className="flex items-center justify-center overflow-hidden"
                style={{ width: 385, height: 80, backgroundColor: mallColor1, borderRadius: 20 }}
              >
                <img src={mallImage1URL} alt="商场图片1" className="h-full w-auto object-contain" />
              </div>
              <div
                className="flex items-center justify-center overflow-hidden"
                style={{ width: 385, height: 80, backgroundColor: mallColor2, borderRadius: 20 }}
              >
                <img src={mallImage2URL} alt="商场图片2" className="h-full w-auto object-contain" />
              </div>
            </div>
          </div>

          {/* 底部 Logo */}
          <div className="absolute left-[177px] top-[915px] w-[780px] px-2.5 py-6 inline-flex flex-col justify-end items-center gap-2.5">
            <img
              className="w-[156.98px] h-[39.85px] shrink-0"
              src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_e7e211e2.svg"
              alt="Logo"
            />
          </div>

          {/* 底部广告图 */}
          <div className="absolute left-0 top-[1024px]" style={{ width: 1133 }}>
            <img
              src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_684bdf65.png"
              alt="底部广告图"
              className="w-full object-contain block"
            />
          </div>
        </div>
      </div>

      {/* 固定顶部导航栏 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none" style={{ width: 1133 }}>
        <img
          src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_3b8dd1f6.png"
          alt="顶部导航栏"
          className="w-full object-cover"
          style={{ height: 20 }}
        />
      </div>

      {/* 固定底部标签栏 */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none" style={{ width: 1133 }}>
        <img
          src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_684bdf65.png"
          alt="底部标签栏"
          className="w-full object-contain"
        />
      </div>
    </div>
  );
}
