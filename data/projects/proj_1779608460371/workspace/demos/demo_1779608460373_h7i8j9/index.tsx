interface DemoProps {
  /** 对应 uiweb-vue updateImage2：平板广告图，1行1个 */
  padSingleAdImage?: string;
  /** 对应 uiweb-vue updateImage3：轮播广告图 */
  carouselAdImage?: string;
}

const padAssetBase = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/pad';
const sharedPhoneAssetBase = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/手机';

export default function PadBanduAd({
  padSingleAdImage = `${padAssetBase}/一行1个.png`,
  carouselAdImage = `${sharedPhoneAssetBase}/广告图.png`,
}: DemoProps) {
  const sideImages = ['配图-3.png', '配图-4.png', '配图-5.png', '配图-6.png'];

  return (
    <div
      className="relative mx-auto overflow-hidden bg-white"
      style={{ width: 1133, maxWidth: '100%', height: '100vh', minHeight: 749 }}
    >
      <img
        src={`${padAssetBase}/底部吸顶内容.png`}
        alt="顶部吸顶内容"
        className="absolute left-px top-0 z-20 h-[90px] w-[1132px]"
      />

      <div className="absolute left-0 top-[90px] flex h-[592px] w-[1133px] flex-col items-center bg-white">
        <img src={`${padAssetBase}/1.png`} alt="顶部区域" className="h-[188px] w-[1133px] shrink-0 object-cover" />

        <div className="shrink-0 overflow-hidden rounded-[12px] bg-white">
          <img src={padSingleAdImage} alt="平板广告图" className="h-[180px] w-[1005px] object-cover" />
        </div>

        <div className="flex w-[1133px] shrink-0 flex-col items-start">
          <img src={`${padAssetBase}/配图-1.png`} alt="活动标题" className="h-[61px] w-[1133px]" />

          <div className="flex h-[100px] w-full items-center gap-[10px] px-[64px]">
            <img
              src={carouselAdImage}
              alt="轮播广告图"
              className="h-full w-[210px] rounded-[9px] bg-[#d9d9d9] object-cover"
            />

            {sideImages.map((imageName) => (
              <img
                key={imageName}
                src={`${padAssetBase}/${imageName}`}
                alt=""
                className="h-[100px] rounded-[9px]"
              />
            ))}
          </div>
        </div>
      </div>

      <img
        src={`${padAssetBase}/吸底标签栏.png`}
        alt="底部标签栏"
        className="absolute bottom-0 left-px z-20 h-[62px] w-[1132px]"
      />
    </div>
  );
}
