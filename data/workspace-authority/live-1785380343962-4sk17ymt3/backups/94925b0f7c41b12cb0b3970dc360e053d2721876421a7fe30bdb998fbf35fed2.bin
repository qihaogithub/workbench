interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}interface ModuleConfig {
  type: "image" | "video" | "progress";
  imageUrl?: string;
  videoBg?: string;
  videoCover?: string;
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}

interface DemoProps {
  modules?: ModuleConfig[];
}

const DEFAULT_MODULES: ModuleConfig[] = [
  {
    type: "image",
    imageUrl: "../../assets/images/ab9472005108-image-module-2.png",
  },
  {
    type: "progress",
    progressBgTop: "../../assets/images/e42da6dcf611-progress-bg-top.png",
    progressBgMiddle: "../../assets/images/805ed928744e-progress-bg-middle.png",
    progressBgBottom: "../../assets/images/b0b1a87384e6-progress-bg-bottom.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/345cff787d4e-image-module-1.png",
  },
  {
    type: "video",
    videoBg: "../../assets/images/4ea96ecddfd3-video-bg.png",
    videoCover: "../../assets/images/ef6aa004c215-video-cover.png",
  },
  {
    type: "image",
    imageUrl: "../../assets/images/766653d583e6-image-module-3.png",
  },
];

const LEVELS_IMAGE = "../../assets/images/83cf4a932984-levels.png";

function StatusBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center justify-between px-[44px] bg-white">
      <span className="text-sm font-medium text-black">9:41</span>
      <svg
        width="67"
        height="12"
        viewBox="0 0 67 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M61.6055 9.11511e-05C63.0782 9.11511e-05 64.2725 1.19432 64.2725 2.66708V8.66708L64.2588 8.93954C64.1222 10.2842 62.9861 11.3331 61.6055 11.3331H44.9395L44.666 11.3194C43.4112 11.1918 42.4136 10.1944 42.2861 8.93954L42.2725 8.66708V2.66708C42.2725 1.28652 43.3215 0.150529 44.666 0.013763L44.9395 9.11511e-05H61.6055ZM27.4268 8.40048C28.7023 7.32169 30.5711 7.3217 31.8467 8.40048C31.9107 8.45846 31.9474 8.54072 31.9492 8.62704C31.9509 8.71346 31.9171 8.79694 31.8555 8.85751L29.8584 10.8731C29.7999 10.9324 29.72 10.9659 29.6367 10.9659C29.5535 10.9659 29.4736 10.9323 29.415 10.8731L27.417 8.85751C27.3555 8.79693 27.3215 8.71339 27.3232 8.62704C27.3251 8.54066 27.3627 8.45842 27.4268 8.40048ZM2 6.66708C2.55228 6.66708 3 7.1148 3 7.66708V9.66708C2.99982 10.2192 2.55218 10.6671 2 10.6671H1C0.447824 10.6671 0.000175969 10.2192 0 9.66708V7.66708C0 7.1148 0.447715 6.66708 1 6.66708H2ZM6.66699 4.66708C7.21913 4.66726 7.66699 5.11491 7.66699 5.66708V9.66708C7.66682 10.2191 7.21902 10.6669 6.66699 10.6671H5.66699C5.11482 10.6671 4.66717 10.2192 4.66699 9.66708V5.66708C4.66699 5.1148 5.11471 4.66708 5.66699 4.66708H6.66699ZM11.333 2.3331C11.8852 2.3331 12.3328 2.78096 12.333 3.3331V9.66708C12.3328 10.2192 11.8852 10.6671 11.333 10.6671H10.333C9.78098 10.6669 9.33318 10.2191 9.33301 9.66708V3.3331C9.33318 2.78107 9.78098 2.33327 10.333 2.3331H11.333ZM16 9.11511e-05C16.5523 9.11511e-05 17 0.447806 17 1.00009V9.66708C16.9998 10.2192 16.5522 10.6671 16 10.6671H15C14.4478 10.6671 14.0002 10.2192 14 9.66708V1.00009C14 0.447806 14.4477 9.11511e-05 15 9.11511e-05H16ZM44.9395 1.00009C44.019 1.00009 43.2725 1.74661 43.2725 2.66708V8.66708C43.2726 9.58741 44.0191 10.3331 44.9395 10.3331H61.6055C62.5258 10.3331 63.2723 9.58741 63.2725 8.66708V2.66708C63.2725 1.74661 62.5259 1.00009 61.6055 1.00009H44.9395ZM60.9395 2.00009C61.6756 2.00027 62.2723 2.59698 62.2725 3.3331V8.00009C62.2725 8.73636 61.6757 9.33292 60.9395 9.3331H45.6055C44.8692 9.33292 44.2725 8.73636 44.2725 8.00009V3.3331C44.2726 2.59698 44.8693 2.00027 45.6055 2.00009H60.9395ZM65.2725 3.66708C66.0771 4.00589 66.6006 4.79399 66.6006 5.66708C66.6005 6.54009 66.0771 7.32835 65.2725 7.66708V3.66708ZM24.7617 5.71103C27.5098 3.15509 31.7656 3.15515 34.5137 5.71103C34.5756 5.77084 34.6113 5.85349 34.6123 5.93954C34.6132 6.02569 34.5792 6.10884 34.5186 6.17001L33.3643 7.33701C33.2453 7.45611 33.0527 7.45876 32.9307 7.34286C32.0282 6.52573 30.8541 6.07329 29.6367 6.07333C28.4201 6.07384 27.2466 6.52624 26.3447 7.34286C26.2227 7.45868 26.0301 7.45608 25.9111 7.33701L24.7568 6.17001C24.6962 6.10895 24.6623 6.0256 24.6631 5.93954C24.6641 5.85348 24.6998 5.77083 24.7617 5.71103ZM22.0967 3.02939C26.3118 -1.00967 32.9618 -1.00992 37.1768 3.02939C37.2376 3.08929 37.2718 3.17154 37.2725 3.25693C37.273 3.34245 37.2389 3.42473 37.1787 3.48544L36.0225 4.65243C35.9033 4.77191 35.7107 4.77316 35.5898 4.65536C33.9839 3.12869 31.8525 2.27756 29.6367 2.27743C27.4207 2.27743 25.2888 3.12853 23.6826 4.65536C23.5618 4.77335 23.369 4.77213 23.25 4.65243L22.0938 3.48544C22.0335 3.42469 21.9994 3.34246 22 3.25693C22.0007 3.17148 22.0357 3.08927 22.0967 3.02939Z"
          fill="black"
        />
      </svg>
    </div>
  );
}

