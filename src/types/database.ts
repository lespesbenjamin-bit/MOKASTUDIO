// Types de la base, au format de `supabase gen types typescript`.
// Étape 2 : seules les tables utilisées par l'interface sont décrites.
// Une fois le projet Supabase créé, régénérez le fichier complet :
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type UserRole = 'admin' | 'commercial' | 'apporteur';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          email: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          full_name: string;
          email: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string;
          email?: string;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_app_role: { Args: Record<PropertyKey, never>; Returns: UserRole | null };
      team_directory: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; full_name: string; role: UserRole }[];
      };
    };
    Enums: { user_role: UserRole };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
