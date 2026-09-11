import { NextRequest } from "next/server";
import { executeRoute } from "@/lib/page-transfer/routes";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) { return executeRoute(request, (await params).projectId, true); }
