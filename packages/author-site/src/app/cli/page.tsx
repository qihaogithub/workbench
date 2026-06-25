import {
  createProjectCliQuickReference,
  createProjectCliUsagePrompt,
} from "@opencode-workbench/project-core";

import { ProjectCliPage } from "@/components/cli/project-cli-page";

export const dynamic = "force-dynamic";

export default function Page() {
  const authorSiteUrl =
    process.env.AUTHOR_SITE_URL ||
    process.env.NEXT_PUBLIC_AUTHOR_SITE_URL ||
    "http://localhost:3200";
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
