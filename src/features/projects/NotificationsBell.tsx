import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Bell } from 'lucide-react';
import { formatAgo } from '@/lib/crm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMarkNotificationsRead, useNotifications } from './api';

/** Cloche des notifications (projets clients). Aucune notification n'est envoyée par email. */
export function NotificationsBell({ className }: { className?: string }) {
  const { role } = useAuth();
  const enabled = role === 'admin' || role === 'commercial';
  const list = useNotifications(enabled);
  const mark = useMarkNotificationsRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!enabled) return null;
  const items = list.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div ref={box} className={clsx('relative', className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} non lues` : 'Notifications'}
        className="relative rounded-lg p-2 text-anthracite-700 hover:bg-beige/60">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-beige-300 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-beige px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => mark.mutate(undefined)} className="text-xs font-medium text-terracotta-700 hover:underline">Tout marquer comme lu</button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-beige overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button"
                  onClick={() => { if (!n.read_at) mark.mutate([n.id]); setOpen(false); if (n.link) navigate(n.link); }}
                  className={clsx('block w-full px-4 py-2.5 text-left hover:bg-creme', !n.read_at && 'bg-terracotta-50/50')}>
                  <p className="flex items-start gap-2 text-sm">
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta" aria-label="Non lue" />}
                    <span className={clsx(!n.read_at && 'font-medium')}>{n.title}</span>
                  </p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-anthracite-500">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-anthracite-300">{formatAgo(n.created_at)}</p>
                </button>
              </li>
            ))}
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-anthracite-500">Aucune notification.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
