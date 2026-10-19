import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { OPEN_STATUSES, daysFromToday, formatAgo } from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeads, useStaleDays, useTasks, useTeam } from '@/features/leads/api';
import { FollowUpBadge, StatusPill } from '@/features/leads/components';
import type { LeadOverview, TaskOverview } from '@/features/leads/types';
import { Alert, Card, EmptyState, PageHeader, Select, Spinner } from '@/components/ui';
import { TaskItem } from './TaskItem';
import { TaskModal } from './TaskModal';

function Section({ title, count, tone, children }: { title: string; count: number; tone?: 'danger'; children: ReactNode }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 px-4 pb-1 pt-4 text-sm font-semibold">
        {title}
        <span className={tone === 'danger' && count ? 'rounded bg-red-50 px-1.5 text-xs text-red-800' : 'rounded bg-beige/70 px-1.5 text-xs text-anthracite-500'}>
          {count}
        </span>
      </h2>
      {children}
    </Card>
  );
}

function LeadLine({ lead, right }: { lead: LeadOverview; right: ReactNode }) {
  return (
    <li>
      <Link to={`/prospects/${lead.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-creme/70">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{lead.company_name}</p>
          <p className="truncate text-xs text-anthracite-500">{[lead.city, lead.contact_phone].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">{right}</div>
      </Link>
    </li>
  );
}

export function TasksPage() {
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin';
  const team = useTeam(isAdmin);
  const [who, setWho] = useState<string>('moi');
  const tasks = useTasks({ openOnly: true });
  const leads = useLeads();
  const staleDays = useStaleDays();
  const [modal, setModal] = useState<{ open: boolean; task: TaskOverview | null }>({ open: false, task: null });

  const targetId = who === 'moi' ? profile?.id : who === 'tous' ? null : who;
  const stale = staleDays.data ?? 14;

  const groups = useMemo(() => {
    const list = (tasks.data ?? []).filter((t) => !targetId || t.assignee_id === targetId);
    return {
      late: list.filter((t) => daysFromToday(t.due_at) < 0),
      today: list.filter((t) => daysFromToday(t.due_at) === 0),
      week: list.filter((t) => { const d = daysFromToday(t.due_at); return d > 0 && d <= 7; }),
      later: list.filter((t) => daysFromToday(t.due_at) > 7),
    };
  }, [tasks.data, targetId]);

  const leadGroups = useMemo(() => {
    const open = (leads.data ?? []).filter((l) => OPEN_STATUSES.includes(l.status) && (!targetId || l.owner_id === targetId));
    return {
      followUps: open
        .filter((l) => l.next_follow_up_at && daysFromToday(l.next_follow_up_at) <= 0)
        .sort((a, b) => a.next_follow_up_at!.localeCompare(b.next_follow_up_at!)),
      stale: open
        .filter((l) => -daysFromToday(l.last_activity_at) >= stale && l.open_tasks === 0)
        .sort((a, b) => a.last_activity_at.localeCompare(b.last_activity_at)),
    };
  }, [leads.data, targetId, stale]);

  const loading = tasks.isPending || leads.isPending;
  const error = tasks.error ?? leads.error;
  const nothing = !loading && !error && groups.late.length + groups.today.length + groups.week.length + groups.later.length
    + leadGroups.followUps.length + leadGroups.stale.length === 0;

  const taskList = (list: TaskOverview[]) => (
    <ul className="divide-y divide-beige">
      {list.map((t) => (
        <TaskItem key={t.id} task={t} showAssignee={isAdmin && who === 'tous'} onEdit={(task) => setModal({ open: true, task })} />
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title={who === 'moi' ? 'Mes relances' : 'Relances'}
        description={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <>
            {isAdmin && (
              <Select value={who} onChange={(e) => setWho(e.target.value)} className="!w-44" aria-label="Voir les relances de">
                <option value="moi">Les miennes</option>
                <option value="tous">Toute l’équipe</option>
                {team.data?.filter((m) => m.id !== profile?.id).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </Select>
            )}
          </>
        }
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert>{humanizeError(error)}</Alert>
      ) : nothing ? (
        <Card>
          <EmptyState icon={<CalendarCheck className="h-8 w-8" />} title="Rien à relancer">
            Aucune tâche ouverte ni prospect en attente. Planifiez vos prochaines actions depuis les fiches prospects.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {groups.late.length > 0 && <Section title="En retard" count={groups.late.length} tone="danger">{taskList(groups.late)}</Section>}
            <Section title="Aujourd’hui" count={groups.today.length}>
              {groups.today.length ? taskList(groups.today) : <p className="px-4 pb-4 text-sm text-anthracite-500">Aucune tâche prévue aujourd’hui.</p>}
            </Section>
            {groups.week.length > 0 && <Section title="Dans les 7 jours" count={groups.week.length}>{taskList(groups.week)}</Section>}
            {groups.later.length > 0 && <Section title="Plus tard" count={groups.later.length}>{taskList(groups.later)}</Section>}
          </div>
          <div className="space-y-4">
            <Section title="Prospects à relancer" count={leadGroups.followUps.length} tone="danger">
              {leadGroups.followUps.length ? (
                <ul className="divide-y divide-beige">
                  {leadGroups.followUps.map((l) => (
                    <LeadLine key={l.id} lead={l} right={<><FollowUpBadge iso={l.next_follow_up_at} compact /><StatusPill status={l.status} /></>} />
                  ))}
                </ul>
              ) : <p className="px-4 pb-4 text-sm text-anthracite-500">Aucune relance due.</p>}
            </Section>
            <Section title={`Sans activité depuis ${stale} j`} count={leadGroups.stale.length}>
              {leadGroups.stale.length ? (
                <ul className="divide-y divide-beige">
                  {leadGroups.stale.slice(0, 15).map((l) => (
                    <LeadLine key={l.id} lead={l} right={<span className="text-xs text-anthracite-500">{formatAgo(l.last_activity_at)}</span>} />
                  ))}
                </ul>
              ) : <p className="px-4 pb-4 text-sm text-anthracite-500">Tous vos prospects sont suivis.</p>}
            </Section>
          </div>
        </div>
      )}

      <TaskModal open={modal.open} task={modal.task} leadId={null} onClose={() => setModal({ open: false, task: null })} />
    </>
  );
}
