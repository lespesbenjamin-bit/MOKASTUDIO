import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callFunction, isDemo, supabase } from '@/lib/supabase';
import type {
  PortalData, PortalFile, ProjectAnswers, ProjectFileRow, ProjectStatus,
} from '@/types/database';
import { ACCEPTED_MIME, MAX_FILE_BYTES } from './questions';

export const projectKeys = {
  all: ['projects'] as const,
  list: ['projects', 'list'] as const,
  one: (id: string) => ['projects', id] as const,
  questionnaire: (id: string) => ['projects', id, 'questionnaire'] as const,
  files: (id: string) => ['projects', id, 'files'] as const,
  tasks: (id: string) => ['projects', id, 'tasks'] as const,
  events: (id: string) => ['projects', id, 'events'] as const,
  briefs: (id: string) => ['projects', id, 'briefs'] as const,
  links: (id: string) => ['projects', id, 'links'] as const,
  forContract: (id: string) => ['projects', 'contract', id] as const,
  notifications: ['notifications'] as const,
};

function unwrap<R extends { data: unknown; error: unknown }>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw res.error;
  return res.data as Extract<R, { error: null }>['data'];
}

// --- Lecture (équipe) -----------------------------------------------------------
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list,
    queryFn: async () => unwrap(await supabase.from('project_overview').select('*').order('created_at', { ascending: false }).limit(1000)) ?? [],
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.one(id),
    queryFn: async () => unwrap(await supabase.from('project_overview').select('*').eq('id', id).maybeSingle()),
  });
}

export function useProjectForContract(contractId: string) {
  return useQuery({
    queryKey: projectKeys.forContract(contractId),
    queryFn: async () =>
      unwrap(await supabase.from('project_overview').select('id, status, title').eq('contract_id', contractId).neq('status', 'annule').limit(1))?.[0] ?? null,
  });
}

export function useQuestionnaire(id: string) {
  return useQuery({
    queryKey: projectKeys.questionnaire(id),
    queryFn: async () => unwrap(await supabase.from('project_questionnaires').select('*').eq('project_id', id).maybeSingle()),
  });
}

export function useProjectFiles(id: string) {
  return useQuery({
    queryKey: projectKeys.files(id),
    queryFn: async () => unwrap(await supabase.from('project_files').select('*').eq('project_id', id).eq('status', 'valide').order('created_at')) ?? [],
  });
}

export function useProjectTasks(id: string) {
  return useQuery({
    queryKey: projectKeys.tasks(id),
    queryFn: async () => unwrap(await supabase.from('project_tasks').select('*').eq('project_id', id).order('position').order('created_at')) ?? [],
  });
}

export function useProjectEvents(id: string) {
  return useQuery({
    queryKey: projectKeys.events(id),
    queryFn: async () => unwrap(await supabase.from('project_events').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(500)) ?? [],
  });
}

export function useProjectBriefs(id: string) {
  return useQuery({
    queryKey: projectKeys.briefs(id),
    queryFn: async () => unwrap(await supabase.from('project_briefs').select('*').eq('project_id', id).order('version', { ascending: false })) ?? [],
  });
}

export function useProjectLinks(id: string) {
  return useQuery({
    queryKey: projectKeys.links(id),
    queryFn: async () =>
      unwrap(await supabase.from('project_access_tokens')
        .select('id, project_id, created_by, created_at, expires_at, revoked_at, revoked_by, last_used_at, use_count')
        .eq('project_id', id).order('created_at', { ascending: false })) ?? [],
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: projectKeys.notifications,
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) ?? [],
  });
}

// --- Écritures (équipe) -----------------------------------------------------------
function useInvalidate(id?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: id ? projectKeys.one(id) : projectKeys.all });
    void qc.invalidateQueries({ queryKey: projectKeys.list });
    if (id) {
      for (const k of [projectKeys.events(id), projectKeys.questionnaire(id), projectKeys.briefs(id), projectKeys.links(id), projectKeys.files(id), projectKeys.tasks(id)]) {
        void qc.invalidateQueries({ queryKey: k });
      }
    }
    void qc.invalidateQueries({ queryKey: projectKeys.notifications });
  };
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => unwrap(await supabase.rpc('create_client_project', { p_contract_id: contractId })) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useSetStatus(id: string) {
  const inv = useInvalidate(id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { status: ProjectStatus; note?: string | null; siteUrl?: string | null }) =>
      unwrap(await supabase.rpc('set_project_status', { p_project_id: id, p_status: v.status, p_note: v.note ?? null, p_site_url: v.siteUrl ?? null })),
    onSuccess: () => { inv(); void qc.invalidateQueries({ queryKey: ['contracts'] }); },
  });
}

/** Changement de statut d'un projet quelconque (Kanban, livraison). */
export function useSetStatusAny() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: ProjectStatus; note?: string | null; siteUrl?: string | null }) =>
      unwrap(await supabase.rpc('set_project_status', { p_project_id: v.id, p_status: v.status, p_note: v.note ?? null, p_site_url: v.siteUrl ?? null })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      void qc.invalidateQueries({ queryKey: projectKeys.notifications });
      void qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

export function useUpdateProject(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async (patch: Record<string, string | null>) => unwrap(await supabase.rpc('update_project', { p_project_id: id, p_patch: patch })),
    onSuccess: inv,
  });
}

