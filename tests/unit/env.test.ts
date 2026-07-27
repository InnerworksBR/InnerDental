import { describe, expect, it } from "vitest";
import { getProductionRuntimeEnv, getPublicEnv, getServerEnv } from "@/lib/config/env";

const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
};

describe("configuração de ambiente", () => {
  it("aceita as configurações públicas válidas", () => {
    expect(getPublicEnv(publicEnvironment)).toEqual(publicEnvironment);
  });

  it("rejeita configuração pública incompleta", () => {
    expect(() => getPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: publicEnvironment.NEXT_PUBLIC_SUPABASE_URL })).toThrow();
  });

  it("exige chave secreta apenas no servidor", () => {
    expect(getServerEnv({ ...publicEnvironment, SUPABASE_SECRET_KEY: "server-secret", AUTH_SESSION_SECRET: "a".repeat(32) }).SUPABASE_SECRET_KEY).toBe("server-secret");
    expect(() => getServerEnv(publicEnvironment)).toThrow();
  });

  it("exige borda HTTPS confiável e token de métricas em produção", () => {
    expect(getProductionRuntimeEnv({ NODE_ENV: "production", PORTAL_BASE_URL: "https://agenda.example", TRUST_PROXY: "true", METRICS_TOKEN: "m".repeat(24), SERVICE_NAME: "luna-web" }).TRUST_PROXY).toBe("true");
    expect(() => getProductionRuntimeEnv({ NODE_ENV: "production", PORTAL_BASE_URL: "http://agenda.example", TRUST_PROXY: "true", METRICS_TOKEN: "short", SERVICE_NAME: "luna-web" })).toThrow();
  });
});
