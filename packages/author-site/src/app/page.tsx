import { HomePage } from "@/components/demo/home-page";
import { getProjectAdminService } from "@/lib/project-admin-service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = getProjectAdminService().listProjects();
  const initialDemos = result.ok ? (result.data ?? []) : [];
  return <HomePage initialDemos={initialDemos} />;
}
