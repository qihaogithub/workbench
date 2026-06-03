interface DemoProps {
  displayImage: string;
  backgroundColor?: string;
}

export default function ImageDisplayPage(props: DemoProps) {
  const {
    displayImage = './images/display-bg.png',
    backgroundColor = '#ffffff',
  } = props;

  return (
    <div
      className="w-[375px] h-[812px] relative overflow-hidden"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor,
      }}
    >
      <img
        src={displayImage}
        alt="展示图片"
        className="w-full h-full object-cover"
      />
    </div>
  );
}