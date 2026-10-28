import { isConfigured, supabase } from './supabase';
import { mockAuth } from './mock';

const redirect = (path) => `${window.location.origin}${path}`;

const supabaseAuth = {
  getSession: async () => (await supabase.auth.getSession()).data.session,
  onChange: (fn) => {
    const { data } = supabase.auth.onAuthStateChange(fn);
    return () => data.subscription.unsubscribe();
  },
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  signUp: async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirect('/') },
    });
    if (error) throw error;
    // With "Confirm email" on, Supabase returns no session until the link is clicked
    return { needsConfirmation: !data.session };
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect('/reset-password') });
    if (error) throw error;
  },
  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },
  profile: async (id) => {
    const { data } = await supabase.from('profiles').select('id, display_name, email, upi_id').eq('id', id).maybeSingle();
    return data;
  },
};

export const isDemo = !isConfigured;
export const auth = isConfigured ? supabaseAuth : mockAuth;
export { mockAuth };
