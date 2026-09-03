import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:4200/preview-runtime/vendor/react-jsx-runtime.js";import { SpinePlayer } from "http://localhost:4200/preview-runtime/vendor/preview-sdk.js";








const FALLBACK_IMAGE = "/api/images/img_5dVk-_aTCmGiCQ";

export default function Demo({ spineAsset, spineAnimation = "", spineLoop = true }) {
  const hasSpine = Boolean(spineAsset);

  return (
    _jsxs('div', {
      className: "relative overflow-hidden" ,
      style: { width: 375, height: 812, background: "white" },
 children: [
      /* 背景 */
      _jsx('img', {
        src: "/api/images/img_VVbU7MykDJjjxA",
        alt: "背景",
        className: "absolute",
        style: { width: 375, height: 812, left: 0.5, top: 0.5 },}
      )
      /* 遮罩 */
      , _jsx('div', {
        className: "absolute",
        style: {
          width: 376,
          height: 812,
          left: 0,
          top: 0,
          opacity: 0.7,
          background: "black",
        },}
      )
      /* 弹窗：Spine 骨骼动画（配置项注入） */
      , hasSpine ? (
        _jsx(SpinePlayer, {
          src: spineAsset,
          animation: spineAnimation,
          loop: spineLoop,
          className: "absolute",
          style: { width: 375, height: 375, left: 0, top: 218 },
          fallback: 
            _jsx('img', {
              src: FALLBACK_IMAGE,
              alt: "弹窗",
              style: { width: 375, height: 375 },}
            )
          ,}
        )
      ) : (
        _jsx('img', {
          src: FALLBACK_IMAGE,
          alt: "弹窗",
          className: "absolute",
          style: { width: 375, height: 375, left: 0, top: 218 },}
        )
      )
    ]})
  );
}
