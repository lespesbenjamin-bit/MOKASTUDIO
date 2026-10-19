-- =============================================================================
-- CONTRÔLE DE SÉCURITÉ — à exécuter dans le SQL Editor de Supabase
--
-- Crée des utilisateurs et des données de TEST, vérifie les permissions en se
-- faisant passer pour chaque rôle, puis ANNULE TOUT.
-- Le résultat s'affiche volontairement comme une « erreur » : c'est le moyen
-- d'annuler toutes les écritures de test. Lisez le message :
--   « CONTRÔLE TERMINÉ — n/n OK »  → tout va bien
--   « … ÉCHECS : … »                → envoyez le message au développeur
-- Rien n'est enregistré dans votre base.
-- =============================================================================
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_com1  uuid := gen_random_uuid();
  v_com2  uuid := gen_random_uuid();
  v_app   uuid := gen_random_uuid();
  v_off   uuid := gen_random_uuid();
  v_co1 uuid; v_co2 uuid; v_l1 uuid; v_l2 uuid; v_k uuid; v_cu uuid; v_p uuid; v_tok text; v_txt text;
  n bigint;
  ok integer := 0;
  total integer := 0;
  failures text := '';

begin
  -- Données de test -----------------------------------------------------------
  insert into auth.users (id, email) values
    (v_admin, 'test-admin@controle.invalid'), (v_com1, 'test-c1@controle.invalid'), (v_com2, 'test-c2@controle.invalid'),
    (v_app, 'test-app@controle.invalid'), (v_off, 'test-off@controle.invalid');
  insert into public.profiles (id, role, full_name, email, is_active) values
    (v_admin, 'admin', 'Test admin', 'test-admin@controle.invalid', true),
    (v_com1, 'commercial', 'Test C1', 'test-c1@controle.invalid', true),
    (v_com2, 'commercial', 'Test C2', 'test-c2@controle.invalid', true),
    (v_app, 'apporteur', 'Test apporteur', 'test-app@controle.invalid', true),
    (v_off, 'commercial', 'Test désactivé', 'test-off@controle.invalid', false);
  insert into public.companies (name, created_by) values ('Test A', v_com1) returning id into v_co1;
  insert into public.companies (name, created_by) values ('Test B', v_com2) returning id into v_co2;
  insert into public.leads (company_id, owner_id, referrer_id, created_by) values (v_co1, v_com1, v_app, v_com1) returning id into v_l1;
  insert into public.leads (company_id, owner_id, created_by) values (v_co2, v_com2, v_com2) returning id into v_l2;

  -- Chaque contrôle : se faire passer pour un utilisateur, compter, revenir --------
  -- (macro manuelle : set_config + set local role, exécuté dans un sous-bloc)

  -- 1. Anonyme : aucune donnée
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    execute 'select count(*) from public.leads' into n;
    execute 'reset role';
  exception when others then execute 'reset role'; n := 0;
  end;
  if n = 0 then ok := ok + 1; else failures := failures || ' | anonyme voit des prospects'; end if;

  -- 2. Commercial 1 : voit son prospect seulement
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_com1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_com1::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.leads' into n;
  execute 'reset role';
  if n = 1 then ok := ok + 1; else failures := failures || ' | commercial voit ' || n || ' prospects au lieu de 1'; end if;

  -- 3. Commercial 1 ne peut pas modifier le prospect du commercial 2
  total := total + 1;
  execute 'set local role authenticated';
  execute format('with u as (update public.leads set notes = %L where id = %L returning 1) select count(*) from u', 'x', v_l2) into n;
  execute 'reset role';
  if n = 0 then ok := ok + 1; else failures := failures || ' | commercial modifie le prospect d''un collègue'; end if;

  -- 4. Commercial 1 ne peut pas se donner le rôle admin
  total := total + 1;
  begin
    execute 'set local role authenticated';
    execute format('update public.profiles set role = %L where id = %L', 'admin', v_com1);
    execute 'reset role';
    failures := failures || ' | commercial a pu changer son rôle';
  exception when others then
    execute 'reset role'; ok := ok + 1;
  end;

  -- 5. Commercial 1 ne peut pas transférer son prospect
  total := total + 1;
  begin
    execute 'set local role authenticated';
    execute format('update public.leads set owner_id = %L where id = %L', v_com2, v_l1);
    execute 'reset role';
    failures := failures || ' | commercial a pu transférer un prospect';
  exception when others then
    execute 'reset role'; ok := ok + 1;
  end;

  -- 6. Commercial : catalogue en lecture seule
  total := total + 1;
  execute 'set local role authenticated';
  execute 'with u as (update public.offers set monthly_price_cents = 1 returning 1) select count(*) from u' into n;
  execute 'reset role';
  if n = 0 then ok := ok + 1; else failures := failures || ' | commercial modifie les tarifs'; end if;

  -- 7. Commercial : pas d'accès au tableau de bord financier
  total := total + 1;
  begin
    execute 'set local role authenticated';
    execute 'select public.dashboard_kpis(current_date, current_date)';
    execute 'reset role';
    failures := failures || ' | commercial lit le tableau de bord';
  exception when others then
    execute 'reset role'; ok := ok + 1;
  end;

  -- 8. Commercial : pas d'accès au journal d'audit
  total := total + 1;
  execute 'set local role authenticated';
  execute 'select count(*) from public.audit_logs' into n;
  execute 'reset role';
  if n = 0 then ok := ok + 1; else failures := failures || ' | commercial lit le journal d''audit'; end if;

  -- 9. Apporteur : aucun prospect en accès direct, mais voit ses prospects transmis
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_app, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_app::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.leads' into n;
  execute 'reset role';
  if n = 0 then ok := ok + 1; else failures := failures || ' | apporteur voit la table des prospects'; end if;

  total := total + 1;
  execute 'set local role authenticated';
  execute 'select count(*) from public.my_referrals()' into n;
  execute 'reset role';
  if n = 1 then ok := ok + 1; else failures := failures || ' | apporteur ne voit pas son prospect transmis'; end if;

  -- 10. Compte désactivé : aucune donnée
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_off, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_off::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.offers' into n;
  execute 'reset role';
  if n = 0 then ok := ok + 1; else failures := failures || ' | compte désactivé voit des données'; end if;

  -- 11. Admin : voit tout
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from public.leads where id in (%L, %L)', v_l1, v_l2) into n;
  execute 'reset role';
  if n = 2 then ok := ok + 1; else failures := failures || ' | admin ne voit pas tous les prospects'; end if;

  -- 12. Commission payée : définitive, même pour l'admin
  total := total + 1;
  execute 'set local role authenticated';
  v_k := public.convert_lead_to_customer(v_l1, 'vente_directe');
  execute 'reset role';
  update public.payments set status = 'encaisse' where contract_id = v_k;
  update public.commissions set status = 'payee', paid_at = now(), payout_ref = 'TEST' where contract_id = v_k and beneficiary_role = 'commercial';
  begin
    update public.commissions set payout_ref = 'TEST-BIS', paid_at = now() where contract_id = v_k and beneficiary_role = 'commercial';
    failures := failures || ' | commission payée modifiable';
  exception when others then ok := ok + 1;
  end;

  -- 13. Projets clients : cloisonnement et lien client
  perform set_config('request.jwt.claims', json_build_object('sub', v_com1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_com1::text, true);
  execute 'set local role authenticated';
  execute format('select public.create_client_project(%L)', v_k) into v_p;
  execute format('select public.create_project_link(%L) ->> %L', v_p, 'token') into v_tok;
  execute 'reset role';

  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_com2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_com2::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.client_projects' into n;
  execute 'reset role';
  if n = 0 then ok := ok + 1; else failures := failures || ' | commercial voit le projet d''un collègue'; end if;

  total := total + 1;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  execute format('select public.portal_open(%L) #>> %L', v_tok, '{project,company_name}') into v_txt;
  execute 'reset role';
  if v_txt = 'Test A' then ok := ok + 1; else failures := failures || ' | le lien client n''ouvre pas son projet'; end if;

  total := total + 1;
  begin
    execute 'set local role anon';
    execute format('select public.portal_open(%L)', repeat('0', 64));
    execute 'reset role';
    failures := failures || ' | un faux lien client est accepté';
  exception when others then
    execute 'reset role'; ok := ok + 1;
  end;

  total := total + 1;
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.project_questionnaires' into n;
    execute 'reset role';
    failures := failures || ' | anonyme lit les questionnaires';
  exception when others then
    execute 'reset role'; ok := ok + 1;
  end;

  -- 14. Structure : RLS active partout, rien d'ouvert aux anonymes
  total := total + 1;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n = 0 then ok := ok + 1; else failures := failures || ' | ' || n || ' table(s) sans RLS'; end if;

  total := total + 1;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'v') and has_table_privilege('anon', c.oid, 'select');
  if n = 0 then ok := ok + 1; else failures := failures || ' | ' || n || ' table(s) lisibles par anonyme'; end if;

  -- 15. Fonction d'amorçage admin non appelable depuis l'application
  total := total + 1;
  if not has_function_privilege('authenticated', 'public.bootstrap_first_admin(text, text)', 'execute') then ok := ok + 1;
  else failures := failures || ' | bootstrap_first_admin appelable'; end if;

  raise exception '%',
    case when ok = total
      then format('✅ CONTRÔLE TERMINÉ — %s/%s OK. (Affiché comme une erreur pour tout annuler : rien n''a été enregistré.)', ok, total)
      else format('❌ CONTRÔLE TERMINÉ — %s/%s OK. ÉCHECS :%s (rien n''a été enregistré)', ok, total, failures)
    end;
end
$$;
