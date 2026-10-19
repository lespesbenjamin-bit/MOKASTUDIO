# Moka Studio Business Hub

CRM, contrats, commissions et prévisionnel pour Moka Studio.
Stack : React · TypeScript · Vite · Tailwind · Supabase · Vercel.

| Étape | Contenu | État |
|---|---|---|
| 1 | Architecture, schéma de données | ✅ livrée |
| 2 | Authentification, profils, permissions (RLS), gestion des utilisateurs | ✅ livrée |
| 3 | CRM, pipeline Kanban, tâches et relances, espace apporteur | ✅ livrée |
| 4 | Clients, contrats, moteur de commissions, paramétrage | ✅ livrée |
| 5 | Tableau de bord, prévisionnel N/N+1/N+2 | ✅ livrée |
| 6 | Tests de bout en bout, exports, mode démo, déploiement final | à venir |

---

## Mise à jour étape 5

Dans le **SQL Editor** de Supabase, exécute `supabase/migrations/20261019001300_dashboard.sql`.

- **Tableau de bord** (admin) : filtres Aujourd'hui / Semaine / Mois / Année / Personnalisée.
  Commercial : prospects, qualifiés, RDV, propositions, contrats, taux de transformation
  (gagnés ÷ clos), ventes par commercial. Financier : CA encaissé, CA signé non encaissé, MRR, ARR,
  abonnements actifs, souscriptions, résiliations, commissions dues / payées, frais fixes et coûts
  variables estimés, trésorerie estimée. Graphiques CA, MRR et contrats sur 12 mois (+ tableau).
- **Finances & prévisionnel** : scénarios prudent / central / ambitieux modifiables et enregistrables,
  tableau N / N+1 / N+2, MRR réel (trait plein) prolongé par la prévision (pointillés),
  comparaison de trésorerie des 3 scénarios. Le prévisionnel part du portefeuille réel.

## Mise à jour étape 4

Dans le **SQL Editor** de Supabase, exécute `supabase/migrations/20261019001200_sales_commissions.sql`.

