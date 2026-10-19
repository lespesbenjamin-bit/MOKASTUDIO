# Moka Studio Business Hub

CRM, contrats, commissions, tableau de bord et prévisionnel pour Moka Studio.
Stack : React · TypeScript · Vite · Tailwind · Supabase (PostgreSQL, Auth, Edge Functions) · Recharts · Vercel.

| Étape | Contenu | État |
|---|---|---|
| 1 | Architecture, schéma de données | ✅ |
| 2 | Authentification, rôles, permissions (RLS), gestion des utilisateurs | ✅ |
| 3 | CRM, pipeline Kanban, tâches et relances, espace apporteur + import Excel/CSV | ✅ |
| 4 | Clients, contrats, paiements, moteur de commissions, paramètres | ✅ |
| 5 | Tableau de bord, prévisionnel N / N+1 / N+2 | ✅ |
| 6 | Mode démonstration, exports et sauvegarde, tests finaux, déploiement | ✅ |

---

## 1. Installation complète (à faire une fois)

Tout se fait dans le navigateur ; aucun logiciel n'est nécessaire sur votre ordinateur.

### 1.1 Base de données (Supabase)

1. Créez un projet Supabase (région Europe).
2. **SQL Editor → New query** : exécutez les fichiers de `supabase/migrations/` **dans l'ordre**,
   un par un (copier-coller puis **Run**) :

   | Fichier | Contenu |
   |---|---|
   | `…000100_types.sql` → `…000800_reference_data.sql` | Schéma, tarifs, grille, scénarios |
   | `…000900_auth_rls.sql` | Rôles et permissions |
   | `…001000_crm.sql` | Prospects, historique, doublons, relances |
   | `…001100_import_leads.sql` | Import de fichiers |
   | `…001200_sales_commissions.sql` | Contrats, paiements, commissions |
   | `…001300_dashboard.sql` | Tableau de bord |

3. **Contrôle de sécurité** : exécutez `supabase/tests/controle-securite.sql` dans le SQL Editor.
   Le résultat s'affiche en rouge **volontairement** (c'est ce qui annule les données de test) :
   le message doit indiquer **« ✅ CONTRÔLE TERMINÉ — 16/16 OK »**.

### 1.2 Authentification

