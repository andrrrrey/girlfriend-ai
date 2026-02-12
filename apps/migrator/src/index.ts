import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { Client } from "pg";
import { spawn } from "child_process";

const env = loadEnv();
const logger = createLogger({ service: "migrator", env: env.ENV, level: env.LOG_LEVEL });

async function run(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function main() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  // advisory lock to prevent concurrent migrate runs
  await client.query("SELECT pg_advisory_lock(987654321);");

  try {
    logger.info({}, "prisma_migrate_deploy_start");
    // run prisma migrate deploy in apps/api (where prisma folder lives)
    await run("npx", ["prisma", "migrate", "deploy"], process.cwd() + "/apps/api");
    logger.info({}, "prisma_migrate_deploy_done");
  } finally {
    await client.query("SELECT pg_advisory_unlock(987654321);");
    await client.end();
  }
}

main().catch((err) => {
  logger.error({ err }, "migrations_failed");
  process.exit(1);
});
