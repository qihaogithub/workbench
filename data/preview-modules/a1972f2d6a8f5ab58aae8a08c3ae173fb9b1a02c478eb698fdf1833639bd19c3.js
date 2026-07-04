import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";import { ChevronRight } from "http://localhost:3200/preview-runtime/vendor/lucide-react.js";






export default function PadAfterSchool({
  bannerImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/banner.png',
}) {
  const featureRows = [
    [
      {
        name: '学习报告',
        status: '3篇报告未读',
        icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon.png',
      },
      {
        name: '活动挑战',
        status: '',
        icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-1.png',
      },
    ],
    [
      {
        name: '随堂故事',
        status: '',
        icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-2.png',
      },
    ],
  ];

  return (
    _jsxs('div', {
      className: "w-full min-h-screen bg-white flex flex-col overflow-hidden"     ,
      style: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        height: '100vh',
        maxWidth: 1133,
        margin: '0 auto',
      },
 children: [
      /* 状态栏 & 导航栏 */
      _jsx('div', { className: "w-full flex-shrink-0" , children: 
        _jsx('img', {
          src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/pad/pad状态栏和导航栏.png",
          alt: "nav-status",
          className: "w-full h-auto" ,}
        )
      })

      /* 主要内容区域 */
      , _jsxs('div', { className: "flex-1 px-[137px] flex flex-col gap-10 mt-5 overflow-y-auto"      , children: [
        /* Banner 广告图 */
        _jsx('div', { className: "w-full h-[112px] rounded-[10px] overflow-hidden flex-shrink-0"    , children: 
          _jsx('img', {
            src: bannerImage,
            alt: "banner",
            className: "w-full h-full object-cover"  ,}
          )
        })

        /* 服务内容 */
        , _jsxs('div', { className: "flex flex-col gap-6"  , children: [
          /* 标题区 */
          _jsxs('div', { className: "flex items-center justify-between w-full"   , children: [
            _jsx('span', {
              className: "text-[22.5px] font-medium text-[#4d4d4d]"  ,
              style: { fontFamily: '"PingFang SC", sans-serif' },
 children: "全年系统包-L1"

            })
            , _jsxs('div', { className: "flex items-center gap-[5px]"  , children: [
              _jsx('span', {
                className: "text-[17.5px] text-[#666666]" ,
                style: { fontFamily: '"PingFang SC", sans-serif' },
 children: "苹果指导师"

              })
              , _jsx('img', {
                src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/指导师头像.png",
                alt: "teacher",
                className: "w-[30px] h-[30px] rounded-[11.25px]"  ,
                style: { backgroundColor: '#fcda00' },}
              )
            ]})
          ]})

          /* 功能入口列表 - 两行布局 */
          , _jsx('div', { className: "flex flex-col gap-5"  , children: 
            featureRows.map((row, rowIndex) => (
              _jsx('div', { className: "flex gap-5 w-full"  , children: 
                row.map((feature, colIndex) => (
                  _jsxs('div', {

                    className: "h-20 bg-[#fff3eb] rounded-[22.5px] flex items-center justify-between px-[25px]"      ,
                    style: { flex: row.length === 1 ? '0 0 100%' : '0 0 calc(50% - 10px)' },
 children: [
                    _jsxs('div', { className: "flex items-center gap-[10px] flex-1 min-w-0"    , children: [
                      _jsx('img', {
                        src: feature.icon,
                        alt: "",
                        className: "w-[45px] h-[45px] rounded-[13.125px] flex-shrink-0"   ,}
                      )
                      , _jsx('span', {
                        className: "text-[20px] font-medium text-[#6b2d03] truncate"   ,
                        style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
                        feature.name
                      })
                    ]})
                    , _jsxs('div', { className: "flex items-center gap-[5px] flex-shrink-0 ml-2"    , children: [
                      feature.status && (
                        _jsx('span', {
                          className: "text-[17.5px] text-[#e35b00] whitespace-nowrap"  ,
                          style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
                          feature.status
                        })
                      )
                      , _jsx(ChevronRight, { className: "w-5 h-5 text-[#ffa66b]"  ,} )
                    ]})
                  ]}, colIndex)
                ))
              }, rowIndex)
            ))
          })

          /* 底部链接 */
          , _jsxs('div', { className: "flex items-center justify-center gap-1 mt-5"    , children: [
            _jsx('span', {
              className: "text-[17.5px] text-[#b2b2b2]" ,
              style: { fontFamily: '"PingFang SC", sans-serif' },
 children: "查看往期课程"

            })
            , _jsx(ChevronRight, { className: "w-5 h-5 text-[#e0dfdf]"  ,} )
          ]})
        ]})
      ]})
    ]})
  );
}
