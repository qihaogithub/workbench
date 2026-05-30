import ViewerApp from "@/components/ViewerApp";

export function generateStaticParams() {
  return [{ slug: [] }];
}

export default function Page() {
  return <ViewerApp />;
}
