import { ChevronRight } from 'lucide-react';

interface DemoProps {
  serviceTitle?: string;
  teacherName?: string;
  feature1Name?: string;
  feature1Status?: string;
  feature2Name?: string;
  feature3Name?: string;
  historyText?: string;
}

export default function PadAfterSchool({
  serviceTitle = '全年系统包-L1',
  teacherName = '苹果指导师',
  feature1Name = '学习报告',
  feature1Status = '3篇报告未读',
  feature2Name = '活动挑战',
  feature3Name = '随堂故事',
  historyText = '查看往期课程',
  ...restProps
}: DemoProps) {
  const { bannerImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/banner.png' } = restProps as Record<string, unknown>;

  const featureRows = [
    [
      { name: feature1Name, status: feature1Status, icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon.png' },
      { name: feature2Name, status: '', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-1.png' },
    ],
    [
      { name: feature3Name, status: '', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-2.png' },
    ],
  ];

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
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/pad/pad状态栏和导航栏.png"
          alt="nav-status"
          className="w-full h-auto"
        />
      </div>

      <div className="flex-1 px-[137px] flex flex-col gap-10 mt-5 overflow-y-auto">
        <div className="w-full h-[160px] rounded-[10px] overflow-hidden flex-shrink-0">
          <img
            src={bannerImage as string}
            alt="banner"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between w-full">
            <span
              className="text-[22.5px] font-medium text-[#4d4d4d]"
              style={{ fontFamily: '"PingFang SC", sans-serif' }}
            >
              {serviceTitle}
            </span>
            <div className="flex items-center gap-[5px]">
              <span
                className="text-[17.5px] text-[#666666]"
                style={{ fontFamily: '"PingFang SC", sans-serif' }}
              >
                {teacherName}
              </span>
              <img
                src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/指导师头像.png"
                alt="teacher"
                className="w-[30px] h-[30px] rounded-[11.25px]"
                style={{ backgroundColor: '#fcda00' }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {featureRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-5 w-full">
                {row.map((feature, colIndex) => (
                  <div
                    key={colIndex}
                    className="h-20 bg-[#fff3eb] rounded-[22.5px] flex items-center justify-between px-[25px]"
                    style={{ flex: row.length === 1 ? '0 0 100%' : '0 0 calc(50% - 10px)' }}
                  >
                    <div className="flex items-center gap-[10px] flex-1 min-w-0">
                      <img
                        src={feature.icon}
                        alt=""
                        className="w-[45px] h-[45px] rounded-[13.125px] flex-shrink-0"
                      />
                      <span
                        className="text-[20px] font-medium text-[#6b2d03] truncate"
                        style={{ fontFamily: '"PingFang SC", sans-serif' }}
                      >
                        {feature.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-[5px] flex-shrink-0 ml-2">
                      {feature.status && (
                        <span
                          className="text-[17.5px] text-[#e35b00] whitespace-nowrap"
                          style={{ fontFamily: '"PingFang SC", sans-serif' }}
                        >
                          {feature.status}
                        </span>
                      )}
                      <ChevronRight className="w-5 h-5 text-[#ffa66b]" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-1 mt-5">
            <span
              className="text-[17.5px] text-[#b2b2b2]"
              style={{ fontFamily: '"PingFang SC", sans-serif' }}
            >
              {historyText}
            </span>
            <ChevronRight className="w-5 h-5 text-[#e0dfdf]" />
          </div>
        </div>
      </div>
    </div>
  );
}
