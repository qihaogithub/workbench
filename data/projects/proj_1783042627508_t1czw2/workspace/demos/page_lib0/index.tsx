interface DemoProps {
  /** 替换图片 - 手机广告图 */
  field?: string;
}

export default function PhoneBanduAd({
  field = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/手机/一行一个广告图.png',
}: DemoProps) {
  const padAssetBase = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/pad';
  const phoneAssetBase = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/手机';

  const sideImages = ['配图-3.png', '配图-4.png', '配图-5.png', '配图-6.png'];

  return (
    <div className="relative mx-auto h-[812px] w-full max-w-[375px] overflow-hidden bg-white">
      {/* 顶部吸顶内容 */}
      <img
        src={`${padAssetBase}/底部吸顶内容.png`}
        alt="顶部吸顶内容"
        className="absolute left-0 top-0 z-20 h-[50px] w-full object-cover"
      />

      {/* 主内容区 */}
      <div className="absolute left-0 top-[50px] flex w-full flex-col items-center bg-white">
        {/* 顶部区域 */}
        <img
          src={`${padAssetBase}/1.png`}
          alt="顶部区域"
          className="h-[110px] w-full shrink-0 object-cover"
        />

        {/* 可配置广告图 */}
        <div className="w-full shrink-0 px-[16px]">
          <img
            src={field}
            alt="广告图"
            className="h-[150px] w-full rounded-[8px] object-cover"
          />
        </div>

        {/* 活动标题 */}
        <img
          src={`${padAssetBase}/配图-1.png`}
          alt="活动标题"
          className="h-[40px] w-full shrink-0 object-cover"
        />

        {/* 轮播广告行 */}
        <div className="flex h-[76px] w-full items-center gap-[6px] px-[16px]">
          <img
            src={`${phoneAssetBase}/广告图.png`}
            alt="轮播广告图"
            className="h-full w-[100px] shrink-0 rounded-[6px] bg-[#d9d9d9] object-cover"
          />
          <div className="flex h-full flex-1 gap-[6px] overflow-hidden">
            {sideImages.map((imageName) => (
              <img
                key={imageName}
                src={`${padAssetBase}/${imageName}`}
                alt=""
                className="h-full flex-1 rounded-[6px] object-cover"
              />
            ))}
          </div>
        </div>
      </div>

      {/* 底部标签栏 */}
      <img
        src={`${padAssetBase}/吸底标签栏.png`}
        alt="底部标签栏"
        className="absolute bottom-0 left-0 z-20 h-[48px] w-full object-cover"
      />
    </div>
  );
}