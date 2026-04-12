import React from 'react';

interface BannerDemoProps {
  title: string;
  description: string;
  theme: 'light' | 'dark' | 'colorful';
  showBadge: boolean;
}

export default function BannerDemo({ 
  title, 
  description, 
  theme,
  showBadge 
}: BannerDemoProps) {
  const getThemeClasses = () => {
    switch (theme) {
      case 'light':
        return {
          container: 'bg-gradient-to-br from-slate-50 via-white to-slate-100',
          card: 'bg-white border-slate-200',
          title: 'text-slate-900',
          description: 'text-slate-600',
          badge: 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25',
          icon: 'text-blue-500',
          decorative: 'text-slate-200',
        };
      case 'dark':
        return {
          container: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
          card: 'bg-slate-800/80 border-slate-700 backdrop-blur-sm',
          title: 'text-white',
          description: 'text-slate-300',
          badge: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25',
          icon: 'text-purple-400',
          decorative: 'text-slate-700',
        };
      case 'colorful':
        return {
          container: 'bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500',
          card: 'bg-white/10 backdrop-blur-md border-white/20',
          title: 'text-white',
          description: 'text-white/90',
          badge: 'bg-white text-purple-600 shadow-lg shadow-white/25',
          icon: 'text-white',
          decorative: 'text-white/20',
        };
    }
  };

  const themeClasses = getThemeClasses();

  return (
    <div className={`min-h-screen ${themeClasses.container} relative overflow-hidden`}>
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-24 -right-24 w-96 h-96 rounded-full ${themeClasses.decorative} opacity-50 blur-3xl`} />
        <div className={`absolute -bottom-24 -left-24 w-96 h-96 rounded-full ${themeClasses.decorative} opacity-50 blur-3xl`} />
        
        {/* Geometric Decorative Elements */}
        <svg className={`absolute top-20 left-10 w-16 h-16 ${themeClasses.decorative} opacity-30`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        <svg className={`absolute bottom-32 right-20 w-12 h-12 ${themeClasses.decorative} opacity-30`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="8" y="8" width="8" height="8" rx="1" />
        </svg>
        <svg className={`absolute top-1/2 right-10 w-20 h-20 ${themeClasses.decorative} opacity-20 transform rotate-45`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="12,2 22,22 2,22" />
        </svg>
      </div>

      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className={`max-w-4xl mx-auto ${themeClasses.card} rounded-3xl p-10 md:p-14 shadow-2xl border backdrop-blur-sm`}>
          {/* Badge */}
          {showBadge && (
            <div className="mb-8 animate-fade-in">
              <span className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold ${themeClasses.badge} transform hover:scale-105 transition-transform duration-200`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                活动中
              </span>
            </div>
          )}
          
          {/* Icon */}
          <div className={`mb-6 ${themeClasses.icon} transform hover:scale-110 transition-transform duration-300`}>
            <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z" />
              <path d="M5 3v4" />
              <path d="M19 17v4" />
              <path d="M3 5h4" />
              <path d="M17 19h4" />
            </svg>
          </div>

          {/* Title */}
          <h1 className={`text-4xl md:text-5xl font-bold mb-6 leading-tight ${themeClasses.title} animate-slide-up`}>
            {title}
          </h1>
          
          {/* Description */}
          <p className={`text-lg md:text-xl leading-relaxed mb-8 ${themeClasses.description} animate-slide-up animation-delay-200`}>
            {description}
          </p>

          {/* CTA Button */}
          <div className="flex flex-wrap gap-4 animate-slide-up animation-delay-300">
            <button className={`
              px-8 py-4 rounded-xl font-semibold text-lg
              transform hover:scale-105 hover:-translate-y-0.5
              transition-all duration-200 shadow-lg
              ${theme === 'colorful' 
                ? 'bg-white text-purple-600 hover:bg-white/90 hover:shadow-white/40' 
                : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:shadow-blue-500/40 hover:from-blue-600 hover:to-indigo-600'
              }
            `}>
              <span className="flex items-center gap-2">
                立即参与
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </span>
            </button>
            <button className={`
              px-8 py-4 rounded-xl font-semibold text-lg
              border-2 transition-all duration-200
              ${theme === 'colorful' 
                ? 'border-white text-white hover:bg-white/10' 
                : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              }
            `}>
              了解更多
            </button>
          </div>

          {/* Stats */}
          <div className={`mt-12 pt-8 border-t ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'} grid grid-cols-3 gap-6 animate-slide-up animation-delay-400`}>
            <div>
              <div className={`text-3xl font-bold ${themeClasses.title}`}>2,847</div>
              <div className={`text-sm mt-1 ${themeClasses.description}`}>参与人数</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${themeClasses.title}`}>98%</div>
              <div className={`text-sm mt-1 ${themeClasses.description}`}>满意度</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${themeClasses.title}`}>剩余 7 天</div>
              <div className={`text-sm mt-1 ${themeClasses.description}`}>活动倒计时</div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Styles for Animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        
        .animate-slide-up {
          animation: slide-up 0.6s ease-out;
        }
        
        .animation-delay-200 {
          animation-delay: 200ms;
        }
        
        .animation-delay-300 {
          animation-delay: 300ms;
        }
        
        .animation-delay-400 {
          animation-delay: 400ms;
        }
      `}</style>
    </div>
  );
}
