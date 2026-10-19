import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { LEAD_STATUSES, SOURCE_LABELS, contactName, formatAgo, formatDay } from '@/lib/crm';
import { useAuth } from '@/features/auth/AuthProvider';
import { FollowUpBadge, StatusPill } from './components';
import type { LeadOverview } from './types';

type SortKey = 'company_name' | 'status' | 'city' | 'owner_name' | 'last_activity_at' | 'next_follow_up_at' | 'created_at';

const statusRank = Object.fromEntries(LEAD_STATUSES.map((s, i) => [s, i])) as Record<string, number>;

function compare(a: LeadOverview, b: LeadOverview, key: SortKey): number {
  if (key === 'status') return statusRank[a.status]! - statusRank[b.status]!;
  const va = a[key];
  const vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1; // vides toujours en fin de liste
  if (vb == null) return -1;
  return String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
}

export function LeadsTable({ leads }: { leads: LeadOverview[] }) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last_activity_at', dir: -1 });

  const rows = useMemo(() => {
    const copy = [...leads];
    copy.sort((a, b) => {
      const c = compare(a, b, sort.key);
      // les valeurs vides restent à la fin quel que soit le sens
      if (a[sort.key as keyof LeadOverview] == null || b[sort.key as keyof LeadOverview] == null) return c;
      return c * sort.dir;
    });
    return copy;
  }, [leads, sort]);

  const header = (key: SortKey, label: string, className?: string) => (
    <th scope="col" className={clsx('px-3 py-2 text-left font-medium', className)}>
      <button
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        className="inline-flex items-center gap-1 hover:text-anthracite"
        aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <>
      {/* Bureau : tableau */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-beige text-xs text-anthracite-500">
            <tr>
              {header('company_name', 'Entreprise')}
              {header('status', 'Statut')}
              {header('city', 'Ville')}
              <th scope="col" className="px-3 py-2 text-left font-medium">Contact</th>
              {role === 'admin' && header('owner_name', 'Responsable')}
              {header('last_activity_at', 'Dernière activité')}
              {header('next_follow_up_at', 'Relance')}
            </tr>
          </thead>
          <tbody className="divide-y divide-beige">
            {rows.map((l) => (
              <tr
                key={l.id}
                onClick={() => navigate(`/prospects/${l.id}`)}
                className="cursor-pointer hover:bg-creme/70"
              >
                <td className="px-3 py-2.5">
                  <a href={`/prospects/${l.id}`} onClick={(e) => e.preventDefault()} className="font-medium text-anthracite">
                    {l.company_name}
                  </a>
                  <p className="text-xs text-anthracite-500">{SOURCE_LABELS[l.source]}{l.sector ? ` · ${l.sector}` : ''}</p>
                </td>
                <td className="px-3 py-2.5"><StatusPill status={l.status} /></td>
                <td className="px-3 py-2.5 text-anthracite-700">{l.city ?? '—'}</td>
                <td className="px-3 py-2.5 text-anthracite-700">
                  {contactName(l.contact_first_name, l.contact_last_name) || l.contact_email || l.contact_phone || '—'}
                </td>
                {role === 'admin' && (
                  <td className={clsx('px-3 py-2.5', l.owner_name ? 'text-anthracite-700' : 'font-medium text-terracotta-700')}>
                    {l.owner_name ?? 'À attribuer'}
                  </td>
                )}
                <td className="px-3 py-2.5 text-anthracite-500" title={formatDay(l.last_activity_at)}>{formatAgo(l.last_activity_at)}</td>
                <td className="px-3 py-2.5">{l.next_follow_up_at ? <FollowUpBadge iso={l.next_follow_up_at} compact /> : <span className="text-anthracite-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : liste */}
      <ul className="divide-y divide-beige md:hidden">
        {rows.map((l) => (
          <li key={l.id}>
            <button onClick={() => navigate(`/prospects/${l.id}`)} className="w-full px-4 py-3 text-left active:bg-creme">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium">{l.company_name}</p>
                <StatusPill status={l.status} className="shrink-0" />
              </div>
              <p className="mt-0.5 truncate text-xs text-anthracite-500">
                {[l.city, contactName(l.contact_first_name, l.contact_last_name), role === 'admin' ? l.owner_name ?? 'À attribuer' : null]
                  .filter(Boolean).join(' · ')}
              </p>
              {l.next_follow_up_at && <div className="mt-1.5"><FollowUpBadge iso={l.next_follow_up_at} /></div>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
