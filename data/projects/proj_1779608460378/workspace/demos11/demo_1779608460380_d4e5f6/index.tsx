interface DemoProps {
  bigBannerForeground?: string;
}

export default function PadSquare(props: DemoProps) {
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
  } = props;

  return (
    <div
      className="w-[1024px] h-[768px] relative bg-white overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <style>{`
        .figma-scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .figma-scrollbar-hide::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>

      {/* 顶部状态栏 */}
      <img
        src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_569f7368.png"
        alt="status bar"
        className="left-0 top-0 absolute object-cover max-w-none"
        style={{ width: 1023, height: 58 }}
      />

      {/* 内容区域 */}
      <div className="w-[1023.10px] px-[36.15px] left-0 top-[57.84px] absolute inline-flex flex-col justify-start items-start gap-5">

        {/* 科目选择 - 参考设计图 */}
        <img
          src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_b2570ead.png"
          alt="subjects"
          className="object-cover max-w-none"
          style={{ width: 951, height: 54 }}
        />

        {/* 大Banner - 使用项目级配置的前景图 */}
        <div className="w-[950px] h-[291.93px] shrink-0 relative overflow-hidden">
          <div className="w-[951.82px] h-[261.52px] left-[-1.22px] top-[30.41px] absolute bg-gradient-to-b from-[#ffd5ec] to-[#fceef6] rounded-3xl overflow-hidden">
            <img
              className="w-[948.78px] h-[265.17px] left-[1.22px] top-[-3.65px] absolute max-w-none"
              src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_df5192e8.png"
              alt="banner-bg-deco"
              style={{ width: 949, height: 265 }}
            />
          </div>
          <img
            className="w-[948.78px] h-[291.93px] left-[1.40px] top-[0.38px] absolute max-w-none"
            src={bigBannerForeground}
            alt="banner-fg"
            style={{ width: 949, height: 292 }}
          />
        </div>

        {/* 底部横滑卡片 - 替换为一张完整图片 */}
        <img
          src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_c925e908.png"
          alt="course-cards-section"
          className="relative object-cover max-w-none"
          style={{ width: 951, height: 228 }}
        />
      </div>

      {/* 底部标签栏 */}
      <img
        src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_ccadf0df.png"
        alt="tabBar"
        className="left-0 top-[706px] absolute object-cover max-w-none"
        style={{ width: 1024, height: 62 }}
      />
    </div>
  );
}