"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function InternalLoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const form = new FormData(event.currentTarget); const result = await createSupabaseBrowserClient().auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) }); setLoading(false); if (result.error) { setError("Não foi possível entrar. Confira e-mail e senha."); return; } router.replace("/interno"); router.refresh(); }
  return <main className="portal-shell internal-login"><section className="card"><p className="eyebrow">Luna Ops · Área restrita</p><h1>Console da clínica</h1><p>Acesso exclusivo para a equipe autorizada.</p><form onSubmit={submit}><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="email" placeholder="voce@clinicaluna.com.br" required /><label htmlFor="password">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required /><button className="button" disabled={loading}>{loading ? "Entrando…" : "Entrar no console"}</button>{error && <p className="field-error" role="alert">{error}</p>}</form></section></main>;
}
