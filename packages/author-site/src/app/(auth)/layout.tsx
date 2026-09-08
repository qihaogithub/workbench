import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-orb auth-orb-left" aria-hidden="true" />
      <div className="auth-orb auth-orb-right" aria-hidden="true" />
      <header className="auth-header">
        <Link href="/" className="auth-brand" aria-label="OneFlow 首页">
          <span className="auth-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="auth-brand-name">OneFlow</span>
        </Link>
      </header>

      <main className="auth-main auth-main-centered">{children}</main>
    </div>
  );
}
