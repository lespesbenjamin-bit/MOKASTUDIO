import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PRIORITY_LABELS, TASK_TYPE_LABELS, isoToDateTimeInput } from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSaveTask, useTeam } from '@/features/leads/api';
import type { TaskOverview, TaskPriority, TaskType } from '@/features/leads/types';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

const schema = z.object({
  type: z.enum(['appeler', 'email', 'sms', 'relancer', 'rendez_vous', 'proposition']),
  title: z.string().trim().min(1, 'Titre requis').max(200),
  due: z.string().min(1, 'Échéance requise'),
  priority: z.enum(['basse', 'normale', 'haute', 'urgente']),
  assignee_id: z.string().min(1),
  description: z.string().optional().default(''),
});
type Values = z.infer<typeof schema>;

function tomorrowAt9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return isoToDateTimeInput(d.toISOString());
}

const DEFAULT_TITLES: Record<TaskType, string> = {
  appeler: 'Appeler', email: 'Envoyer un email', sms: 'Envoyer un SMS', relancer: 'Relancer',
  rendez_vous: 'Organiser un rendez-vous', proposition: 'Envoyer la proposition',
};

export function TaskModal({
  open, onClose, leadId, companyName, task,
}: { open: boolean; onClose: () => void; leadId: string | null; companyName?: string; task?: TaskOverview | null }) {
  const { profile, role } = useAuth();
  const isAdmin = role === 'admin';
  const team = useTeam(isAdmin);
  const save = useSaveTask();
  const form = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    save.reset();
    form.reset(
      task
        ? {
            type: task.type, title: task.title, due: isoToDateTimeInput(task.due_at), priority: task.priority,
            assignee_id: task.assignee_id, description: task.description ?? '',
          }
        : { type: 'appeler', title: 'Appeler', due: tomorrowAt9(), priority: 'normale', assignee_id: profile?.id ?? '', description: '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!profile) return;
    try {
      await save.mutateAsync({
        id: task?.id,
        createdBy: profile.id,
        input: {
          lead_id: task ? task.lead_id : leadId,
          type: v.type as TaskType,
          title: v.title.trim(),
          description: v.description?.trim() || null,
          due_at: new Date(v.due).toISOString(),
          priority: v.priority as TaskPriority,
          assignee_id: isAdmin ? v.assignee_id : profile.id,
        },
      });
      onClose();
    } catch {
      /* affiché via save.error */
    }
  });

  return (
    <Modal
      open={open}
      onClose={form.formState.isSubmitting ? () => undefined : onClose}
      title={task ? 'Modifier la tâche' : 'Nouvelle tâche'}
      description={companyName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>Annuler</Button>
          <Button type="submit" form="task-form" loading={form.formState.isSubmitting}>Enregistrer</Button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Type">
          {(id) => (
            <Select
              id={id}
              {...form.register('type', {
                onChange: (e) => {
                  const current = form.getValues('title');
                  if (!current || Object.values(DEFAULT_TITLES).includes(current)) {
                    form.setValue('title', DEFAULT_TITLES[e.target.value as TaskType]);
                  }
                },
              })}
            >
              {Object.entries(TASK_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Titre" error={form.formState.errors.title?.message}>
          {(id) => <Input id={id} invalid={!!form.formState.errors.title} {...form.register('title')} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Échéance" error={form.formState.errors.due?.message}>
            {(id) => <Input id={id} type="datetime-local" invalid={!!form.formState.errors.due} {...form.register('due')} />}
          </Field>
          <Field label="Priorité">
            {(id) => (
              <Select id={id} {...form.register('priority')}>
                {Object.entries(PRIORITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {isAdmin && (
          <Field label="Responsable">
            {(id) => (
              <Select id={id} {...form.register('assignee_id')}>
                {team.data?.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Détails">{(id) => <Textarea id={id} rows={2} {...form.register('description')} />}</Field>
        {save.isError && <Alert>{humanizeError(save.error)}</Alert>}
      </form>
    </Modal>
  );
}
