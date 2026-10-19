import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { MapPin, Phone, User } from 'lucide-react';
import { LEAD_STATUSES, STATUS_DOT, STATUS_LABELS, contactName } from '@/lib/crm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useUpdateLeadStatus } from './api';
import { FollowUpBadge, LostReasonModal } from './components';
import type { LeadOverview, LeadStatus } from './types';
import { Alert } from '@/components/ui';
import { humanizeError } from '@/lib/supabase';

function CardBody({ lead, showOwner }: { lead: LeadOverview; showOwner: boolean }) {
  const contact = contactName(lead.contact_first_name, lead.contact_last_name);
  return (
    <>
      <p className="truncate text-sm font-medium text-anthracite">{lead.company_name}</p>
      <div className="mt-1 space-y-0.5 text-xs text-anthracite-500">
        {lead.city && (
          <p className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" aria-hidden />{lead.city}</p>
        )}
        {contact && <p className="flex items-center gap-1 truncate"><User className="h-3 w-3 shrink-0" aria-hidden />{contact}</p>}
        {!contact && lead.contact_phone && (
          <p className="flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0" aria-hidden />{lead.contact_phone}</p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <FollowUpBadge iso={lead.next_follow_up_at} compact />
        {lead.open_tasks > 0 && (
          <span className="rounded bg-beige/70 px-1.5 py-0.5 text-[11px] text-anthracite-700">
            {lead.open_tasks} tâche{lead.open_tasks > 1 ? 's' : ''}
          </span>
        )}
        {showOwner && (
          <span className={clsx('ml-auto truncate text-[11px]', lead.owner_name ? 'text-anthracite-500' : 'font-medium text-terracotta-700')}>
            {lead.owner_name ?? 'À attribuer'}
          </span>
        )}
      </div>
    </>
  );
}

function DraggableCard({ lead, showOwner }: { lead: LeadOverview; showOwner: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { lead } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={clsx('touch-manipulation rounded-lg', isDragging && 'opacity-30')}
    >
      <Link
        to={`/prospects/${lead.id}`}
        draggable={false}
        className="block rounded-lg border border-beige-300/80 bg-white p-3 shadow-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40"
      >
        <CardBody lead={lead} showOwner={showOwner} />
      </Link>
    </div>
  );
}

function Column({ status, leads, showOwner }: { status: LeadStatus; leads: LeadOverview[]; showOwner: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className={clsx(
        'flex w-[78vw] max-w-[272px] shrink-0 snap-start flex-col rounded-xl border transition-colors sm:w-64',
        isOver ? 'border-terracotta/50 bg-terracotta-50/60' : 'border-transparent bg-beige/40',
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={clsx('h-2 w-2 rounded-full', STATUS_DOT[status])} aria-hidden />
        <h2 className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-anthracite-700">{STATUS_LABELS[status]}</h2>
        <span className="rounded-md bg-white/80 px-1.5 text-xs tabular-nums text-anthracite-500">{leads.length}</span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {leads.map((l) => <DraggableCard key={l.id} lead={l} showOwner={showOwner} />)}
        {leads.length === 0 && (
          <p className="rounded-lg border border-dashed border-beige-300 px-3 py-4 text-center text-xs text-anthracite-300">
            Déposer ici
          </p>
        )}
      </div>
    </section>
  );
}

export function KanbanBoard({ leads }: { leads: LeadOverview[] }) {
  const { role } = useAuth();
  const update = useUpdateLeadStatus();
  const [active, setActive] = useState<LeadOverview | null>(null);
  const [pendingLost, setPendingLost] = useState<LeadOverview | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Sur mobile : appui long pour déplacer, sinon le doigt fait défiler
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(LEAD_STATUSES.map((s) => [s, [] as LeadOverview[]])) as Record<LeadStatus, LeadOverview[]>;
    for (const l of leads) map[l.status].push(l);
    return map;
  }, [leads]);

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { lead: LeadOverview }).lead);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const lead = (e.active.data.current as { lead: LeadOverview } | undefined)?.lead;
    const to = e.over?.id as LeadStatus | undefined;
    if (!lead || !to || to === lead.status) return;
    if (to === 'perdu') setPendingLost(lead);
    else update.mutate({ id: lead.id, status: to });
  };

  return (
    <>
      {update.isError && !pendingLost && (
        <div className="mb-3"><Alert>{humanizeError(update.error)}</Alert></div>
      )}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" style={{ minHeight: '60vh' }}>
          {LEAD_STATUSES.map((s) => <Column key={s} status={s} leads={byStatus[s]} showOwner={role === 'admin'} />)}
        </div>
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="w-60 rotate-1 rounded-lg border border-terracotta/40 bg-white p-3 shadow-xl">
              <CardBody lead={active} showOwner={role === 'admin'} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <LostReasonModal
        open={pendingLost !== null}
        companyName={pendingLost?.company_name}
        loading={update.isPending}
        error={pendingLost && update.isError ? update.error : undefined}
        onCancel={() => { setPendingLost(null); update.reset(); }}
        onConfirm={(reason) =>
          pendingLost &&
          update.mutate(
            { id: pendingLost.id, status: 'perdu', lostReason: reason },
            { onSuccess: () => setPendingLost(null) },
          )
        }
      />
    </>
  );
}
