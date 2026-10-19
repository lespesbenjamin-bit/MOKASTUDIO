import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, Mail, MessageSquare, Pencil, Phone, CalendarClock, FileText, RotateCcw } from 'lucide-react';
import { PRIORITY_LABELS, TASK_TYPE_LABELS, daysFromToday, formatDateTime } from '@/lib/crm';
import { useSetTaskStatus } from '@/features/leads/api';
import type { TaskOverview, TaskType } from '@/features/leads/types';

const ICONS: Record<TaskType, typeof Phone> = {
  appeler: Phone, email: Mail, sms: MessageSquare, relancer: RotateCcw, rendez_vous: CalendarClock, proposition: FileText,
};

export function TaskItem({
  task, showCompany = true, showAssignee = false, onEdit,
}: { task: TaskOverview; showCompany?: boolean; showAssignee?: boolean; onEdit?: (t: TaskOverview) => void }) {
  const setStatus = useSetTaskStatus();
  const done = task.status === 'fait';
  const late = !done && daysFromToday(task.due_at) < 0;
  const Icon = ICONS[task.type];

  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <button
        onClick={() => setStatus.mutate({ id: task.id, status: done ? 'a_faire' : 'fait', leadId: task.lead_id })}
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-beige-300 bg-white hover:border-terracotta',
        )}
        aria-label={done ? `Rouvrir « ${task.title} »` : `Marquer « ${task.title} » comme faite`}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-anthracite-500" aria-label={TASK_TYPE_LABELS[task.type]} />
          <p className={clsx('text-sm', done ? 'text-anthracite-300 line-through' : 'font-medium text-anthracite')}>{task.title}</p>
          {(task.priority === 'haute' || task.priority === 'urgente') && !done && (
            <span className={clsx('rounded px-1.5 text-[11px] font-medium', task.priority === 'urgente' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800')}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-anthracite-500">
          <span className={clsx(late && 'font-medium text-red-700')}>{late ? 'En retard · ' : ''}{formatDateTime(task.due_at)}</span>
          {showCompany && task.company_name && task.lead_id && (
            <> · <Link to={`/prospects/${task.lead_id}`} className="text-terracotta-700 hover:underline">{task.company_name}</Link></>
          )}
          {showAssignee && task.assignee_name && <> · {task.assignee_name}</>}
        </p>
        {task.description && !done && <p className="mt-1 text-xs text-anthracite-500">{task.description}</p>}
      </div>
      {onEdit && !done && (
        <button
          onClick={() => onEdit(task)}
          className="rounded-md p-1.5 text-anthracite-300 hover:bg-creme hover:text-anthracite sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          aria-label="Modifier la tâche"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
