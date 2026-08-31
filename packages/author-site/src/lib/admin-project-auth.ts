import { verifyAdminRequest } from "@/lib/admin-auth";
import { getCurrentUserFromRequest, toProjectAdminActor } from "@/lib/auth/current-user";
import type { ProjectAdminActor } from "@workbench/project-core";

/** Admin APIs retain the ADMIN_SECRET gate, while using the signed-in user for audit attribution when available. */
export async function getAdminProjectActor(request: Request): Promise<ProjectAdminActor | null> {
  if (!(await verifyAdminRequest(request))) return null;
  const user = await getCurrentUserFromRequest(request);
  return user ? toProjectAdminActor(user) : {
    id: "admin-secret",
    name: "Admin Secret",
    role: "admin",
    source: "admin-secret",
  };
}