**Authentication** :
- *Sign In / Providers → Email* : désactivez **Allow new users to sign up** (seul l'admin crée des comptes).
- *URL Configuration* : **Site URL** = l'adresse du site (ex. `https://www.mokacrm.app`) ;
  **Redirect URLs** : ajoutez `https://www.mokacrm.app/**` et `https://<projet>.vercel.app/**`.

### 1.3 Premier administrateur

1. **Authentication → Users → Add user → Create new user** (cochez *Auto Confirm User*).
2. SQL Editor : `select public.bootstrap_first_admin('votre.email@exemple.fr', 'Benjamin');`

### 1.4 Fonction serveur `admin-users` (invitations, désactivation)

**Edge Functions → Deploy a new function → Via Editor**, nom `admin-users`, contenu de
`supabase/functions/admin-users/index.ts`. Puis **Edge Functions → Secrets** :
`APP_URL` = l'adresse du site, sans `/` final.

### 1.5 Site (Vercel)

1. Le code est sur GitHub (dépôt **MOKASTUDIO**). Sur Vercel : **Add New → Project** → importer le dépôt.
2. **Environment Variables** :
   - `VITE_SUPABASE_URL` = `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = clé *publishable* / *anon* (jamais la clé *secret* / *service_role*).
3. **Deploy**. Chaque envoi sur GitHub redéploie automatiquement.

### 1.6 Domaine personnalisé (www.mokacrm.app)

Vercel → **Settings → Domains** → ajouter le domaine, puis chez le fournisseur du domaine (zone DNS) :
enregistrement **A** `@` et **CNAME** `www` avec les valeurs indiquées par Vercel (« View DNS configuration »).
Une fois actif, mettez à jour *Site URL*, *Redirect URLs* et le secret `APP_URL`.

### 1.7 Emails (recommandé avant d'inviter l'équipe)

Le service d'email intégré de Supabase est limité à quelques envois par heure.
Branchez un service d'envoi (Resend, Brevo…) dans **Authentication → Emails → SMTP Settings**.
Pensez aussi à traduire les modèles d'emails (invitation, mot de passe oublié) dans **Email Templates**.

### 1.8 Sauvegardes

- **Paramètres → Sauvegarde et exports** : sauvegarde complète (JSON) et exports Excel. À faire régulièrement.
- Les sauvegardes automatiques quotidiennes de Supabase sont incluses dans les offres payantes.

---

## 2. Utilisation

| Rôle | Accès |
|---|---|
| **Administrateur** | Tout : tableau de bord, prospects (attribution, import), clients, paiements, commissions (validation, paiement), prévisionnel, paramètres, utilisateurs, sauvegarde |
| **Commercial** | Ses prospects, relances, clients et contrats (statut du site), ses commissions |
| **Apporteur** | Dépôt de prospects, suivi de leur statut, ses commissions |

**Mode démonstration** : ouvrez `/demo` (lien en bas de la page de connexion). Données fictives,
bandeau permanent, choix du rôle affiché, aucune écriture possible, aucune connexion à la base.
Idéal pour présenter l'outil à un futur commercial ou apporteur.

Cycle de vente :
1. Prospect créé (saisie, import ou apporteur) → pipeline jusqu'à « Négociation ».
2. **Convertir en client** → contrat aux prix du catalogue figés, commissions prévisionnelles créées.
3. **Paiements** → générer les mensualités du mois, enregistrer les encaissements.
4. Les commissions deviennent **acquises** automatiquement (1er encaissement, puis 3ᵉ mensualité),
   puis **facturées / payées** par lot depuis **Commissions** (référence de virement obligatoire).

Règles de gestion clés : montants en centimes ; CA encaissé, CA signé et MRR jamais additionnés ;
grille de commissions versionnée (aucun recalcul rétroactif) ; commission payée définitive ;
provision de cotisations = estimation, pas un calcul fiscal ; toutes les opérations sensibles
sont journalisées (`audit_logs`).

---

## 3. Développement

```bash
npm install
cp .env.example .env.local   # URL + clé anon
npm run dev                  # http://localhost:5173
```

### Tests

| Commande | Ce qui est vérifié |
|---|---|
| `npm test` | Unitaires : montants, dates, import, moteur prévisionnel (38) |
| `npm run db:test` | PostgreSQL embarqué : schéma (31), permissions par rôle (84), CRM (40), import (12), ventes & commissions (34), tableau de bord (17), script de contrôle Supabase |
| `npm run test:e2e` | Navigateur réel sur le mode démo : toutes les pages × 3 rôles, accès refusés, écritures bloquées (32) — après `npm run build` |
| `npm run test:all` | Tout ce qui précède |

Les tests de base utilisent un PostgreSQL embarqué (PGlite) qui imite Supabase dans sa configuration
la plus stricte. GitHub Actions (`.github/workflows/ci.yml`) les relance à chaque envoi.

Après création du projet Supabase, les types peuvent être régénérés :
`npx supabase gen types typescript --project-id <id> > src/types/database.ts`

### Arborescence

```
supabase/migrations/   13 migrations versionnées (schéma, RLS, fonctions)
supabase/functions/    admin-users (seul code utilisant la clé service_role)
supabase/tests/        controle-securite.sql (à lancer dans Supabase)
scripts/               tests base de données et bout en bout
src/features/          auth, leads, tasks, import, referrer, sales, finance, settings
src/demo/              faux serveur et données fictives du mode démonstration
docs/ARCHITECTURE.md   architecture, schéma, règles d'accès
```

---

## 4. Limites connues de la V1

- Aucun SMS ni email envoyé automatiquement (prévu : connecteurs).
- Stripe non branché : les encaissements se saisissent à la main (champ « référence » prêt pour Stripe).
- Les tables `expenses` (dépenses réelles) et `objectives` (objectifs) existent mais n'ont pas encore d'écran.
- Le prévisionnel fait renouveler le portefeuille existant 12 mois après le départ (approximation).
