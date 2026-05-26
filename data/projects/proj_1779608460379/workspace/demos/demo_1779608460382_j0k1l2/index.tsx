interface DemoProps {}

export default function PadTaskCard(props: DemoProps) {
  const {
    padImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/%E9%85%8D%E5%9B%BE-pad.png',
    auxiliaryText = '这里是辅助文案',
    cardTitle = '这里是活动标题',
    cardBtn = '立即参与',
  } = props as Record<string, unknown>;

  return (
    <div
      className="w-full min-h-screen bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 1024,
        margin: '0 auto',
      }}
    >
      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/top-pad.png"
          alt="nav-status"
          className="w-full h-auto"
        />
      </div>

      <div className="flex-1 flex items-center justify-center w-[89.333%] mx-auto">
        <div className="w-full rounded-2xl bg-[#fff3eb] p-[10px]">
          <div className="text-[#e35b00] text-xs mb-[5px] ml-[3.75px]">
            {auxiliaryText}
          </div>
          <div className="bg-white rounded-2xl overflow-hidden">
            <img
              className="w-full block"
              src={padImage}
              alt="card-image"
            />
            <div className="flex items-center justify-between h-10 px-2">
              <span className="text-[#6b2d03]" style={{ fontSize: '0.8rem' }}>
                {cardTitle}
              </span>
              <button
                className="bg-[#fcda00] text-[#6b430b] rounded-[25px] px-3 py-1 border-none cursor-pointer whitespace-nowrap"
                style={{ fontSize: '0.8rem' }}
              >
                {cardBtn}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/%E5%BA%95%E9%83%A8%E6%A0%87%E7%AD%BE%E6%A0%8F-pad.png"
          alt="bottom-tab"
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}
