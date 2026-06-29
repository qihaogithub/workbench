import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3210/preview-runtime/vendor/react-jsx-runtime.js";





export default function PhoneBottomPopup({
  popupImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/底部广告弹窗/配图.png',
  mainButtonText = '去看看',
  secondaryButtonText = '下次再说',
}) {
  return (
    _jsxs('div', {
      className: "relative w-full overflow-hidden bg-white"   ,
      style: {
        height: '100vh',
        maxWidth: 375,
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
 children: [
      _jsx('div', {
        className: "absolute inset-0 bg-cover bg-center"   ,
        style: {
          backgroundImage: 'url(https://uiweb.oss-cn-chengdu.aliyuncs.com/img/通用广告弹窗/广场页phone.png)',
        },}
      )
      , _jsx('div', { className: "absolute inset-0 bg-black/70 flex items-end justify-center"     , children: 
        _jsxs('div', { className: "w-full flex flex-col"  , children: [
          _jsx('img', { src: popupImage, alt: "", className: "w-full block object-cover"  ,} )
          , _jsx('div', { className: "flex flex-col items-center gap-5 px-4 pb-5 pt-2 bg-white"       , children: 
            _jsxs('div', { className: "flex flex-col items-center gap-4 w-full"    , children: [
              _jsx('div', {
                className: "flex justify-center items-center w-[280px] h-11 rounded-[30px] cursor-pointer"      ,
                style: { backgroundColor: '#fcda00' },
 children: 
                _jsx('span', {
                  className: "text-[#544300] text-center text-lg font-medium leading-[150%]"    ,
                  style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
                  mainButtonText
                })
              })
              , _jsx('span', {
                className: "text-[#666] text-center text-lg font-normal leading-[150%] cursor-pointer"     ,
                style: { fontFamily: '"PingFang SC", sans-serif' },
 children: 
                secondaryButtonText
              })
            ]})
          })
        ]})
      })
    ]})
  );
}
