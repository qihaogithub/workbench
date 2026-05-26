interface DemoProps {
  buttonImage?: string;
}

const SUBJECT_STYLES: Record<string, { bg: string }> = {
  reading: { bg: '#fff3eb' },
  puzzle: { bg: '#ebf9ff' },
  art: { bg: '#f9f5ff' },
  writing: { bg: '#eefceb' },
  english: { bg: '#fff0f3' },
};

export default function PadNianKeXuFei({ buttonImage, ...restProps }: DemoProps) {
  const { padResourceImage, subject = 'reading' } = restProps as Record<string, unknown>;
  const s = SUBJECT_STYLES[subject as string] || SUBJECT_STYLES.reading;

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-gray-200 overflow-hidden"
      style={{
        maxWidth: 1133,
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="flex flex-col items-center rounded-[24px] bg-white overflow-hidden" style={{ width: 468 }}>
        <div
          className="w-full flex flex-col items-center p-6 rounded-t-[29.952px] overflow-hidden relative"
          style={{ backgroundColor: s.bg }}
        >
          <div className="w-full">
            {padResourceImage ? (
              <img src={padResourceImage as string} alt="resource" className="w-full block" />
            ) : (
              <div className="w-full h-[200px] bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
                资源图
              </div>
            )}
          </div>
          <div
            className="absolute left-0 bottom-0 w-full h-[60px] pointer-events-none z-10"
            style={{
              backgroundImage: 'linear-gradient(0deg, #ffffff 0%, #ffffff00 100%)',
            }}
          />
        </div>
        <div className="w-full">
          {buttonImage ? (
            <img src={buttonImage} alt="button" className="w-full block" />
          ) : (
            <div className="w-full h-20 bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
              按钮图片
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
