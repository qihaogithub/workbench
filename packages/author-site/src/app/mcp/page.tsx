import {
  createCodexInstallPrompt,
  createMcpClientConfigSnippet,
} from "@opencode-workbench/project-core";

import { McpInstallPage } from "@/components/mcp/mcp-install-page";

export const dynamic = "force-dynamic";

export default function Page() {
  const authorSiteUrl =
    process.env.AUTHOR_SITE_URL ||
    process.env.NEXT_PUBLIC_AUTHOR_SITE_URL ||
    "http://localhost:3200";
  const version = "0.1.0";

  return (
    <McpInstallPage
      installPrompt={createCodexInstallPrompt({
        authorSiteUrl,
        mode: "stdio",
        mcpVersion: version,
      })}
      localConfig={createMcpClientConfigSnippet({ mode: "stdio" })}
      remoteConfig={createMcpClientConfigSnippet({
        mode: "remote",
        remoteUrl: `${authorSiteUrl.replace(/\/$/, "")}/api/mcp`,
      })}
      updatedAt="2026-06-25"
      version={version}
    />
  );
}
