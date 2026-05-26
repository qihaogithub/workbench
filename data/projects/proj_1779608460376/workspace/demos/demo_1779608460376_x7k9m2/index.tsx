interface DemoProps {
  buttonImage?: string;
  tabbarImage?: string;
}

const SUBJECT_STYLES: Record<string, { bg: string }> = {
  reading: { bg: '#fff3eb' },
  puzzle: { bg: '#ebf9ff' },
  art: { bg: '#f9f5ff' },
  writing: { bg: '#eefceb' },
  english: { bg: '#fff0f3' },
};

export default function PhoneNianKeXuFei({ buttonImage, tabbarImage, ...restProps }: DemoProps) {
  const { phoneResourceImage, subject = 'reading' } = restProps as Record<string, unknown>;
  const s = SUBJECT_STYLES[subject as string] || SUBJECT_STYLES.reading;

  return (
    <div
      className="w-[375px] h-full bg-gray-200 flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="flex flex-col mt-auto w-full">
        <div
          className="pt-5 rounded-t-[24px] overflow-hidden"
          style={{ backgroundColor: s.bg }}
        >
          <div className="ml-[21px] mr-[18px] w-[335px]">
            {phoneResourceImage ? (
              <img src={phoneResourceImage as string} alt="resource" className="w-[335px] block" />
            ) : (
              <div className="w-[335px] h-[200px] bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
                资源图
              </div>
            )}
          </div>
          <div
            className="h-[60px] relative z-10 -mt-10"
            style={{
              backgroundImage: 'linear-gradient(0deg, #ffffff 0%, #ffffff00 100%)',
            }}
          />
        </div>
        {buttonImage ? (
          <img src={buttonImage} alt="button" className="w-full block" />
        ) : (
          <div className="w-full h-20 bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
            按钮图片
          </div>
        )}
        {tabbarImage ? (
          <img src={tabbarImage} alt="tabbar" className="w-full block" />
        ) : (
          <div className="w-full h-20 bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
            底部标签栏
          </div>
        )}
      </div>
    </div>
  );
}
