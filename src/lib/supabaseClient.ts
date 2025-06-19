let createClient: any;
try {
  ({ createClient } = await import('@supabase/supabase-js'));
} catch {
  createClient = undefined;
}

const supabaseUrl = import.meta.env.SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  createClient && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : {
        from() {
          return {
            select: async () => ({ data: null, error: new Error('supabase client not configured') }),
            insert: async () => ({ data: null, error: new Error('supabase client not configured') })
          };
        }
      };
