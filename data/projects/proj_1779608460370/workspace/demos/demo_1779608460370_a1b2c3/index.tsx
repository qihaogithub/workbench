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

export default function PhoneAfterSchool({
  serviceTitle = '全年系统包-L1',
  teacherName = '苹果指导师',
  feature1Name = '学习报告',
  feature1Status = '3篇报告未读',
  feature2Name = '活动挑战',
  feature3Name = '趣味复习',
  historyText = '查看往期课程服务',
  ...restProps
}: DemoProps) {
  const { bannerImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/banner.png' } = restProps as Record<string, unknown>;

  const features = [
    { name: feature1Name, status: feature1Status, icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon.png' },
    { name: feature2Name, status: '', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-1.png' },
    { name: feature3Name, status: '', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-2.png' },
  ];

  return (
    <div
      className="w-full min-h-screen bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 375,
        margin: '0 auto',
      }}
    >
      <div className="w-full flex-shrink-0">
        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/手机/原生/导航&状态.png"
          alt="nav-status"
          className="w-full h-auto"
        />
      </div>

      <div className="flex-1 px-5 flex flex-col gap-6 mt-5 overflow-y-auto">
        <div className="w-full h-[112px] rounded-[10px] overflow-hidden flex-shrink-0">
          <img
            src={bannerImage as string}
            alt="banner"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col gap-[14px]">
          <div className="flex items-center justify-between w-full">
            <span
              className="text-[20px] font-medium text-[#4d4d4d]"
              style={{ fontFamily: '"PingFang SC", sans-serif' }}
            >
              {serviceTitle}
            </span>
            <div className="flex items-center gap-1">
              <span
                className="text-[14px] text-[#666666]"
                style={{ fontFamily: '"PingFang SC", sans-serif' }}
              >
                {teacherName}
              </span>
              <img
                src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/指导师头像.png"
                alt="teacher"
                className="w-6 h-6 rounded-[9px]"
                style={{ backgroundColor: '#fcda00' }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            {features.map((feature, index) => (
              <div
                key={index}
                className="w-full h-16 bg-[#fff3eb] rounded-[18px] flex items-center justify-between px-5"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <img
                    src={feature.icon}
                    alt=""
                    className="w-9 h-9 rounded-[10.5px] flex-shrink-0"
                  />
                  <span
                    className="text-[16px] font-medium text-[#6b2d03] truncate"
                    style={{ fontFamily: '"PingFang SC", sans-serif' }}
                  >
                    {feature.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {feature.status && (
                    <span
                      className="text-[14px] text-[#e35b00] whitespace-nowrap"
                      style={{ fontFamily: '"PingFang SC", sans-serif' }}
                    >
                      {feature.status}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#ffa66b]" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-1 mt-2.5">
            <span
              className="text-[14px] text-[#b2b2b2]"
              style={{ fontFamily: '"PingFang SC", sans-serif' }}
            >
              {historyText}
            </span>
            <ChevronRight className="w-4 h-4 text-[#e0dfdf]" />
          </div>
        </div>
      </div>

      <div className="w-full h-[34px] flex items-center justify-center flex-shrink-0">
        <div className="w-[134px] h-[5px] bg-black rounded-full" />
      </div>
    </div>
  );
}
