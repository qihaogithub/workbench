interface DemoProps {
  title?: string;
  subtitle?: string;
}

const subjectStyles: Record<string, { card: string; title: string; subtitle: string }> = {
  reading: {
    card: 'bg-[#FFF3EB]',
    title: 'text-[#6B2D03]',
    subtitle: 'text-[#E35B00]',
  },
  puzzle: {
    card: 'bg-[#EBF9FF]',
    title: 'text-[#004161]',
    subtitle: 'text-[#0090D9]',
  },
  art: {
    card: 'bg-[#F9F5FF]',
    title: 'text-[#452270]',
    subtitle: 'text-[#8D4BDE]',
  },
  writing: {
    card: 'bg-[#EEFCEB]',
    title: 'text-[#0E5200]',
    subtitle: 'text-[#40A12D]',
  },
  english: {
    card: 'bg-[#FFF0F3]',
    title: 'text-[#CC2D52]',
    subtitle: 'text-[#780A23]',
  },
};

export default function PhoneKuokeCard({ title = '趣味英语训练营', subtitle = '沉浸体验 激发兴趣', ...restProps }: DemoProps) {
  const { resourceImageURL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/%E6%89%A9%E7%A7%91%E5%8D%A1%E7%89%87/%E7%B4%A0%E6%9D%90%E5%9B%BE.png', subjectTheme = 'english' } = restProps as Record<string, unknown>;

  const style = subjectStyles[subjectTheme as string] || subjectStyles.english;

  return (
    <div
      className="w-full min-h-screen bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 375,
        margin: '0 auto',
      }}
    >
      <div className="flex-shrink-0 w-full">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/%E6%89%A9%E7%A7%91%E5%8D%A1%E7%89%87/phone/%E9%A1%B6%E9%83%A8%E5%9B%BE%E7%89%87.png"
          alt="顶部"
          className="w-full h-auto"
        />
      </div>

      <div className="flex-1 flex flex-col gap-0">
        <div className="px-5 w-full">
          <div className={`flex justify-between h-[88px] px-[14px] items-center rounded-[24px] gap-2 ${style.card}`}
            style={{ boxShadow: '0px -4px 10px 0px rgba(255, 229, 235, 0.8) inset' }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img
                src={resourceImageURL}
                alt="配图"
                className="w-[60px] h-[60px] flex-shrink-0 rounded-lg"
              />
              <div className="flex flex-col gap-1 justify-center h-full">
                <span className={`text-[16px] font-semibold leading-[1.2] ${style.title}`}>
                  {title}
                </span>
                <span className={`text-[14px] font-normal leading-[150%] ${style.subtitle}`}>
                  {subtitle}
                </span>
              </div>
            </div>
            <button className="text-[#6b430b] text-center border-none px-3 py-[7px] rounded-[25px] bg-[#fcda00] text-[14px] font-semibold leading-[150%] cursor-pointer flex-shrink-0">
              立即体验
            </button>
          </div>
        </div>

        <div className="w-full flex-shrink-0">
          <img
            src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/%E6%89%A9%E7%A7%91%E5%8D%A1%E7%89%87/%E5%B1%95%E5%BC%80%26%E6%94%B6%E8%B5%B7.png"
            alt="展开收起"
            className="w-full h-auto"
          />
        </div>
      </div>

      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E5%AD%A6%E4%B9%A0%E9%A1%B5/%E5%BA%95%E9%83%A8%E6%A0%87%E7%AD%BE%E6%A0%8F.png"
          alt="标签栏"
          className="w-full h-auto"
        />
      </div>
    </div>
  );
}
