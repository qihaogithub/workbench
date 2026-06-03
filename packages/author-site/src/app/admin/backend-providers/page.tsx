import { redirect } from "next/navigation";

export default function BackendProvidersRedirect() {
  redirect("/admin/models?tab=providers");
}
