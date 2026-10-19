import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  BeneficiaryRole, CommissionStatus, ContractStatus, OfferCode, PaymentStatus, SiteStatus,
} from '@/types/database';
import { keys as leadKeys } from '@/features/leads/api';

export const salesKeys = {
  contracts: ['contracts'] as const,
  contract: (id: string) => ['contracts', id] as const,
  payments: ['payments'] as const,
  commissions: ['commissions'] as const,
  myCommissions: ['my-commissions'] as const,
  offers: ['offers'] as const,
  rules: ['commission-rules'] as const,
  settings: ['app-settings'] as const,
};

function unwrap<R extends { data: unknown; error: unknown }>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw res.error;
  return res.data as Extract<R, { error: null }>['data'];
}

function useInvalidateSales() {
  const qc = useQueryClient();
  return () => {
    for (const k of [salesKeys.contracts, salesKeys.payments, salesKeys.commissions, salesKeys.myCommissions, leadKeys.leads]) {
      void qc.invalidateQueries({ queryKey: k });
    }
  };
}

// --- Lecture ----------------------------------------------------------------
export function useContracts() {
  return useQuery({
    queryKey: salesKeys.contracts,
    queryFn: async () => unwrap(await supabase.from('contract_overview').select('*').order('signed_at', { ascending: false }).limit(2000)),
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: salesKeys.contract(id),
    queryFn: async () => unwrap(await supabase.from('contract_overview').select('*').eq('id', id).maybeSingle()),
  });
}

export function useContractForLead(leadId: string) {
  return useQuery({
    queryKey: [...salesKeys.contracts, 'lead', leadId],
    queryFn: async () =>
      unwrap(await supabase.from('contract_overview').select('id, reference, status').eq('lead_id', leadId).neq('status', 'annule').limit(1)),
  });
}

export function usePayments(filter?: { contractId?: string }) {
  return useQuery({
    queryKey: [...salesKeys.payments, filter ?? {}],
    queryFn: async () => {
      let q = supabase.from('payment_overview').select('*').order('due_on', { ascending: true }).limit(3000);
      if (filter?.contractId) q = q.eq('contract_id', filter.contractId);
      return unwrap(await q);
    },
  });
}

export function useCommissions(filter?: { contractId?: string }, enabled = true) {
  return useQuery({
    queryKey: [...salesKeys.commissions, filter ?? {}],
    enabled,
    queryFn: async () => {
      let q = supabase.from('commission_overview').select('*').order('signed_at', { ascending: false }).limit(5000);
      if (filter?.contractId) q = q.eq('contract_id', filter.contractId);
      return unwrap(await q);
    },
  });
}

export function useMyCommissions(enabled = true) {
  return useQuery({
    queryKey: salesKeys.myCommissions,
    enabled,
    queryFn: async () => unwrap(await supabase.rpc('my_commissions')) ?? [],
  });
}

export function useOffers() {
  return useQuery({
    queryKey: salesKeys.offers,
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await supabase.from('offers').select('*').order('code')),
  });
}

export function useRules() {
  return useQuery({
    queryKey: salesKeys.rules,
    queryFn: async () =>
      unwrap(await supabase.from('commission_rules').select('*').order('valid_from', { ascending: false })),
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: salesKeys.settings,
    queryFn: async () => unwrap(await supabase.from('app_settings').select('*').maybeSingle()),
  });
}

// --- Écriture ---------------------------------------------------------------
export type ConvertInput = {
  leadId: string; offer: OfferCode; planning: boolean; signedAt: string; activatedAt: string | null;
  monthly?: number | null; setup?: number | null; oneShot?: number | null;
};

