interface DemoProps {
  mainTitle?: string;
  subTitle?: string;
  primaryBtnText?: string;
  secondaryBtnText?: string;
  showTitles?: boolean;
}

export default function PadBanduAd({
  mainTitle = '专业老师伴读，学习更高效',
  subTitle = '1对1指导，帮助孩子养成良好学习习惯',
  primaryBtnText = '立即体验',
  secondaryBtnText = '了解更多',
  showTitles = true,
  ...restProps
}: DemoProps) {
  const {
    adImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/pad/伴读广告图.png',
    padBgImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/pad/伴读广告背景.png',
  } = restProps as Record<string, unknown>;

  return (
    <div
      className="w-full min-h-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 1024,
        margin: '0 auto',
        backgroundImage: `url(${padBgImage as string})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        className="flex-1 flex justify-center items-center w-full h-full"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      >
        <div className="flex flex-col items-center gap-5 w-[600px] px-10">
          <img
            src={adImage as string}
            alt="ad"
            className="w-full max-w-[400px] h-auto rounded-[16px] object-cover"
            style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
          />

          {showTitles && (
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="text-[32px] font-semibold text-[#1a1a1a] leading-[140%]"
                style={{ fontFamily: '"PingFang SC", sans-serif' }}
              >
                {mainTitle}
              </div>
              <div
                className="text-[20px] text-[#666] leading-[150%]"
                style={{ fontFamily: '"PingFang SC", sans-serif' }}
              >
                {subTitle}
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-4 w-full">
            <div
              className="flex justify-center items-center w-[280px] h-14 rounded-[24px] text-white text-[20px] font-medium cursor-pointer transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, #ff6b6b, #ff5252)',
                boxShadow: '0 4px 15px rgba(255, 82, 82, 0.3)',
              }}
            >
              {primaryBtnText}
            </div>
            <div
              className="text-[18px] text-[#666] underline cursor-pointer transition-colors duration-300 hover:text-[#333]"
              style={{ fontFamily: '"PingFang SC", sans-serif' }}
            >
              {secondaryBtnText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
