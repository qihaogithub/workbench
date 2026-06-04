interface DemoProps {
  displayImage?: string;
  backgroundColor?: string;
}

export default function FullScreenImage(props: DemoProps) {
  const {
    displayImage = './images/第二关已解锁.webp',
    backgroundColor = '#000000',
  } = props;

  return (
    <div
      className="w-[375px] h-[812px] relative overflow-hidden"
      style={{ backgroundColor }}
    >
      <img
        src={displayImage}
        alt="全屏展示"
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}