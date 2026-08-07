import ViewerApp from "@/components/ViewerApp";

export function generateStaticParams() {
  return [{ slug: [] }, { slug: ["feedback"] }];
}

export default function Page() {
  return <ViewerApp />;
}