export function useConvertLead() {
  const invalidate = useInvalidateSales();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: ConvertInput) =>
      unwrap(
        await supabase.rpc('convert_lead_to_customer', {
          p_lead_id: v.leadId, p_offer_code: v.offer, p_with_planning: v.planning, p_signed_at: v.signedAt,
          p_activated_at: v.activatedAt, p_monthly_price_cents: v.monthly ?? null, p_setup_fee_cents: v.setup ?? null,
          p_one_shot_price_cents: v.oneShot ?? null,
        }),
      ) as string,
    onSuccess: (_d, v) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: leadKeys.lead(v.leadId) });
      void qc.invalidateQueries({ queryKey: leadKeys.timeline(v.leadId) });
    },
  });
}

export function useUpdateSite(contractId: string) {
  const invalidate = useInvalidateSales();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { site_status: SiteStatus; site_url: string | null }) => {
      unwrap(await supabase.from('contracts').update(v).eq('id', contractId).select('id').single());
    },
    onSuccess: () => { invalidate(); void qc.invalidateQueries({ queryKey: salesKeys.contract(contractId) }); },
  });
}

export function useContractAction(contractId: string) {
  const invalidate = useInvalidateSales();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      v: { kind: 'activate'; date: string } | { kind: 'end'; mode: ContractStatus; date: string; reason: string },
    ) => {
      if (v.kind === 'activate') unwrap(await supabase.rpc('activate_contract', { p_contract_id: contractId, p_date: v.date }));
      else unwrap(await supabase.rpc('end_contract', { p_contract_id: contractId, p_mode: v.mode, p_date: v.date, p_reason: v.reason }));
    },
    onSuccess: () => { invalidate(); void qc.invalidateQueries({ queryKey: salesKeys.contract(contractId) }); },
  });
}

export function useSetPaymentStatus() {
  const invalidate = useInvalidateSales();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: PaymentStatus; paidAt?: string | null; method?: string | null; reference?: string | null }) => {
      unwrap(await supabase.rpc('set_payment_status', {
        p_payment_id: v.id, p_status: v.status, p_paid_at: v.paidAt ?? null, p_method: v.method ?? null, p_reference: v.reference ?? null,
      }));
    },
    onSuccess: () => { invalidate(); void qc.invalidateQueries({ queryKey: ['contracts'] }); },
  });
}

export function useGenerateMonthly() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async (month: string) =>
      unwrap(await supabase.rpc('generate_monthly_payments', { p_month: `${month}-01` })) as number,
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCommissions() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async (v: { ids: string[]; status: CommissionStatus; reference?: string; reason?: string }) =>
      unwrap(await supabase.rpc('update_commissions', {
        p_ids: v.ids, p_status: v.status, p_reference: v.reference ?? null, p_reason: v.reason ?? null,
      })) as number,
    onSuccess: () => invalidate(),
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { code: OfferCode; patch: { monthly_price_cents?: number; setup_fee_cents?: number; one_shot_price_cents?: number; commitment_months?: number; is_active?: boolean } }) => {
      unwrap(await supabase.from('offers').update(v.patch).eq('code', v.code).select('code').single());
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: salesKeys.offers }),
  });
}

export function usePublishRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { role: BeneficiaryRole; offer: OfferCode; amount: number; t1: number; t2: number; after: number | null }) =>
      unwrap(await supabase.rpc('publish_commission_rule', {
        p_role: v.role, p_offer: v.offer, p_amount_cents: v.amount, p_tranche1_bps: v.t1, p_tranche2_bps: v.t2, p_after: v.after,
      })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: salesKeys.rules }),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<{
      variable_cost_per_sub_cents: number; fixed_costs_monthly_cents: number; contributions_provision_bps: number;
      creation_hour_cost_cents: number; stale_lead_days: number; project_delivery_days: number; project_link_days: number;
      privacy_policy_url: string | null; contact_email: string | null;
    }>) => {
      unwrap(await supabase.from('app_settings').update(patch).eq('id', true).select('id').single());
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: salesKeys.settings });
      void qc.invalidateQueries({ queryKey: leadKeys.staleDays });
    },
  });
}
