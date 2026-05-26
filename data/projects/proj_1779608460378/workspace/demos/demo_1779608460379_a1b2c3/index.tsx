interface DemoProps {}

const subjects = [
  { key: 'yuedu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/阅读.png', bgClass: 'bg-[#fff2ea]' },
  { key: 'yizhi', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/益智.png', bgClass: 'bg-[#eaf9ff]' },
  { key: 'meiyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/美育.png', bgClass: 'bg-[#f9f5ff]' },
  { key: 'xiezuo', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/写作.png', bgClass: 'bg-[#eefceb]' },
  { key: 'yingyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/英语.png', bgClass: 'bg-[#fff0f3]' },
];

const miniBanners = [
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D01.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D02.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D05.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D04.png',
  'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D06.png',
];

const defaultSubjectNames = {
  yuedu: '阅读', yizhi: '益智', meiyu: '美育', xiezuo: '写作', yingyu: '英语',
};

export default function PhoneSquare(props: DemoProps) {
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
    contentImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/内容/内容.png',
    subjectNames = defaultSubjectNames,
  } = props as Record<string, unknown> & { subjectNames?: Record<string, string> };

  return (
    <div
      className="w-full min-h-screen bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 375,
        margin: '0 auto',
      }}
    >
      <div className="w-full flex-shrink-0">
        <img src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/状态栏.png" alt="status" className="w-full h-auto" />
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

      <div className="flex-1 flex flex-col items-center overflow-y-auto">
        <div className="flex items-center justify-between px-5 gap-[11px] mt-4 w-full">
          {subjects.map((s) => (
            <div
              key={s.key}
              className={`${s.bgClass} flex flex-col items-center justify-center gap-0.5 w-[58.2px] rounded-[12px_12px_24px_12px] py-0.5`}
            >
              <img src={s.icon} alt={s.key} className="w-8 h-8" />
              <span className="text-xs font-normal leading-[18px]">
                {subjectNames?.[s.key as keyof typeof defaultSubjectNames] || defaultSubjectNames[s.key as keyof typeof defaultSubjectNames]}
              </span>
            </div>
          ))}
        </div>

        <div className="w-[335px] mt-4">
          <div className="relative w-full overflow-hidden" style={{ height: 192 }}>
            <img
              className="absolute w-full h-[89.583%] bottom-0 left-1/2 -translate-x-1/2 rounded-2xl object-cover"
              src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_背景图.png"
              alt="banner-bg"
            />
            <img
              className="absolute w-full h-full bottom-0 left-1/2 -translate-x-1/2 object-cover"
              src={bigBannerForeground}
              alt="banner-fg"
            />
          </div>
        </div>

        <div className="w-full pl-4 h-[91px] mt-4 overflow-x-auto scrollbar-hide" style={{ scrollSnapType: 'x mandatory' }}>
          <div className="flex gap-2 h-full">
            {miniBanners.map((url, i) => (
              <img key={i} src={url} alt={`mini-banner-${i + 1}`} className="h-full w-auto flex-shrink-0" />
            ))}
          </div>
        </div>

        <img className="w-[335px] my-4" src={contentImage} alt="content" />
      </div>

      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/底部/底部标签栏.png"
          alt="tabBar"
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}
