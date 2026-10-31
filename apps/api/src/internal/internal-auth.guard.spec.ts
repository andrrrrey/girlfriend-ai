import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { InternalAuthGuard } from "./internal-auth.guard";

const mockEnv: { ENV: string; INTERNAL_API_TOKEN?: string } = { ENV: "production" };

jest.mock("@repo/config", () => ({
  INTERNAL_TOKEN_HEADER: "x-internal-token",
  loadEnv: () => mockEnv,
}));

function contextWith(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe("InternalAuthGuard", () => {
  beforeEach(() => {
    mockEnv.ENV = "production";
    mockEnv.INTERNAL_API_TOKEN = "secret";
  });

  it("пропускает запрос с верным токеном", () => {
    expect(new InternalAuthGuard().canActivate(contextWith({ "x-internal-token": "secret" }))).toBe(true);
  });

  it.each([
    ["неверный токен", { "x-internal-token": "wrong" }],
    ["отсутствующий токен", {}],
    ["повторяющийся заголовок", { "x-internal-token": ["secret", "secret"] }],
  ])("отклоняет: %s", (_name, headers) => {
    expect(() => new InternalAuthGuard().canActivate(contextWith(headers))).toThrow(UnauthorizedException);
  });

  it("в production без настроенного токена закрыт", () => {
    mockEnv.INTERNAL_API_TOKEN = undefined;
    expect(() => new InternalAuthGuard().canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it("в неизвестной среде без настроенного токена закрыт", () => {
    mockEnv.ENV = "staging";
    mockEnv.INTERNAL_API_TOKEN = undefined;
    expect(() => new InternalAuthGuard().canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it.each(["development", "test"])("при ENV=%s без настроенного токена открыт", (env) => {
    mockEnv.ENV = env;
    mockEnv.INTERNAL_API_TOKEN = undefined;
    expect(new InternalAuthGuard().canActivate(contextWith({}))).toBe(true);
  });

  it("при ENV=development настроенный токен всё равно проверяется", () => {
    mockEnv.ENV = "development";
    expect(() => new InternalAuthGuard().canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });
});
