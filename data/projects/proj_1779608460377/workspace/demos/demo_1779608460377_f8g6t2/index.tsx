interface DemoProps {
  closeButtonColor?: string;
}

export default function PadPopup({ closeButtonColor = 'white', ...restProps }: DemoProps) {
  const { popupImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/通用广告弹窗/默认弹窗.png', contentType = 'image' } = restProps as Record<string, unknown>;
  const showImage = contentType === 'image';

  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden"
      style={{
        maxWidth: 1024,
        margin: '0 auto',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="flex flex-col items-center justify-center w-full h-full bg-black/70">
        <div
          className="flex flex-col justify-center items-end"
          style={{ width: '26.171875em', padding: '0.5em 0' }}
        >
          <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
            <rect width="42" height="42" fill="black" fillOpacity="0.01" />
            <circle
              cx="21"
              cy="21.0002"
              r="18.0955"
              stroke={closeButtonColor}
              strokeWidth="1.26847"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M26.6199 17.5782C27.126 16.9651 27.0923 16.0559 26.5186 15.4822C25.9091 14.8727 24.9208 14.8727 24.3113 15.4822L21.0002 18.7933L17.6892 15.4822L17.5778 15.381C16.9647 14.8748 16.0555 14.9086 15.4819 15.4822C14.8723 16.0918 14.8723 17.08 15.4819 17.6896L18.7929 21.0006L15.482 24.3115L15.3808 24.4229C14.8746 25.036 14.9083 25.9452 15.482 26.5188C16.0916 27.1284 17.0798 27.1284 17.6893 26.5188L21.0002 23.2079L24.3111 26.5188L24.4225 26.6201C25.0356 27.1263 25.9448 27.0925 26.5185 26.5188C27.128 25.9093 27.128 24.9211 26.5185 24.3115L23.2076 21.0006L26.5186 17.6896L26.6199 17.5782Z"
              fill={closeButtonColor}
            />
          </svg>
        </div>
        <div
          style={{ width: '26.171875em', maxHeight: '34.765625em', minHeight: '26.171875em' }}
        >
          {showImage ? (
            <img src={popupImage as string} alt="popup" className="w-full h-auto" />
          ) : (
            <div
              className="bg-gray-200 flex items-center justify-center text-gray-400 text-sm"
              style={{ width: '26.171875em', height: '34.765625em' }}
            >
              SVGA动画区域
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
