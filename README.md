# Moka Studio Business Hub

CRM, contrats, commissions et prévisionnel pour Moka Studio.
Stack : React · TypeScript · Vite · Tailwind · Supabase · Vercel.

| Étape | Contenu | État |
|---|---|---|
| 1 | Architecture, schéma de données | ✅ livrée |
| 2 | Authentification, profils, permissions (RLS), gestion des utilisateurs | ✅ livrée |
| 3 | CRM, pipeline Kanban, tâches et relances, espace apporteur | ✅ livrée |
| 4 | Clients, contrats, moteur de commissions, paramétrage | à venir |
| 5 | Tableau de bord, prévisionnel N/N+1/N+2 | à venir |
| 6 | Tests de bout en bout, exports, mode démo, déploiement final | à venir |

---

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
npm run db:test      # schéma (31) + permissions par rôle (84) + CRM (40) sur PostgreSQL embarqué
npm test             # tests unitaires du front
npm run typecheck
```

Les tests de base de données utilisent PGlite, un vrai PostgreSQL qui tourne en local. Il imite Supabase de la façon la plus stricte possible : le propriétaire des tables n'y bénéficie d'aucun contournement de la RLS.

## Après création du projet Supabase

Pour régénérer les types TypeScript à partir du schéma réel :
```bash
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```
