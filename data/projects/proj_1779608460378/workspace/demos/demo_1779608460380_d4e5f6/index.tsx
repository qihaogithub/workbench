interface DemoProps {}

export default function PadSquare(props: DemoProps) {
  // 项目级共享配置：运行时注入，不在 Props 接口中声明
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
    bigBannerBackground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_背景图.png',
    miniBanners = [
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D01.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D02.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D05.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D04.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D06.png',
    ],
  } = props as Record<string, unknown>;

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
        src="../../assets/images/3a7203b9dc0c-pad-status-bar.png"
        alt="status bar"
        className="left-0 top-0 absolute object-cover max-w-none"
        style={{ width: 1023, height: 58 }}
      />

      {/* 内容区域 */}
      <div className="w-[1023.10px] px-[36.15px] left-0 top-[57.84px] absolute inline-flex flex-col justify-start items-start gap-5">

        {/* 科目选择 - 参考设计图 */}
        <img
          src="../../assets/images/af164cffc0bf-pad-subjects.png"
          alt="subjects"
          className="object-cover max-w-none"
          style={{ width: 951, height: 54 }}
        />

        {/* 大Banner - 使用项目级配置的前景图 */}
        <div className="w-[950px] h-[291.93px] shrink-0 relative overflow-hidden">
          <div className="w-[951.82px] h-[261.52px] left-[-1.22px] top-[30.41px] absolute bg-gradient-to-b from-[#ffd5ec] to-[#fceef6] rounded-3xl overflow-hidden">
            <img
              className="w-[948.78px] h-[265.17px] left-[1.22px] top-[-3.65px] absolute max-w-none"
              src={bigBannerBackground as string}
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

        {/* 小Banner横滑区 - 由项目级 miniBanners 配置驱动 */}
        <div className="shrink-0 inline-flex justify-start items-start gap-[14.91px] overflow-x-auto figma-scrollbar-hide">
          {(miniBanners as string[]).map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`mini-banner-${i + 1}`}
              className="w-[219.62px] h-[123.54px] shrink-0 max-w-none"
              style={{ width: 220, height: 124 }}
            />
          ))}
        </div>

        {/* 底部课程卡片区 - 用户上传素材（原图 1902×361，按 2x 等比显示） */}
        <img
          src="/api/images/img_5htP5MlfKx_RAQ"
          alt="免费试一试课程区：标题与副标题、K1学什么下拉、横向课程卡片"
          className="relative object-cover max-w-none"
          style={{ width: 951, height: 180.5 }}
        />
      </div>

      {/* 底部标签栏 */}
      <img
        src="../../assets/images/e20570ef830d-pad-tab-bar.png"
        alt="tabBar"
        className="left-0 top-[706px] absolute object-cover max-w-none"
        style={{ width: 1024, height: 62 }}
      />
    </div>
  );
}