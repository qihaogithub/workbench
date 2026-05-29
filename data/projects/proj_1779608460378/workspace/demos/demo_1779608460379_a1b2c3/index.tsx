interface DemoProps {
  bigBannerMaxWidth?: number;
  bigBannerMaxHeight?: number;
  miniBannerMaxWidth?: number;
  miniBannerMaxHeight?: number;
  imageMaxWidth?: number;
  imageMaxHeight?: number;
}

const subjects = [
  { key: 'yuedu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/阅读.png', bgClass: 'bg-[#fff2ea]' },
  { key: 'yizhi', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/益智.png', bgClass: 'bg-[#eaf9ff]' },
  { key: 'meiyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/美育.png', bgClass: 'bg-[#f9f5ff]' },
  { key: 'xiezuo', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/写作.png', bgClass: 'bg-[#eefceb]' },
  { key: 'yingyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/英语.png', bgClass: 'bg-[#fff0f3]' },
];

const miniBannerList = [
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D02.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D05.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D04.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D06.png',
];

export default function PhoneSquare(props: DemoProps) {
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
    bigBannerBackground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_背景图.png',
    firstMiniBanner = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D01.png',

    // 尺寸限制参数（来自配置）
    bigBannerMaxWidth = 335,
    bigBannerMaxHeight = 192,
    miniBannerMaxWidth = 200,
    miniBannerMaxHeight = 91,
    imageMaxWidth = 0,
    imageMaxHeight = 0,
  } = {
    ...props,
    // 从 props 中提取已知配置，兼容老数据格式
    ...(props as Record<string, unknown>),
  };

  // 全局图片尺寸限制
  const globalImgStyle: React.CSSProperties = {};
  if (imageMaxWidth > 0) globalImgStyle.maxWidth = imageMaxWidth;
  if (imageMaxHeight > 0) globalImgStyle.maxHeight = imageMaxHeight;

  return (
    <div
      className="w-full min-h-screen bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 375,
        margin: '0 auto',
      }}
    >
      <style>{`
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/状态栏.png"
          alt="status"
          className="w-full h-auto"
          style={globalImgStyle}
        />
        <div className="flex items-center justify-between h-11 px-5">
          <img
            className="w-[154px] h-[30px]"
            src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/顶部/叫叫%20Logo%20-%20基础.png"
            alt="Logo"
            style={globalImgStyle}
          />
          <img
            className="h-[30px]"
            src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/顶部/扫一扫.png"
            alt="扫一扫"
            style={globalImgStyle}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center overflow-y-auto">
        <div className="flex items-center justify-between px-5 gap-[11px] mt-4 w-full">
          {subjects.map((s) => (
            <div
              key={s.key}
              className={`${s.bgClass} flex items-center justify-center w-[58.2px] rounded-[12px_12px_24px_12px] py-1.5`}
            >
              <img
                src={s.icon}
                alt={s.key}
                className="w-8 h-8"
                style={globalImgStyle}
              />
            </div>
          ))}
        </div>

        {/* 大Banner - 手机端，带尺寸限制 */}
        <div className="w-[335px] mt-4">
          <div
            className="relative w-full overflow-hidden"
            style={{
              height: bigBannerMaxHeight,
              maxWidth: bigBannerMaxWidth,
            }}
          >
            <img
              className="absolute w-full h-[89.583%] bottom-0 left-1/2 -translate-x-1/2 rounded-2xl object-cover"
              src={bigBannerBackground}
              alt="banner-bg"
              style={{
                maxWidth: bigBannerMaxWidth,
                maxHeight: bigBannerMaxHeight,
                ...globalImgStyle,
              }}
            />
            <img
              className="absolute w-full h-full bottom-0 left-1/2 -translate-x-1/2 object-cover"
              src={bigBannerForeground}
              alt="banner-fg"
              style={{
                maxWidth: bigBannerMaxWidth,
                maxHeight: bigBannerMaxHeight,
                ...globalImgStyle,
              }}
            />
          </div>
        </div>

        {/* 小Banner滚动区 - 带尺寸限制 */}
        <div
          className="w-full pl-4 mt-4 overflow-x-auto hide-scrollbar"
          style={{
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            height: miniBannerMaxHeight,
          }}
        >
          <div className="flex gap-2 h-full">
            <img
              src={firstMiniBanner}
              alt="mini-banner-1"
              className="h-full w-auto flex-shrink-0"
              style={{
                maxWidth: miniBannerMaxWidth,
                maxHeight: miniBannerMaxHeight,
                ...globalImgStyle,
              }}
            />
            {miniBannerList.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`mini-banner-${i + 2}`}
                className="h-full w-auto flex-shrink-0"
                style={{
                  maxWidth: miniBannerMaxWidth,
                  maxHeight: miniBannerMaxHeight,
                  ...globalImgStyle,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/底部/底部标签栏.png"
          alt="tabBar"
          className="w-full h-auto"
          style={globalImgStyle}
        />
      </div>
    </div>
  );
}