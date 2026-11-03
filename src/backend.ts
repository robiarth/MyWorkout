import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { authStorage, remove } from "./storage";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const backend =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
export const localDemo =
  __DEV__ && process.env.EXPO_PUBLIC_LOCAL_DEMO === "true" && !backend;
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!backend) throw new Error("Supabase non configuré.");
  const { data, error } = await backend
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(12000));
  if (error) throw new Error(error.message);
  return data as T;
}
export async function signOut() {
  if (!backend) return;
  await remove("last-account");
  const { error } = await backend.auth.signOut({ scope: "local" });
  if (error) throw error;
}