- **Convertir en client** depuis la fiche prospect : abonnement ou vente directe, option planning,
  dates de signature et d'activation. Les prix du catalogue sont **figés** dans le contrat
  (l'admin peut appliquer un prix négocié). Le prospect passe « Gagné ».
- **Clients & contrats** : liste, fiche contrat (dates, engagement, prochaine échéance, statut du site,
  URL livrée). La mise en ligne du site active automatiquement le contrat.
- **Paiements** (admin) : génération des mensualités du mois (sans doublon), encaissements, retards.
- **Commissions** : créées à la signature, acquises automatiquement (tranche 1 au 1er encaissement,
  tranche 2 à la 3ᵉ mensualité encaissée), facturées / payées par lot avec référence de virement,
  annulées si le contrat est résilié avant acquisition. Une commission payée est définitive.
  Export Excel. Chaque commercial / apporteur ne voit que les siennes.
- **Paramètres** (admin) : tarifs, grille de commissions versionnée, hypothèses de gestion.

## Import de prospects (admin)

Dans le **SQL Editor** de Supabase, exécute `supabase/migrations/20261019001100_import_leads.sql`.

Bouton **Importer** sur la page Prospects (administrateur uniquement) :
1. **Fichier** : Excel (.xlsx) ou CSV (y compris CSV Excel français, séparateur « ; »), 2 000 lignes max.
   Un modèle est téléchargeable.
2. **Colonnes** : reconnaissance automatique des en-têtes courants, modifiable.
3. **Vérification** : simulation complète sans rien écrire — prêtes / doublons (en base ou
   dans le fichier) / erreurs / avertissements. Choix de la source, du commercial et de la 1ʳᵉ relance.
4. **Import** : seules les lignes prêtes sont créées, en « À contacter », avec « Importé depuis… »
   dans l'historique. Rapport CSV téléchargeable.

Nettoyage automatique : 0 initial rétabli sur téléphones et codes postaux (perdu par Excel),
SIRET → SIREN, champs mal formés ignorés avec avertissement. Réimporter le même fichier ne crée aucun doublon.

## Mise à jour étape 3

Dans le **SQL Editor** de Supabase, exécute le fichier
`supabase/migrations/20261019001000_crm.sql` (copier-coller puis **Run**).
Le site se met à jour tout seul via Vercel.

Nouveautés :
- **Prospects** : pipeline Kanban (glisser-déposer, appui long sur mobile) et vue Liste triable,
  recherche, filtres (responsable, source, statut), raccourcis « relances en retard »,
  « sans activité », « à attribuer ».
- **Fiche prospect** : coordonnées modifiables (appel en un clic sur mobile), statut,
  prochaine relance, responsable (admin), notes, tâches, historique complet
  (créations, changements de statut et de responsable écrits automatiquement).
- **Doublons** : SIREN, email ou téléphone identique → création bloquée (l'admin peut forcer
  sauf SIREN) ; même site internet → simple avertissement.
- **Mes relances** : tâches en retard / du jour / de la semaine, prospects à relancer,
  prospects sans activité depuis 14 jours (réglable plus tard dans Paramètres).
- **Espace apporteur** : dépôt d'un prospect et suivi de son statut, sans accès aux autres données.
- Recherche globale en haut de l'écran.

Aucun SMS ni email n'est envoyé automatiquement (prévu pour une version ultérieure).

## Mise en route (étape 2)

Les étapes 1 à 4 se font **une seule fois**, dans le navigateur, sans rien installer.

### 1. Créer la base dans Supabase

1. Ouvre ton projet Supabase, puis **SQL Editor** → **New query**.
2. Copie-colle le contenu de chaque fichier de `supabase/migrations/`,
   **dans l'ordre** (`…000100_types.sql` → `…000900_auth_rls.sql`), puis clique sur **Run** à chaque fois.
   - Si tu avais déjà exécuté les migrations 1 à 8 de l'étape 1, exécute seulement la **0009**.
3. Contrôle : dans **Table Editor**, tu dois voir 19 tables, et un cadenas « RLS enabled » sur chacune.

### 2. Configurer l'authentification

Dans **Authentication** :
- **Sign In / Providers** → Email : laisse « Email » activé, **désactive « Allow new users to sign up »**.
  Seul l'administrateur crée des comptes.
- **URL Configuration** :
  - *Site URL* : l'adresse de l'app (en local `http://localhost:5173`, plus tard l'URL Vercel).
  - *Redirect URLs* : ajoute `http://localhost:5173/**` et, plus tard, `https://<ton-app>.vercel.app/**`.

### 3. Créer ton compte administrateur

1. **Authentication → Users → Add user → Create new user** : ton email + un mot de passe,
   coche « Auto Confirm User ».
2. Dans le **SQL Editor**, exécute (avec ton email) :
   ```sql
   select public.bootstrap_first_admin('ton.email@exemple.fr', 'Benjamin');
   ```
   Cette fonction ne marche qu'une fois, et seulement depuis le SQL Editor.

### 4. Déployer la fonction serveur `admin-users`

Elle sert à inviter, désactiver et réactiver les comptes. C'est la seule partie du système qui détient la clé secrète `service_role`.

**Option A, depuis le navigateur.** Dans Supabase, va dans **Edge Functions → Deploy a new function → Via Editor**.
Nomme-la exactement `admin-users`, colle le contenu de `supabase/functions/admin-users/index.ts`, puis déploie.

**Option B, en ligne de commande.**
```bash
npx supabase login
npx supabase link --project-ref <id-du-projet>
npx supabase functions deploy admin-users
```

Ensuite, dans **Edge Functions → Secrets**, ajoute :
`APP_URL` = `http://localhost:5173` (à remplacer par l'URL Vercel au moment de la mise en ligne).

### 5. Lancer l'application en local (nécessite Node.js 20+)

```bash
npm install
cp .env.example .env.local   # puis colle l'URL et la clé "anon" (Project Settings → API)
npm run dev                  # → http://localhost:5173
```

Connecte-toi avec ton compte admin, puis va dans **Utilisateurs → Inviter**.

---

## Sécurité

- Le navigateur n'a que la clé `anon`, qui est publique. Toute la protection repose sur la base de données :
  - **RLS** : chaque rôle ne voit que ses lignes ;
  - **triggers garde-fous** : un commercial ne peut pas changer un prix, un responsable ou son propre rôle ;
  - **statuts de commission verrouillés** : une commission payée est définitive, ce qui empêche un double paiement.
- Un compte sans profil, ou désactivé, ne voit **aucune** donnée.
- La désactivation bloque aussi la connexion, en suspendant le compte côté Supabase Auth.
- Toutes les modifications sensibles sont écrites dans `audit_logs`, avec leur auteur.

## Tests

```bash
npm run db:test      # schéma (31) + permissions (84) + CRM (40) + import (12) + ventes et commissions (34) + tableau de bord (17) sur PostgreSQL embarqué
npm test             # tests unitaires du front
npm run typecheck
```

Les tests de base de données utilisent PGlite, un vrai PostgreSQL qui tourne en local. Il imite Supabase de la façon la plus stricte possible : le propriétaire des tables n'y bénéficie d'aucun contournement de la RLS.

## Après création du projet Supabase

Pour régénérer les types TypeScript à partir du schéma réel :
```bash
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```
