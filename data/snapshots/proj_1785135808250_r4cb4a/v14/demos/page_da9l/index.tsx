interface DemoProps {}

const rankList = [
  {
    rank: 1,
    rankBadge: "/api/images/img_B8T1KJ2KNi8RyA",
    avatar: "/api/images/img_UTEzqTbJvnnxhA",
    name: "孙*茹",
    score: "99关",
    bgGradient: "linear-gradient(90deg, #FFEFE9 0%, #ffffff 100%)",
    nameColor: "#781A0C",
    scoreColor: "#781A0C",
  },
  {
    rank: 2,
    rankBadge: "/api/images/img_zZYguG_carlT1A",
    avatar: "/api/images/img_iAI8tPNQbmy2nw",
    name: "郑*",
    score: "99关",
    bgGradient: "linear-gradient(90deg, #E9F2FD 0%, rgba(255,255,255,0) 100%)",
    nameColor: "#004161",
    scoreColor: "#004161",
  },
  {
    rank: 3,
    rankBadge: "/api/images/img_8E-ojJW7nwEE4Q",
    avatar: "/api/images/img_loM-yZD8ZtD7Ig",
    name: "冯*云",
    score: "99关",
    bgGradient: "linear-gradient(90deg, #FFF4E5 0%, rgba(255,255,255,0) 100%)",
    nameColor: "#664314",
    scoreColor: "#664314",
  },
  {
    rank: 4,
    avatar: "/api/images/img_NXQTlssceqJLxA",
    name: "赵*凤",
    score: "29关",
    nameColor: "#404040",
    scoreColor: "#404040",
  },
  {
    rank: 5,
    avatar: "/api/images/img_cV0K7BVI1V-bIw",
    name: "郑*雅",
    score: "29关",
    nameColor: "#404040",
    scoreColor: "#404040",
  },
  {
    rank: 6,
    avatar: "/api/images/img_zGfABxhTKIHNjw",
    name: "冯*彬",
    score: "29关",
    nameColor: "#404040",
    scoreColor: "#404040",
  },
  {
    rank: 7,
    avatar: "/api/images/img_Sne7t61qQ1RL7w",
    name: "吴*萱",
    score: "29关",
    nameColor: "#404040",
    scoreColor: "#404040",
  },
  {
    rank: 8,
    avatar: "/api/images/img_cP9G0N6KMyl4Bg",
    name: "吴*萱",
    score: "29关",
    nameColor: "#404040",
    scoreColor: "#404040",
  },
];

