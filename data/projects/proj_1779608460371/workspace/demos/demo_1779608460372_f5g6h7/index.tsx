interface DemoProps {
  /** 对应 uiweb-vue updateImage1：手机广告图，1行1个 */
  phoneSingleAdImage?: string;
  /** 对应 uiweb-vue updateImage3：轮播广告图 */
  carouselAdImage?: string;
}

const phoneAssetBase = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/手机';

export default function PhoneBanduAd({
  phoneSingleAdImage = `${phoneAssetBase}/一行一个广告图.png`,
  carouselAdImage = `${phoneAssetBase}/广告图.png`,
}: DemoProps) {
  return (
    <div
      className="relative mx-auto overflow-hidden bg-white"
      style={{ width: 375, maxWidth: '100%', height: '100vh', minHeight: 812 }}
    >
      <img
        src={`${phoneAssetBase}/底部吸顶内容.png`}
        alt="顶部吸顶内容"
        className="absolute left-0 top-0 z-20 w-[375px]"
      />

      <div className="absolute left-0 top-[141px] flex h-[585px] w-[375px] flex-col items-center overflow-x-hidden overflow-y-auto bg-white">
        <div className="flex flex-col items-center">
          <img src={`${phoneAssetBase}/重磅更新标题.png`} alt="重磅更新" className="w-[344px]" />
          <img src={phoneSingleAdImage} alt="手机广告图" className="h-[180px] w-[344px] object-cover" />
          <img src={`${phoneAssetBase}/叫叫活动标题.png`} alt="叫叫活动" className="w-[344px]" />
        </div>

        <div className="h-[180px] w-[344px] shrink-0 overflow-hidden rounded-[10px] bg-[#d9d9d9]">
          <img src={carouselAdImage} alt="轮播广告图" className="h-full w-full object-cover" />
        </div>

        <img src={`${phoneAssetBase}/下.png`} alt="底部内容" className="w-[375px] shrink-0" />
      </div>

      <img
        src={`${phoneAssetBase}/吸底标签栏.png`}
        alt="底部标签栏"
        className="absolute bottom-0 left-0 z-20 h-[86px] w-[375px]"
      />
    </div>
  );
}