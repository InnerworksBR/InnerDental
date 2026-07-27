"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AdminSessionActions() {
  const router = useRouter();
  async function logout() { await createSupabaseBrowserClient().auth.signOut(); router.replace("/interno/login"); router.refresh(); }
  return <button className="text-button" onClick={() => void logout()}>Sair</button>;
}
