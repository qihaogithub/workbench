import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "OneFlow｜面向营销活动业务的 AI 协作平台",
  description:
    "OneFlow 将活动目标、产品能力、设计规范和项目经验组织到同一个工作台，连接 AI 原型、配置与资源预览、团队协作和经验复用，让每个活动不再从零开始。",
};

export default function Page() {
  return <LandingPage />;
}
