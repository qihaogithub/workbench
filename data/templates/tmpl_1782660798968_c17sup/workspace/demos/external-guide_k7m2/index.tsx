import { trigger } from "@preview/sdk";

interface DemoProps {}

const text = {
  official: "\u5b98\u65b9\u6d3b\u52a8",
  title: "\u4e16\u754c\u676f\u52a9\u5a01\u76db\u5178",
  subtitle:
    "\u53c2\u4e0e\u6d3b\u52a8\u8d62\u53d6\u4e30\u539a\u597d\u793c\uff0c\u4e3a\u4e16\u754c\u676f\u559d\u5f69\uff01",
  prizeTitle: "\u5956\u54c1\u9884\u89c8",
  openApp: "\u5728 App \u4e2d\u6253\u5f00",
  scanQr: "\u626b\u63cf\u4e8c\u7ef4\u7801\u6253\u5f00",
  wechatTip:
    "\u70b9\u51fb\u53f3\u4e0a\u89d2 ... \u540e\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00",
  downloadApp: "\u4e0b\u8f7d App",
  noApp: "\u8fd8\u6ca1\u6709\u4e0b\u8f7d\u53eb\u53eb App\uff1f",
  ios: "iOS \u4e0b\u8f7d",
  android: "Android \u4e0b\u8f7d",
  copyright: "\u00a9 2024 \u53eb\u53eb \u4fdd\u7559\u6240\u6709\u6743\u5229",
};

const prizes = [
  {
    name: "\u51a0\u519b\u7b7e\u540d\u7403\u8863",
    color: "bg-green-100",
    icon: TrophyIcon,
  },
  {
    name: "\u9650\u91cf\u7248\u8db3\u7403",
    color: "bg-emerald-100",
    icon: BallIcon,
  },
  {
    name: "VIP\u89c2\u8d5b\u5238",
    color: "bg-lime-100",
    icon: TicketIcon,
  },
];

export default function Demo(_props: DemoProps) {
  const isWechat = false;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="bg-gradient-to-b from-green-600 to-green-500 px-6 pb-12 pt-8 text-white">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-green-600">
            <TrophyIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-green-100">{text.official}</p>
            <h1 className="text-lg font-bold">{text.title}</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-green-100">{text.subtitle}</p>
      </header>

      <main className="-mt-6 px-6 pb-8">
        <section className="rounded-2xl bg-white p-5 shadow-lg">
          <h2 className="mb-4 text-base font-semibold text-gray-800">
            {text.prizeTitle}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {prizes.map((prize) => {
              const PrizeIcon = prize.icon;
              return (
                <div
                  key={prize.name}
                  className={`${prize.color} rounded-xl p-3 text-center`}
                >
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-green-700">
                    <PrizeIcon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-medium leading-tight text-gray-700">
                    {prize.name}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          {!isWechat ? (
            <>
              <button
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 font-semibold text-white shadow-lg shadow-green-200 transition-all hover:bg-green-700"
                onClick={() => trigger("openApp", { source: "external-guide" })}
              >
                <PhoneIcon className="h-5 w-5" />
                {text.openApp}
              </button>

              <div className="mt-6 text-center">
                <p className="mb-3 flex items-center justify-center gap-1 text-sm text-gray-400">
                  <QrIcon className="h-4 w-4" />
                  {text.scanQr}
                </p>
                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-xl bg-gray-200 text-gray-400">
                  <QrIcon className="h-10 w-10" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-3">
                  <BrowserIcon className="h-6 w-6 text-yellow-600" />
                  <p className="text-sm font-medium text-yellow-800">
                    {text.wechatTip}
                  </p>
                </div>
              </div>

              <button
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 font-semibold text-white shadow-lg shadow-green-200 transition-all hover:bg-green-700"
                onClick={() => trigger("openApp", { source: "wechat-guide" })}
              >
                <DownloadIcon className="h-5 w-5" />
                {text.downloadApp}
              </button>
            </>
          )}
        </section>

        <section className="mt-8">
          <p className="mb-3 text-center text-xs text-gray-400">{text.noApp}</p>
          <div className="flex gap-3">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-medium text-white transition-all hover:bg-gray-800">
              <PhoneIcon className="h-4 w-4" />
              {text.ios}
            </button>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-medium text-white transition-all hover:bg-green-600">
              <PhoneIcon className="h-4 w-4" />
              {text.android}
            </button>
          </div>
        </section>
      </main>

      <footer className="px-6 pb-6 text-center">
        <p className="text-xs text-gray-300">{text.copyright}</p>
      </footer>
    </div>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 6 9 6 9Z" />
      <path d="M18 4.5A2.5 2.5 0 0 1 20.5 7c-1 1.5-2.5 2-2.5 2" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2v6.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V2" />
    </svg>
  );
}

function BallIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m9.5 8.5 2.5-1.8 2.5 1.8-.9 3H10.4l-.9-3Z" />
      <path d="m7 16 3.4-4.5" />
      <path d="m17 16-3.4-4.5" />
      <path d="M12 20v-5" />
    </svg>
  );
}

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function QrIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="6" height="6" x="3" y="3" rx="1" />
      <rect width="6" height="6" x="15" y="3" rx="1" />
      <rect width="6" height="6" x="3" y="15" rx="1" />
      <path d="M15 15h2v2h-2z" />
      <path d="M19 15h2v6h-6v-2" />
    </svg>
  );
}

function BrowserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8" />
      <path d="M3.6 15h16.8" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}
