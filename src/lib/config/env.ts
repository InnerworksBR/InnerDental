import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1),
  AUTH_SESSION_SECRET: z.string().min(32),
});

const productionRuntimeSchema = z.object({
  NODE_ENV: z.literal("production"),
  PORTAL_BASE_URL: z.url().refine((value) => value.startsWith("https://"), "PORTAL_BASE_URL must use HTTPS"),
  TRUST_PROXY: z.literal("true"),
  METRICS_TOKEN: z.string().min(24),
  SERVICE_NAME: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ProductionRuntimeEnv = z.infer<typeof productionRuntimeSchema>;
type PublicEnvironment = Partial<Record<"NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", string | undefined>>;

export function getPublicEnv(environment?: PublicEnvironment): PublicEnv {
  return publicEnvSchema.parse(environment ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnv(environment: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(environment);
}

export function getProductionRuntimeEnv(environment: NodeJS.ProcessEnv = process.env): ProductionRuntimeEnv {
  return productionRuntimeSchema.parse(environment);
}
