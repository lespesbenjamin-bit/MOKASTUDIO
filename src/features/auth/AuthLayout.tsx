import type { ReactNode } from 'react';

export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#B66B50" />
      <path d="M8 22V11l8 7 8-7v11" fill="none" stroke="#F8F4EF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-creme px-4 py-10 text-anthracite">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold">Moka Studio</p>
            <p className="text-xs uppercase tracking-[0.14em] text-anthracite-500">Business Hub</p>
          </div>
        </div>
        <h1 className="font-display text-[1.7rem] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-anthracite-500">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </div>
      <p className="mt-10 text-center text-xs text-anthracite-300">Accès réservé à l'équipe Moka Studio et à ses partenaires.</p>
    </div>
  );
}
