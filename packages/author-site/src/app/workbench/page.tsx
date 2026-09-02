import { redirect } from "next/navigation";

import { HomePage } from "@/components/demo/home-page";
import { getCurrentProjectActor } from "@/lib/auth/current-user";
import { getProjectAdminService } from "@/lib/project-admin-service";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const actor = await getCurrentProjectActor();
  if (!actor) {
    redirect("/login?redirect=%2Fworkbench");
  }

  const result = getProjectAdminService().listProjects(actor);
  const initialDemos = result.ok ? (result.data ?? []) : [];
  return <HomePage initialDemos={initialDemos} />;
}
