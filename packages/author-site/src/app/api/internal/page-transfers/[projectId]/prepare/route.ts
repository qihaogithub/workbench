import { NextRequest } from "next/server";
import { prepareRoute } from "@/lib/page-transfer/routes";
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return prepareRoute(request, (await params).projectId, true);
}
