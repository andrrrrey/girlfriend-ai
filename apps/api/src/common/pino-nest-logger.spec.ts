import { PinoNestLogger } from "./pino-nest-logger";

describe("PinoNestLogger", () => {
  const pino = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), trace: jest.fn() };
  const logger = new PinoNestLogger(pino as any);

  beforeEach(() => jest.clearAllMocks());

  it("предупреждения сервисов попадают в лог с контекстом (именем класса)", () => {
    logger.warn("telegram update u1 attempt 1 failed: boom", "TelegramUpdatesService");
    expect(pino.warn).toHaveBeenCalledWith({ context: "TelegramUpdatesService" }, "telegram update u1 attempt 1 failed: boom");
  });

  it("ошибка Nest (message, stack, context) — со стеком", () => {
    logger.error("boom", "Error: boom\n    at x", "ExceptionsHandler");
    expect(pino.error).toHaveBeenCalledWith({ context: "ExceptionsHandler", stack: "Error: boom\n    at x" }, "boom");
  });

  it("служебный шум старта Nest (маршруты, модули) — на уровне debug", () => {
    logger.log("Mapped {/chats, GET} route", "RouterExplorer");
    expect(pino.debug).toHaveBeenCalled();
    expect(pino.info).not.toHaveBeenCalled();
  });
});
