import { ChevronRight } from 'lucide-react';

interface DemoProps {
  inviteTitle?: string;
  inviteSubtitle?: string;
  mallTitle?: string;
  inviteBgColor1?: string;
  inviteBgColor2?: string;
  mallBgColor?: string;
}

export default function PadMinePage({
  inviteTitle = '邀请活动',
  inviteSubtitle = '邀请奖励记录',
  mallTitle = '叫叫商场',
  inviteBgColor1 = '#ff9045',
  inviteBgColor2 = '#ff715c',
  mallBgColor = '#fef7e5',
  ...restProps
}: DemoProps) {
  const {
    inviteImage1URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E9%82%80%E8%AF%B7%E6%B4%BB%E5%8A%A801.png',
    inviteImage2URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E9%82%80%E8%AF%B7%E6%B4%BB%E5%8A%A802.png',
    mallImage1URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E5%95%86%E5%9C%BA1.png',
    mallImage2URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E5%95%86%E5%9C%BA2.png',
  } = restProps as Record<string, unknown>;

  return (
    <div
      className="w-full min-h-screen flex flex-col overflow-hidden bg-[#f5f5f5]"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 1024,
        margin: '0 auto',
        position: 'relative',
      }}
    >
      <img
        src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/pad/%E9%A1%B6%E9%83%A8.png"
        alt="顶部"
        className="w-full h-auto flex-shrink-0"
      />

      <div className="flex-1 flex flex-col gap-4 px-0 overflow-x-hidden pb-[100px]">
        <div className="flex flex-col gap-2" style={{ margin: '0 177px' }}>
          <div className="flex justify-between px-1 gap-[10px]">
            <p className="text-[#666] text-[22.5px] font-medium m-0">
              {inviteTitle}
            </p>
            <div className="flex justify-end items-center flex-1 text-[#b2b2b2] text-right text-[15px] font-normal">
              <span>{inviteSubtitle}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch h-16">
            <div
              className="flex h-full flex-1 flex-col justify-center items-center rounded-[16px] overflow-hidden"
              style={{ backgroundColor: inviteBgColor1 }}
            >
              <img
                src={inviteImage1URL}
                alt="邀请活动01"
                className="h-full object-contain"
              />
            </div>
            <div
              className="flex h-full flex-1 flex-col justify-center items-center rounded-[16px] overflow-hidden"
              style={{ backgroundColor: inviteBgColor2 }}
            >
              <img
                src={inviteImage2URL}
                alt="邀请活动02"
                className="h-full object-contain"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2" style={{ margin: '0 177px' }}>
          <div className="flex justify-between px-1 gap-[10px]">
            <p className="text-[#666] text-[22.5px] font-medium m-0">
              {mallTitle}
            </p>
            <div className="flex justify-end items-center flex-1 text-[#b2b2b2] text-right">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch h-16">
            <div
              className="flex h-full flex-1 flex-col justify-center items-center rounded-[16px] overflow-hidden"
              style={{ backgroundColor: mallBgColor }}
            >
              <img
                src={mallImage1URL}
                alt="商场1"
                className="h-full object-contain"
              />
            </div>
            <div
              className="flex h-full flex-1 flex-col justify-center items-center rounded-[16px] overflow-hidden"
              style={{ backgroundColor: mallBgColor }}
            >
              <img
                src={mallImage2URL}
                alt="商场2"
                className="h-full object-contain"
              />
            </div>
          </div>
        </div>

        <img
          src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/pad/%E8%81%94%E7%B3%BB%E7%94%B5%E8%AF%9D.png"
          alt="联系电话"
          className="w-[560px] h-auto mx-auto"
        />
      </div>

      <img
        src="https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/pad/%E6%A0%87%E7%AD%BE%E6%A0%8F.png"
        alt="标签栏"
        className="w-full flex-shrink-0"
        style={{ position: 'absolute', bottom: 0 }}
      />
    </div>
  );
}
