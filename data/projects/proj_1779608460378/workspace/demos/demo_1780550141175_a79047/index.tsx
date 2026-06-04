interface DemoProps {}

export default function FullScreenImage(_props: DemoProps) {
  return (
    <div
      className="w-[375px] h-[812px] relative overflow-hidden"
      style={{ backgroundColor: '#000000' }}
    >
      <img
        src="/api/images/8a7a1155c9a7-image.png"
        alt="全屏展示"
        className="w-full h-full object-cover"
        draggable={false}
      />

      {/* 大标题 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <h1 className="text-white text-3xl font-bold tracking-wider text-center px-8 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
          精彩内容推荐
        </h1>
      </div>
    </div>
  );
}