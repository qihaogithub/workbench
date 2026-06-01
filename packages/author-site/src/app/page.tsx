import { HomePage } from "@/components/demo/home-page";
import { listProjects } from "@/lib/fs-utils";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialDemos = listProjects();
  return <HomePage initialDemos={initialDemos} />;
}
