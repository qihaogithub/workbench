import { NextRequest } from "next/server";
import { statusRoute } from "@/lib/page-transfer/routes";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; transferId: string }> },
) {
  const value = await params;
  return statusRoute(request, value.projectId, value.transferId, true);
}
