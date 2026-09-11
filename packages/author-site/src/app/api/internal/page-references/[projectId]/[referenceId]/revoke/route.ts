import { NextRequest } from "next/server";
import { revokeRoute } from "@/lib/page-transfer/routes";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; referenceId: string }> }) { const value = await params; return revokeRoute(request, value.projectId, value.referenceId, true); }