export default function Leaderboard(_props: DemoProps) {
  return (
    <div className="relative w-[375px] h-[812px] bg-[#FAFAFA] overflow-hidden mx-auto font-['PingFang_SC']">
      {/* 背景封面图 */}
      <img
        src="/api/images/img_hZK-nyB_uDFvMg"
        alt=""
        className="absolute left-[-0.45px] top-0 w-[375px] h-[240px] object-cover"
      />

      {/* 状态栏 */}
      <div className="absolute top-0 left-0 w-[375px] h-[44px] flex-shrink-0">
        {/* 时间 */}
        <div className="absolute left-[20.6px] top-[16.81px]">
          <svg width="24" height="11" viewBox="0 0 24 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.486 0C4.704 0 5.628 0.434 6.272 1.33C6.888 2.184 7.21 3.374 7.21 4.914C7.21 6.538 6.874 7.854 6.216 8.862C5.53 9.87 4.62 10.388 3.472 10.388C1.526 10.388 0.434 9.478 0.182 7.672H1.666C1.862 8.638 2.478 9.128 3.486 9.128C4.172 9.128 4.718 8.778 5.138 8.106C5.53 7.462 5.74 6.65 5.74 5.684C5.74 5.628 5.726 5.572 5.726 5.502H5.67C5.39 5.936 5.026 6.258 4.606 6.482C4.2 6.678 3.738 6.79 3.22 6.79C2.24 6.79 1.442 6.468 0.854 5.838C0.28 5.222 0 4.424 0 3.444C0 2.436 0.322 1.624 0.994 0.98C1.666 0.322 2.492 0 3.486 0ZM3.542 1.26C2.926 1.26 2.422 1.456 2.058 1.876C1.68 2.282 1.498 2.8 1.498 3.444C1.498 4.088 1.68 4.592 2.058 4.97C2.408 5.362 2.898 5.558 3.528 5.558C4.144 5.558 4.648 5.362 5.012 4.97C5.376 4.578 5.558 4.046 5.558 3.402C5.558 2.744 5.362 2.226 4.998 1.848C4.62 1.456 4.13 1.26 3.542 1.26Z" fill="white"/>
            <path d="M9.41653 3.01C9.69653 3.01 9.94853 3.108 10.1585 3.318C10.3545 3.514 10.4665 3.766 10.4665 4.06C10.4665 4.34 10.3545 4.592 10.1585 4.802C9.94853 4.998 9.69653 5.096 9.41653 5.096C9.10853 5.096 8.87053 4.998 8.68853 4.802C8.47853 4.592 8.38053 4.34 8.38053 4.06C8.38053 3.766 8.47853 3.514 8.68853 3.318C8.87053 3.108 9.10853 3.01 9.41653 3.01ZM9.41653 8.134C9.69653 8.134 9.94853 8.232 10.1585 8.442C10.3545 8.638 10.4665 8.89 10.4665 9.184C10.4665 9.464 10.3545 9.716 10.1585 9.926C9.94853 10.122 9.69653 10.22 9.41653 10.22C9.10853 10.22 8.87053 10.122 8.68853 9.926C8.47853 9.716 8.38053 9.464 8.38053 9.184C8.38053 8.89 8.47853 8.638 8.68853 8.442C8.87053 8.232 9.10853 8.134 9.41653 8.134Z" fill="white"/>
            <path d="M16.255 0.196H17.655V6.804H19.167V8.022H17.655V10.192H16.199V8.022H11.327V6.58L16.255 0.196ZM16.157 2.128L12.573 6.804H16.199V2.128H16.157Z" fill="white"/>
            <path d="M22.4095 0.196H23.5575V10.192H22.0315V2.03C21.4295 2.604 20.6595 3.024 19.7355 3.29V1.778C20.1835 1.666 20.6455 1.47 21.1495 1.19C21.6535 0.882 22.0735 0.56 22.4095 0.196Z" fill="white"/>
          </svg>
        </div>
        {/* 电量/信号 */}
        <div className="absolute left-[293.67px] top-[17.33px]">
          <svg width="67" height="12" viewBox="0 0 67 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M61 2.00205C61.7362 2.00223 62.333 2.59977 62.333 3.33604V8.00205C62.333 8.73832 61.7362 9.33586 61 9.33604H45.666C44.9298 9.33586 44.333 8.73832 44.333 8.00205V3.33604C44.333 2.59977 44.9298 2.00223 45.666 2.00205H61Z" fill="white"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M61.666 0.00205362C63.1386 0.00205362 64.3328 1.1965 64.333 2.66905V8.66905L64.3193 8.94151C64.1827 10.2861 63.0467 11.3351 61.666 11.3351H45L44.7266 11.3214C43.4718 11.1937 42.4742 10.1963 42.3467 8.94151L42.333 8.66905V2.66905C42.3332 1.28869 43.3822 0.152476 44.7266 0.0157255L45 0.00205362H61.666ZM45 1.00205C44.0797 1.00205 43.3333 1.74878 43.333 2.66905V8.66905C43.3332 9.58937 44.0796 10.3351 45 10.3351H61.666C62.5864 10.3351 63.3328 9.58937 63.333 8.66905V2.66905C63.3328 1.74878 62.5863 1.00205 61.666 1.00205H45Z" fill="white"/>
            <path d="M2 7.00303C2.55212 7.00323 3 7.45087 3 8.00303V10.003C2.99972 10.555 2.55194 11.0028 2 11.003H1C0.447888 11.003 0.000280118 10.5551 0 10.003V8.00303C0 7.45075 0.447715 7.00303 1 7.00303H2Z" fill="white"/>
            <path d="M6.66699 5.00303C7.21896 5.0034 7.66699 5.45098 7.66699 6.00303V10.003C7.66671 10.5548 7.21879 11.0027 6.66699 11.003H5.66699C5.11488 11.003 4.66727 10.5551 4.66699 10.003V6.00303C4.66699 5.45075 5.11471 5.00303 5.66699 5.00303H6.66699Z" fill="white"/>
            <path d="M11.333 2.66905C11.885 2.66924 12.3328 3.11703 12.333 3.66905V10.003C12.3327 10.555 11.885 11.0028 11.333 11.003H10.333C9.78105 11.0029 9.33329 10.555 9.33301 10.003V3.66905C9.33318 3.11702 9.78098 2.66922 10.333 2.66905H11.333Z" fill="white"/>
            <path d="M16 0.336038C16.5521 0.336236 17 0.783875 17 1.33604V10.003C16.9997 10.555 16.5519 11.0028 16 11.003H15C14.4479 11.003 14.0003 10.5551 14 10.003V1.33604C14 0.783753 14.4477 0.336038 15 0.336038H16Z" fill="white"/>
            <path d="M27.4531 8.40049C28.7286 7.32166 30.5975 7.32176 31.873 8.40049C31.9371 8.45851 31.9738 8.54066 31.9756 8.62705C31.9773 8.71349 31.9435 8.79696 31.8818 8.85752L29.8848 10.8731C29.8263 10.9322 29.7462 10.9659 29.6631 10.9659C29.58 10.9658 29.4999 10.9323 29.4414 10.8731L27.4434 8.85752C27.3819 8.79696 27.3479 8.71334 27.3496 8.62705C27.3514 8.54071 27.3891 8.45846 27.4531 8.40049Z" fill="white"/>
            <path d="M65.333 3.66905C66.1377 4.00781 66.6611 4.79597 66.6611 5.66905C66.6611 6.54216 66.1377 7.33026 65.333 7.66905V3.66905Z" fill="white"/>
            <path d="M24.7881 5.71104C27.5361 3.15505 31.7919 3.1552 34.54 5.71104C34.602 5.77089 34.6377 5.85343 34.6387 5.93955C34.6395 6.02571 34.6056 6.10886 34.5449 6.17002L33.3906 7.33701C33.2716 7.4559 33.079 7.4587 32.957 7.34287C32.0546 6.52579 30.8805 6.07329 29.6631 6.07334C28.4465 6.07394 27.2729 6.52629 26.3711 7.34287C26.249 7.45847 26.0564 7.45602 25.9375 7.33701L24.7832 6.17002C24.7226 6.10899 24.6887 6.02555 24.6895 5.93955C24.6904 5.85354 24.7263 5.77086 24.7881 5.71104Z" fill="white"/>
            <path d="M22.123 3.0294C26.3381 -1.00973 32.9881 -1.00987 37.2031 3.0294C37.264 3.08934 37.2983 3.17148 37.2988 3.25694C37.2993 3.34247 37.2653 3.42475 37.2051 3.48545L36.0488 4.65244C35.9297 4.7717 35.737 4.77309 35.6162 4.65537C34.0103 3.12874 31.8788 2.27757 29.6631 2.27744C27.4471 2.27753 25.315 3.12857 23.709 4.65537C23.5882 4.77314 23.3953 4.77207 23.2764 4.65244L22.1201 3.48545C22.06 3.42472 22.0258 3.34242 22.0264 3.25694C22.027 3.17153 22.0622 3.0893 22.123 3.0294Z" fill="white"/>
          </svg>
        </div>
      </div>

      {/* 导航栏 */}
      <div className="absolute top-[44px] left-0 w-[375px] h-[44px] flex-shrink-0">
        {/* 返回按钮 */}
        <div className="absolute left-0 top-0">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M25.7071 13.2929C26.0976 13.6834 26.0976 14.3166 25.7071 14.7071L18.4142 22L25.7071 29.2929C26.0976 29.6834 26.0976 30.3166 25.7071 30.7071C25.3166 31.0976 24.6834 31.0976 24.2929 30.7071L16.2929 22.7071C15.9024 22.3166 15.9024 21.6834 16.2929 21.2929L24.2929 13.2929C24.6834 12.9024 25.3166 12.9024 25.7071 13.2929Z" fill="white"/>
          </svg>
        </div>
        {/* 标题 */}
        <div className="absolute left-[51px] top-[9.5px] w-[272px] h-[25px] text-center text-white text-[18px] font-medium leading-[27px] truncate flex flex-col justify-center" />
      </div>

      {/* 白色卡片 */}
      <div className="absolute left-[20px] top-[164px] w-[335px] h-[623.34px] bg-white rounded-[16px] shadow-[0_14px_20px_rgba(0,0,0,0.05)]">
        {/* 排行列表容器 - 有 overflow hidden 和圆角 */}
        <div className="absolute left-[16px] top-[16px] w-[303px] overflow-hidden rounded-[16px] flex flex-col gap-[8px]">
          {/* 排名 1-3：带渐变背景 */}
          {rankList.slice(0, 3).map((item) => (
            <div
              key={item.rank}
              className="w-[303px] flex-shrink-0 rounded-[11px] flex items-center justify-between px-[10px] py-[10px]"
              style={{ background: item.bgGradient }}
            >
              <div className="flex items-center gap-[16px]">
                <img
                  src={item.rankBadge}
                  alt=""
                  className="w-[32px] h-[32px] object-cover flex-shrink-0"
                />
                <div className="flex items-center gap-[16px]">
                  <img
                    src={item.avatar}
                    alt=""
                    className="w-[40px] h-[40px] rounded-full flex-shrink-0 object-cover"
                  />
                  <span
                    className="text-[16px] font-medium leading-[24px] truncate"
                    style={{ color: item.nameColor }}
                  >
                    {item.name}
                  </span>
                </div>
              </div>
              <span
                className="text-[18px] font-medium leading-[27px] text-center flex-shrink-0"
                style={{ color: item.scoreColor }}
              >
                {item.score}
              </span>
            </div>
          ))}

          {/* 排名 4-8：无背景 */}
          {rankList.slice(3).map((item) => (
            <div
              key={item.rank}
              className="w-[303px] flex-shrink-0 rounded-[11px] flex items-center justify-between px-[10px] py-[10px]"
            >
              <div className="flex items-center gap-[16px]">
                <div className="w-[32px] h-[32px] flex items-center justify-center flex-shrink-0">
                  <span
                    className="text-[16px] font-normal leading-[24px] text-center"
                    style={{ color: item.nameColor }}
                  >
                    {item.rank}
                  </span>
                </div>
                <div className="flex items-center gap-[16px]">
                  <img
                    src={item.avatar}
                    alt=""
                    className="w-[40px] h-[40px] rounded-full flex-shrink-0 object-cover"
                  />
                  <span
                    className="text-[16px] font-medium leading-[24px] truncate"
                    style={{ color: item.nameColor }}
                  >
                    {item.name}
                  </span>
                </div>
              </div>
              <span
                className="text-[18px] font-medium leading-[27px] text-center flex-shrink-0"
                style={{ color: item.scoreColor }}
              >
                {item.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部区域（我的排行） */}
      <div className="absolute left-[-0.12px] top-[701px] w-[375px] bg-white flex flex-col items-center gap-[8px] pb-2 px-5">
        {/* 分割线 */}
        <div className="w-full h-[1px] bg-[#F5F4F4]" />
        {/* 我的排行项 */}
        <div className="w-[303px] flex-shrink-0 rounded-[11px] flex items-center justify-between px-[10px] py-[10px]">
          <div className="flex items-center gap-[16px]">
            <div className="w-[32px] h-[32px] flex items-center justify-center flex-shrink-0">
              <span className="text-[14px] font-normal leading-[21px] text-[#404040] text-center whitespace-nowrap">
                未上榜
              </span>
            </div>
            <div className="flex items-center gap-[16px]">
              <img
                src="/api/images/img_DuL6LlUuTIzyLw"
                alt=""
                className="w-[40px] h-[40px] rounded-full flex-shrink-0 object-cover"
              />
              <span className="text-[16px] font-medium leading-[24px] text-[#404040] truncate">
                孙*茹
              </span>
            </div>
          </div>
          <span className="text-[18px] font-medium leading-[27px] text-center text-[#404040] flex-shrink-0">
            99关
          </span>
        </div>
      </div>

      {/* Home Indicator */}
      <div className="absolute left-0 top-[778px] w-[375px] h-[34px] bg-white">
        <div className="mx-auto mt-5 w-[134px] h-[5px] bg-black rounded-[100px]" />
      </div>
    </div>
  );
}