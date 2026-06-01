/**
 * 管理后台首页 - 概览
 */

import Link from "next/link";
import { ArrowRight, ListFilter, Users, Server } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">系统概览</h2>
        <p className="text-gray-600 mt-1">管理模型配置、供应商设置和系统参数</p>
      </div>

      {/* 快捷操作卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/model-config"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                模型配置
              </h3>
              <p className="text-sm text-gray-600">
                管理白名单、黑名单、默认模型和多模态设置
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-primary">
            <ListFilter className="h-4 w-4" />
            <span>进入配置</span>
          </div>
        </Link>

        <Link
          href="/admin/backend-providers"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                AI 后端供应商
              </h3>
              <p className="text-sm text-gray-600">
                配置 LLM 后端供应商、API Key 和可用模型,支持在线热更新
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-primary">
            <Server className="h-4 w-4" />
            <span>进入配置</span>
          </div>
        </Link>

        <Link
          href="/admin/users"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                用户管理
              </h3>
              <p className="text-sm text-gray-600">
                查看用户列表、重置用户密码
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-primary">
            <Users className="h-4 w-4" />
            <span>进入管理</span>
          </div>
        </Link>
      </div>

      {/* 快捷操作卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/model-config"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                模型配置
              </h3>
              <p className="text-sm text-gray-600">
                管理白名单、黑名单、默认模型和多模态设置
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-primary">
            <ListFilter className="h-4 w-4" />
            <span>进入配置</span>
          </div>
        </Link>

        <Link
          href="/admin/users"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                用户管理
              </h3>
              <p className="text-sm text-gray-600">
                查看用户列表、重置用户密码
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-primary">
            <Users className="h-4 w-4" />
            <span>进入管理</span>
          </div>
        </Link>
      </div>

      {/* 使用说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">使用说明</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="shrink-0">•</span>
            <span>
              <strong>模型白名单</strong>：控制哪些模型分组可以在前端显示
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0">•</span>
            <span>
              <strong>模型黑名单</strong>：禁用特定模型,即使通过了白名单过滤
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0">•</span>
            <span>
              <strong>默认模型</strong>：设置用户首次访问时自动选中的模型
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0">•</span>
            <span>
              <strong>多模态支持</strong>：标记支持图片输入的模型
            </span>
          </li>
        </ul>
        <div className="mt-4 pt-4 border-t border-blue-200 text-sm text-blue-700">
          <strong>提示：</strong>配置修改后立即生效,无需重启服务
        </div>
      </div>
    </div>
  );
}
