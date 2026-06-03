interface DemoProps {
  bigBannerForeground?: string;
  bigBannerBackground?: string;
  miniBanners?: string[];
}

const subjects = [
  { key: 'yuedu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/阅读.png', bgClass: 'bg-[#fff2ea]' },
  { key: 'yizhi', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/益智.png', bgClass: 'bg-[#eaf9ff]' },
  { key: 'meiyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/美育.png', bgClass: 'bg-[#f9f5ff]' },
  { key: 'xiezuo', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/写作.png', bgClass: 'bg-[#eefceb]' },
  { key: 'yingyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/英语.png', bgClass: 'bg-[#fff0f3]' },
];

export default function PadSquare(props: DemoProps) {
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
  } = props;

  return (
    <div
      className="w-full min-h-screen bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 1024,
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

      {/* 顶部状态栏和 Logo */}
      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/状态栏_pad.png"
          alt="status"
          className="w-full h-auto"
        />
        <div className="flex items-center justify-between h-11 px-5">
          <img
            className="w-[154px] h-[30px]"
            src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/顶部/叫叫%20Logo%20-%20基础.png"
            alt="Logo"
          />
          <img
            className="h-[30px]"
            src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/顶部/扫一扫.png"
            alt="扫一扫"
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 flex flex-col items-center overflow-y-auto">
        {/* 科目图标 */}
        <div className="flex items-center justify-between px-10 gap-[11px] mt-4 w-full">
          {subjects.map((s) => (
            <div
              key={s.key}
              className={`${s.bgClass} flex items-center justify-center w-[58.2px] rounded-[12px_12px_24px_12px] py-1.5`}
            >
              <img src={s.icon} alt={s.key} className="w-8 h-8" />
            </div>
          ))}
        </div>

        {/* 大Banner - 使用配置的图片原始尺寸 */}
        <div className="w-full px-10 mt-4">
          <div className="relative w-full overflow-hidden rounded-2xl">
            {/* 背景图 - 根据前景图比例自动适应 */}
            <img
              className="absolute w-full bottom-0 left-1/2 -translate-x-1/2 object-cover"
              src={bigBannerBackground}
              alt="banner-bg"
              style={{ height: '89.583%' }}
            />
            {/* 前景图 */}
            <img
              className="relative w-full h-auto object-cover"
              src={bigBannerForeground}
              alt="banner-fg"
            />
          </div>
        </div>

        {/* 小Banner滚动区 */}
        <div className="w-full pl-10 mt-5 overflow-x-auto hide-scrollbar">
          <div className="flex gap-2">
            {miniBanners.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`mini-banner-${i + 1}`}
                className="h-[137px] w-auto flex-shrink-0"
              />
            ))}
          </div>
        </div>
      </div>

      {/* 底部标签栏 */}
      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/底部/底部标签栏_pad.png"
          alt="tabBar"
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}