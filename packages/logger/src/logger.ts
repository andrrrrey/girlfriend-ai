import pino from "pino";

export type LoggerOptions = {
  service: string;
  env: string;
  level?: string;
};

export function createLogger(opts: LoggerOptions) {
  return pino({
    level: opts.level ?? "info",
    base: { service: opts.service, env: opts.env },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}
