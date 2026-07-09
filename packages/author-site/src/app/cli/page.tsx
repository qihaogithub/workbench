import {
  createProjectCliQuickReference,
  createProjectCliUsagePrompt,
} from "@workbench/project-core";
import { headers } from "next/headers";

import { ProjectCliPage } from "@/components/cli/project-cli-page";
import { getProjectCliAuthorSiteUrl } from "@/lib/project-cli-url";

export const dynamic = "force-dynamic";

export default function Page() {
  const authorSiteUrl = getProjectCliAuthorSiteUrl(headers());
  const version = "0.1.0";

  return (
    <ProjectCliPage
      usagePrompt={createProjectCliUsagePrompt({
        authorSiteUrl,
        cliVersion: version,
      })}
      quickReference={createProjectCliQuickReference()}
      updatedAt="2026-06-25"
      version={version}
    />
  );
}
