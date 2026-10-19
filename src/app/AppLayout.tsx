import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { BrandMark } from '@/features/auth/AuthLayout';
import { ROLE_LABELS } from '@/lib/roles';
import { navFor } from './navigation';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, role, signOut } = useAuth();
  if (!profile || !role) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <BrandMark className="h-8 w-8" />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold">Moka Studio</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-anthracite-500">Business Hub</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        {navFor(role).map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && (
              <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-anthracite-300">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                if (item.comingInStep) {
                  return (
                    <li key={item.to}>
                      <span
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-anthracite-300"
                        title={`Module livré à l'étape ${item.comingInStep}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-beige/70 px-1.5 text-[10px] font-medium text-anthracite-500">bientôt</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/' || item.to === '/parametres'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                          isActive ? 'bg-white font-medium text-anthracite shadow-card' : 'text-anthracite-700 hover:bg-white/60',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={clsx('h-4 w-4', isActive ? 'text-terracotta' : 'text-anthracite-500')} aria-hidden />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-beige-300/70 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terracotta-100 text-xs font-semibold text-terracotta-700">
            {initials(profile.full_name)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{profile.full_name}</p>
            <p className="truncate text-xs text-anthracite-500">{ROLE_LABELS[role]}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-md p-1.5 text-anthracite-500 hover:bg-white hover:text-anthracite"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Recherche globale : ouvre la liste des prospects filtrée */
function GlobalSearch({ className }: { className?: string }) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  if (role !== 'admin' && role !== 'commercial') return null;
  return (
    <form
      role="search"
      className={clsx('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        navigate(q ? `/prospects?q=${encodeURIComponent(q)}` : '/prospects');
        setValue('');
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-anthracite-300" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Rechercher un prospect…"
        aria-label="Rechercher un prospect"
        className="h-9 w-full rounded-lg border border-beige-300 bg-white pl-9 pr-3 text-sm placeholder:text-anthracite-300 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30"
      />
    </form>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-creme text-anthracite">
      {/* Sidebar bureau */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-beige-300/70 bg-beige/40 lg:block">
        <Sidebar />
      </aside>

      {/* Barre mobile */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-beige-300/70 bg-creme/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="-ml-1 rounded-md p-1.5 hover:bg-beige/60" aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </button>
        <BrandMark className="h-7 w-7" />
        <span className="font-display font-semibold">Moka Studio</span>
      </header>

      {/* Tiroir mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-anthracite/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-creme shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 hover:bg-beige/60"
              aria-label="Fermer le menu"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="hidden border-b border-beige-300/60 bg-creme/80 backdrop-blur lg:block">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-10">
            <GlobalSearch className="w-80" />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