function NavBar() {
  return (
    <div className="w-[375px] h-[44px] flex items-center bg-white">
      <button className="w-[44px] h-[44px] flex items-center justify-center">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M26.318 13.4393C25.7773 12.8986 24.9264 12.857 24.338 13.3146L24.1967 13.4393L18.818 18.818C17.1309 20.5051 17.0634 23.1984 18.6155 24.966L18.818 25.182L24.1967 30.5607C24.7825 31.1464 25.7322 31.1464 26.318 30.5607C26.8587 30.0199 26.9003 29.1691 26.4428 28.5807L26.318 28.4393L20.9393 23.0607C20.3986 22.5199 20.357 21.6691 20.8145 21.0807L20.9393 20.9393L26.318 15.5607C26.9038 14.9749 26.9038 14.0251 26.318 13.4393Z"
            fill="#404040"
          />
        </svg>
      </button>
      <div className="flex-1 text-center text-lg font-medium text-black truncate">
        活动详情
      </div>
      <div className="w-[44px]" />
    </div>
  );
}

function ImageModule({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="w-[375px]">
      {imageUrl ? (
        <img src={imageUrl} className="w-full object-cover" alt="" />
      ) : (
        <div className="w-full h-[100px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          图片模块
        </div>
      )}
    </div>
  );
}

function ProgressModule({
  progressBgTop,
  progressBgMiddle,
  progressBgBottom,
}: {
  progressBgTop?: string;
  progressBgMiddle?: string;
  progressBgBottom?: string;
}) {
  const topImg = progressBgTop || "";
  const midImg = progressBgMiddle || "";
  const bottomImg = progressBgBottom || "";

  return (
    <div className="relative w-[375px]">
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {topImg && (
          <img src={topImg} className="w-full h-[50px] object-cover" alt="" />
        )}
        {midImg && (
          <div
            className="flex-1"
            style={{
              backgroundImage: `url(${midImg})`,
              backgroundRepeat: "repeat-y",
              backgroundSize: "375px 10px",
            }}
          />
        )}
        {bottomImg && (
          <img
            src={bottomImg}
            className="w-full h-[70px] object-cover"
            alt=""
          />
        )}
      </div>
      <div className="relative z-10 flex flex-col items-center pt-[30px] pb-[33px] gap-5">
        <img
          src={LEVELS_IMAGE}
          className="w-[335px] h-[383px] object-cover"
          alt="关卡"
        />
        <button className="w-[180px] h-[44px] bg-[#FCDA00] rounded-[30px] text-[#544300] text-lg font-medium flex items-center justify-center outline outline-3 outline-white -outline-offset-3">
          去学习
        </button>
      </div>
    </div>
  );
}

function VideoModule({
  videoBg,
  videoCover,
}: {
  videoBg?: string;
  videoCover?: string;
}) {
  const bgImg = videoBg || "";
  const coverImg = videoCover || "";

  return (
    <div className="relative w-[375px]">
      {bgImg && (
        <img src={bgImg} className="w-full h-auto object-cover" alt="" />
      )}
      <div className="absolute inset-0 flex items-center justify-center px-[20px]">
        <div className="relative w-full max-w-[335px]">
          {coverImg && (
            <img
              src={coverImg}
              className="w-full h-auto rounded-[20px] object-cover"
              alt=""
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="70"
              height="70"
              viewBox="0 0 70 70"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="35"
                cy="35"
                r="31.8182"
                fill="black"
                fillOpacity="0.4"
              />
              <path d="M51 35L27 19L27 51Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderModule(module: ModuleConfig, index: number) {
  switch (module.type) {
    case "image":
      return <ImageModule key={index} imageUrl={module.imageUrl} />;
    case "progress":
      return (
        <ProgressModule
          key={index}
          progressBgTop={module.progressBgTop}
          progressBgMiddle={module.progressBgMiddle}
          progressBgBottom={module.progressBgBottom}
        />
      );
    case "video":
      return (
        <VideoModule
          key={index}
          videoBg={module.videoBg}
          videoCover={module.videoCover}
        />
      );
    default:
      return (
        <div
          key={index}
          className="w-[375px] h-[60px] bg-gray-50 flex items-center justify-center text-gray-400 text-sm"
        >
          未知模块
        </div>
      );
  }
}

export default function Demo({ modules }: DemoProps) {
  const rawModules = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  let videoAdded = false;
  let progressAdded = false;
  const displayModules = rawModules.filter((mod) => {
    if (mod.type === "video") {
      if (videoAdded) return false;
      videoAdded = true;
      return true;
    }
    if (mod.type === "progress") {
      if (progressAdded) return false;
      progressAdded = true;
      return true;
    }
    return true;
  });

  return (
    <div className="w-[375px] bg-white">
      <div className="sticky top-0 z-50">
        <StatusBar />
        <NavBar />
      </div>
      {displayModules.map((mod, index) => renderModule(mod, index))}
    </div>
  );
}