import { useState } from "react";
import { Soccer, Lock, CheckCircle } from "lucide-react";

interface DemoProps {}

function AgeConfirmation({ onConfirm, onDeny }: { onConfirm: () => void; onDeny: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-up">
        {/* 弹窗顶部 */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 pt-8 pb-6 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <Soccer className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-white text-xl font-bold">年龄确认</h2>
        </div>

        {/* 正文 */}
        <div className="px-6 pt-5 pb-6">
          <p className="text-sm text-gray-600 leading-relaxed">
            尊敬的用户，本活动包含抽奖环节。根据相关法律法规，参与抽奖活动需年满 18 周岁。请确认您是否已满 18 周岁。
          </p>

          {/* 按钮 */}
          <div className="mt-6 space-y-3">
            <button
              onClick={onConfirm}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-200"
            >
              <CheckCircle className="w-5 h-5" />
              我已满 18 岁
            </button>
            <button
              onClick={onDeny}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-500 font-medium py-3.5 rounded-xl transition-all"
            >
              我未满 18 岁
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fade-up 0.35s ease-out;
        }
      `}</style>
    </div>
  );
}

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl px-8 py-12 text-center animate-fade-up">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Lock className="w-10 h-10 text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-3">
          暂无法进入活动
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-8">
          根据相关规定，未满 18 周岁暂无法参与本次活动。感谢您的理解！
        </p>
        <button
          onClick={onBack}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-green-200"
        >
          返回首页
        </button>
      </div>

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fade-up 0.35s ease-out;
        }
      `}</style>
    </div>
  );
}

export default function Demo(_props: DemoProps) {
  const [page, setPage] = useState<"confirm" | "loading" | "denied">("confirm");

  if (page === "loading") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
        <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl px-8 py-12 text-center animate-fade-up">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-lg font-semibold text-gray-800">
            即将进入活动…
          </p>
        </div>
        <style>{`
          @keyframes fade-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-up {
            animation: fade-up 0.35s ease-out;
          }
        `}</style>
      </div>
    );
  }

  if (page === "denied") {
    return <AccessDenied onBack={() => setPage("confirm")} />;
  }

  return (
    <AgeConfirmation
      onConfirm={() => setPage("loading")}
      onDeny={() => setPage("denied")}
    />
  );
}