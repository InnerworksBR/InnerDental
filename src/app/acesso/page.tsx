"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";

const phoneSchema = z.object({ phone: z.string().min(10, "Informe um telefone válido.") });
const codeSchema = phoneSchema.extend({ code: z.string().regex(/^\d{6}$/, "Informe o código de 6 dígitos.") });
type AccessFields = z.infer<typeof codeSchema>;

export default function AccessPage() {
  const router = useRouter();
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [validatingLink, setValidatingLink] = useState(false);
  const linkAttempted = useRef(false);
  const { register, handleSubmit, formState: { errors, isSubmitting }, getValues } = useForm<AccessFields>();

  useEffect(() => {
    if (linkAttempted.current) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) return;

    linkAttempted.current = true;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    void (async () => {
      setValidatingLink(true);
      setMessage("Validando seu acesso seguro…");
      try {
        const response = await fetch("/api/auth/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          setMessage(response.status === 401
            ? "Link inválido ou expirado. Solicite um novo link pelo WhatsApp."
            : "Não foi possível validar o link agora. Tente novamente.");
          return;
        }
        router.replace("/agenda");
        router.refresh();
      } catch {
        setMessage("Não foi possível validar o link agora. Verifique sua conexão e tente novamente.");
      } finally {
        setValidatingLink(false);
      }
    })();
  }, [router]);

  async function requestCode() { const phone = getValues("phone"); const parsed = phoneSchema.safeParse({ phone }); if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; } await fetch("/api/auth/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }); setRequested(true); setMessage("Código enviado! Se o número puder receber mensagens, ele chega em instantes."); }
  async function verify(values: AccessFields) { const parsed = codeSchema.safeParse(values); if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; } const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); if (!response.ok) { setMessage("Código inválido ou expirado. Solicite um novo código."); return; } router.push("/agenda"); }
  const busy = isSubmitting || validatingLink;
  return <PortalShell showHeader={false}><section className="card access-card"><Link href="/" className="back-link">‹ Voltar</Link><p className="eyebrow">Acesso seguro</p><h1>Gerencie sua consulta</h1><p>Informe seu telefone e receba um código de 6 dígitos no WhatsApp. Não usamos senha.</p><form onSubmit={handleSubmit(verify)} noValidate><label htmlFor="phone">Telefone</label><input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" disabled={validatingLink} {...register("phone", { required: "Informe seu telefone." })} />{errors.phone && <p className="field-error">{errors.phone.message}</p>}{requested && <><label htmlFor="code">Código de 6 dígitos</label><input className="code-input" id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" disabled={validatingLink} {...register("code", { required: "Informe o código." })} />{errors.code && <p className="field-error">{errors.code.message}</p>}</>}<div className="actions"><button type="button" className={requested ? "text-button" : "button"} onClick={requestCode} disabled={busy}>{requested ? "Reenviar código" : "Enviar código"}</button>{requested && <button className="button" disabled={busy}>{isSubmitting ? "Verificando…" : "Continuar"}</button>}</div></form>{message && <p className="notice" role="status">{message}</p>}</section></PortalShell>;
}
