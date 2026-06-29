interface DemoProps {
  popupImage?: string;
  mainButtonText?: string;
  secondaryButtonText?: string;
}

export default function PhoneBottomPopup({
  popupImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/底部广告弹窗/配图.png',
  mainButtonText = '去看看',
  secondaryButtonText = '下次再说',
}: DemoProps) {
  return (
    <div
      className="relative w-full overflow-hidden bg-white"
      style={{
        height: '100vh',
        maxWidth: 375,
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url(https://uiweb.oss-cn-chengdu.aliyuncs.com/img/通用广告弹窗/广场页phone.png)',
        }}
      />
      <div className="absolute inset-0 bg-black/70 flex items-end justify-center">
        <div className="w-full flex flex-col">
          <img src={popupImage} alt="" className="w-full block object-cover" />
          <div className="flex flex-col items-center gap-5 px-4 pb-5 pt-2 bg-white">
            <div className="flex flex-col items-center gap-4 w-full">
              <div
                className="flex justify-center items-center w-[280px] h-11 rounded-[30px] cursor-pointer"
                style={{ backgroundColor: '#fcda00' }}
              >
                <span
                  className="text-[#544300] text-center text-lg font-medium leading-[150%]"
                  style={{ fontFamily: '"PingFang SC", sans-serif' }}
                >
                  {mainButtonText}
                </span>
              </div>
              <span
                className="text-[#666] text-center text-lg font-normal leading-[150%] cursor-pointer"
                style={{ fontFamily: '"PingFang SC", sans-serif' }}
              >
                {secondaryButtonText}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
