import { z } from "zod";

const EnvSchema = z.object({
  ENV: z.string().default("development"),

  WEB_PORT: z.coerce.number().default(3000),
  API_PORT: z.coerce.number().default(8080),
  AI_PORT: z.coerce.number().default(8081),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  CLICKHOUSE_URL: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  JWT_SECRET: z.string(),
  JWT_TTL_SECONDS: z.coerce.number().default(604800),

  LOG_LEVEL: z.string().default("info"),
  LOG_FORMAT: z.string().default("json"),

  REQUEST_ID_HEADER: z.string().default("x-request-id"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(overrides?: Record<string, string | undefined>): AppEnv {
  const data = { ...process.env, ...(overrides ?? {}) };
  return EnvSchema.parse(data);
}
