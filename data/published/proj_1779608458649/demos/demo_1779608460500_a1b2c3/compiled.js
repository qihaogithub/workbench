import {jsxs as _jsxs, jsx as _jsx} from 'https://esm.sh/react@18.3.1/jsx-runtime';import { ChevronRight } from 'https://esm.sh/lucide-react?deps=react@18.3.1,react-dom@18.3.1';






export default function PhoneAfterSchool({ serviceTitle = '全年系统包-L1', ...restProps }) {
  const { bannerImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/banner.png' } = restProps ;

  const features = [
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
    {
      name: '趣味复习',
      status: '',
      icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/icon-2.png',
    },
  ];

  return (
    _jsxs('div', {
      className: "w-full min-h-screen bg-white flex flex-col overflow-hidden"     ,
      style: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 375,
        margin: '0 auto',
      },
 children: [
      /* 状态栏 & 导航栏 */
      _jsx('div', { className: "w-full flex-shrink-0" , children: 
        _jsx('img', {
          src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/手机/原生/导航&状态.png",
          alt: "nav-status",
          className: "w-full h-auto" ,}
        )
      })

      /* 主要内容区域 */
      , _jsxs('div', { className: "flex-1 px-5 flex flex-col gap-6 mt-5 overflow-y-auto"      , children: [
        /* Banner 广告图 */
        _jsx('div', { className: "w-full h-[112px] rounded-[10px] overflow-hidden flex-shrink-0"    , children: 
          _jsx('img', {
            src: bannerImage,
            alt: "banner",
            className: "w-full h-full object-cover"  ,}
          )
        })

        /* 服务内容 */
        , _jsxs('div', { className: "flex flex-col gap-[14px]"  , children: [
          /* 标题区 */
          _jsxs('div', { className: "flex items-center justify-between w-full"   , children: [
            _jsx('span', {
              className: "text-[20px] font-medium text-[#4d4d4d]"  ,
              style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
              serviceTitle
            })
            , _jsxs('div', { className: "flex items-center gap-1"  , children: [
              _jsx('span', {
                className: "text-[14px] text-[#666666]" ,
                style: { fontFamily: '"PingFang SC", sans-serif' },
 children: "苹果指导师"

              })
              , _jsx('img', {
                src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/学习页/课后/指导师头像.png",
                alt: "teacher",
                className: "w-6 h-6 rounded-[9px]"  ,
                style: { backgroundColor: '#fcda00' },}
              )
            ]})
          ]})

          /* 功能入口列表 */
          , _jsx('div', { className: "flex flex-col gap-[7px]"  , children: 
            features.map((feature, index) => (
              _jsxs('div', {

                className: "w-full h-16 bg-[#fff3eb] rounded-[18px] flex items-center justify-between px-5"       ,
 children: [
                _jsxs('div', { className: "flex items-center gap-2 flex-1 min-w-0"    , children: [
                  _jsx('img', {
                    src: feature.icon,
                    alt: "",
                    className: "w-9 h-9 rounded-[10.5px] flex-shrink-0"   ,}
                  )
                  , _jsx('span', {
                    className: "text-[16px] font-medium text-[#6b2d03] truncate"   ,
                    style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
                    feature.name
                  })
                ]})
                , _jsxs('div', { className: "flex items-center gap-1 flex-shrink-0 ml-2"    , children: [
                  feature.status && (
                    _jsx('span', {
                      className: "text-[14px] text-[#e35b00] whitespace-nowrap"  ,
                      style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
                      feature.status
                    })
                  )
                  , _jsx(ChevronRight, { className: "w-4 h-4 text-[#ffa66b]"  ,} )
                ]})
              ]}, index)
            ))
          })

          /* 底部链接 */
          , _jsxs('div', { className: "flex items-center justify-center gap-1 mt-2.5"    , children: [
            _jsx('span', {
              className: "text-[14px] text-[#b2b2b2]" ,
              style: { fontFamily: '"PingFang SC", sans-serif' },
 children: "查看往期课程服务"

            })
            , _jsx(ChevronRight, { className: "w-4 h-4 text-[#e0dfdf]"  ,} )
          ]})
        ]})
      ]})

      /* 底部指示条 */
      , _jsx('div', { className: "w-full h-[34px] flex items-center justify-center flex-shrink-0"     , children: 
        _jsx('div', { className: "w-[134px] h-[5px] bg-black rounded-full"   ,} )
      })
    ]})
  );
}