export function useAddComment(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async (body: string) => unwrap(await supabase.rpc('add_project_comment', { p_project_id: id, p_body: body })),
    onSuccess: inv,
  });
}

export function useFlagMissing(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async (message: string) => unwrap(await supabase.rpc('flag_missing_info', { p_project_id: id, p_message: message })),
    onSuccess: inv,
  });
}

export function useCreateLink(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('create_project_link', { p_project_id: id })) as { token: string; expires_at: string },
    onSuccess: inv,
  });
}

export function useRevokeLinks(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('revoke_project_links', { p_project_id: id })),
    onSuccess: inv,
  });
}

export function useSaveBrief(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async (content: string) => unwrap(await supabase.rpc('save_project_brief', { p_project_id: id, p_content: content })),
    onSuccess: inv,
  });
}

export function useValidateBrief(id: string) {
  const inv = useInvalidate(id);
  return useMutation({
    mutationFn: async (briefId: string) => unwrap(await supabase.rpc('validate_project_brief', { p_brief_id: briefId })),
    onSuccess: inv,
  });
}

export function useTaskMutations(projectId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: projectKeys.tasks(projectId) });
    void qc.invalidateQueries({ queryKey: projectKeys.list });
  };
  const add = useMutation({
    mutationFn: async (rows: { title: string; due_on?: string | null; assignee_id?: string | null; position?: number }[]) =>
      unwrap(await supabase.from('project_tasks').insert(rows.map((r) => ({ ...r, project_id: projectId })))),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: 'a_faire' | 'en_cours' | 'fait'; title?: string; due_on?: string | null; assignee_id?: string | null }) =>
      unwrap(await supabase.from('project_tasks').update({
        ...patch,
        ...(patch.status ? { done_at: patch.status === 'fait' ? new Date().toISOString() : null } : {}),
      }).eq('id', id)),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('project_tasks').delete().eq('id', id)),
    onSuccess: done,
  });
  return { add, update, remove };
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => unwrap(await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null })),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.notifications }),
  });
}

/** URL temporaires (10 min) pour consulter les documents. */
export async function signedUrls(paths: string[], download = false): Promise<Record<string, string>> {
  if (!paths.length || isDemo) return {};
  const { data, error } = await supabase.storage.from('project-files').createSignedUrls(paths, 600, download ? { download: true } : undefined);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// --- Portail client (sans compte) ------------------------------------------------
export const portal = {
  open: async (token: string) => unwrap(await supabase.rpc('portal_open', { p_token: token })) as PortalData,
  save: async (token: string, patch: Record<string, unknown>, step: number, completion: number) =>
    unwrap(await supabase.rpc('portal_save', { p_token: token, p_patch: patch as ProjectAnswers, p_step: step, p_completion: completion })) as string,
  submit: async (token: string) => unwrap(await supabase.rpc('portal_submit', { p_token: token, p_consent: true })),
};

// --- Fichiers (client ou équipe) --------------------------------------------------
export type UploadTarget = { token: string } | { projectId: string };

export function checkFile(file: File): string | null {
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) return `${file.name} : format non accepté (JPG, PNG, WEBP ou PDF).`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} : fichier trop volumineux (10 Mo maximum).`;
  if (file.size === 0) return `${file.name} : fichier vide.`;
  return null;
}

/** Réduit une photo trop lourde (> 10 Mo) en JPEG 2 560 px, dans le navigateur. */
export async function shrinkIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_FILE_BYTES || !file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function uploadProjectFile(target: UploadTarget, category: string, original: File): Promise<void> {
  if (isDemo) throw new Error('Mode démonstration : l’envoi de fichiers est désactivé.');
  const file = await shrinkIfNeeded(original);
  const err = checkFile(file);
  if (err) throw new Error(err);
  const who = 'token' in target ? { token: target.token } : { project_id: target.projectId };
  const begin = await callFunction<{ file_id: string; path: string; upload_token: string }>('project-files', {
    action: 'begin', ...who, category, name: file.name, mime: file.type, size: file.size,
  });
  const up = await supabase.storage.from('project-files').uploadToSignedUrl(begin.path, begin.upload_token, file, { contentType: file.type });
  if (up.error) throw new Error(`${file.name} : envoi interrompu, merci de réessayer.`);
  await callFunction('project-files', { action: 'confirm', file_id: begin.file_id, ...('token' in target ? { token: target.token } : {}) });
}

export async function deleteProjectFile(target: UploadTarget, fileId: string): Promise<void> {
  if (isDemo) throw new Error('Mode démonstration : aucune modification n’est enregistrée.');
  await callFunction('project-files', { action: 'delete', file_id: fileId, ...('token' in target ? { token: target.token } : {}) });
}

export const toPortalFile = (f: ProjectFileRow): PortalFile => ({
  id: f.id, category: f.category, name: f.original_name, size: f.size_bytes, mime: f.mime_type, via: f.uploaded_via, created_at: f.created_at,
});
