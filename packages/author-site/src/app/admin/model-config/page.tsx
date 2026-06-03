import { redirect } from "next/navigation";

export default function ModelConfigRedirect() {
  redirect("/admin/models?tab=config");
}
