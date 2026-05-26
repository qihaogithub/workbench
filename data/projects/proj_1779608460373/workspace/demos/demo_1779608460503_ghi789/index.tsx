interface DemoProps {
  cardTitle?: string;
  cardSubtitle?: string;
  cardButtonText?: string;
}

const THEMES: Record<string, { bg: string; title: string; subtitle: string }> = {
  yellow: { bg: '#fcf9de', title: '#544300', subtitle: '#dbaf00' },
  puzzle: { bg: '#fff3eb', title: '#6b2d03', subtitle: '#e35b00' },
  brown: { bg: '#fef7e5', title: '#664314', subtitle: '#986c31' },
  blue: { bg: '#ebf9ff', title: '#004161', subtitle: '#0090d9' },
  green: { bg: '#eefceb', title: '#0e5200', subtitle: '#40a12d' },
  purple: { bg: '#f9f5ff', title: '#452270', subtitle: '#8d4bde' },
  pink: { bg: '#fff0f3', title: '#780a23', subtitle: '#cc2d52' },
  red: { bg: '#fff2f0', title: '#781a0c', subtitle: '#cc2f16' },
  grassy: { bg: '#fbfce8', title: '#3d4200', subtitle: '#a9b52d' },
  cyan: { bg: '#edfbfc', title: '#00484f', subtitle: '#009aa8' },
};

export default function PhoneActivityCard({
  cardTitle = '主标题文案',
  cardSubtitle = '副标题文案',
  cardButtonText = '按钮文案',
  ...restProps
}: DemoProps) {
  const {
    cardImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/top.png',
    theme = 'yellow',
  } = restProps as Record<string, unknown>;

  const t = THEMES[theme as string] || THEMES.yellow;

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden bg-white"
      style={{
        maxWidth: 375,
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/top.png"
          alt=""
          className="w-full h-auto block"
        />
      </div>

      <div className="flex flex-col gap-[14px] p-5 flex-1">
        <div
          className="flex justify-between items-center h-[88px] pr-[14px] rounded-2xl overflow-hidden flex-shrink-0"
          style={{ backgroundColor: t.bg }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src={cardImage}
              alt=""
              className="w-[100px] h-[88px] object-cover flex-shrink-0 block"
            />
            <div className="flex flex-col gap-1 overflow-hidden">
              <div
                className="text-base font-semibold truncate"
                style={{ color: t.title }}
              >
                {cardTitle}
              </div>
              <div
                className="text-sm truncate"
                style={{ color: t.subtitle }}
              >
                {cardSubtitle}
              </div>
            </div>
          </div>
          <div
            className="px-3 py-[7px] rounded-[25px] text-sm font-semibold whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: '#fcda00', color: '#6b430b' }}
          >
            {cardButtonText}
          </div>
        </div>

        <div
          className="flex justify-between items-center h-[88px] pr-[14px] rounded-2xl overflow-hidden flex-shrink-0"
          style={{ backgroundColor: t.bg }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src={cardImage}
              alt=""
              className="w-[100px] h-[88px] object-cover flex-shrink-0 block"
            />
            <div className="flex flex-col gap-1 overflow-hidden">
              <div
                className="text-base font-semibold truncate"
                style={{ color: t.title }}
              >
                {cardTitle}
              </div>
              <div
                className="text-sm truncate"
                style={{ color: t.subtitle }}
              >
                {cardSubtitle}
              </div>
            </div>
          </div>
          <div
            className="w-10 h-10 flex-shrink-0 rounded-lg"
            style={{ backgroundColor: '#d1d5db' }}
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-[60px]" style={{ backgroundColor: '#d1d5db' }} />
    </div>
  );
}
