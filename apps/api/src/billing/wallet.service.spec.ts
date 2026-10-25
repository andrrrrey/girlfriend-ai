import { InsufficientCreditsException, WalletService } from "./wallet.service";

/** Текст SQL из tagged-template вызова $queryRaw. */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join("?");
}

describe("WalletService", () => {
  let prisma: any;
  let config: any;
  let reservationRow: any;
  let walletAfter: { balance: number; reserved: number };
  let wallet: WalletService;

  beforeEach(() => {
    reservationRow = null;
    walletAfter = { balance: 100, reserved: 0 };
    prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: "w-1", balance: 100, reserved: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "w-1", balance: 3, reserved: 1 }),
        create: jest.fn(),
      },
      creditReservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ledgerEntry: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn(async (...args: unknown[]) => {
        const sql = sqlOf(args);
        if (sql.includes('FROM "credit_reservations"')) return reservationRow ? [reservationRow] : [];
        if (sql.includes('UPDATE "wallets"')) return [{ id: "w-1", ...walletAfter }];
        return [];
      }),
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
    config = { isEnforced: jest.fn().mockResolvedValue(true), welcomeBonus: jest.fn().mockResolvedValue(100) };
    wallet = new WalletService(prisma, config, { quote: jest.fn() } as any, { scheduleInterval: jest.fn() } as any);
  });

  describe("reserve", () => {
    it("бесплатная операция не создаёт резерв", async () => {
      expect(await wallet.reserve({ userId: "u", operationKey: "k", operation: "chat_greeting", amount: 0 })).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("резервирует сумму и пишет запись журнала", async () => {
      walletAfter = { balance: 100, reserved: 5 };
      const handle = await wallet.reserve({ userId: "u", operationKey: "k", operation: "image", amount: 5 });

      expect(handle).toEqual({ operationKey: "k", amount: 5, priceVersion: undefined });
      expect(prisma.creditReservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ walletId: "w-1", operationKey: "k", amount: 5, operation: "image" }),
      });
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "reserve", reservedDelta: 5, reservedAfter: 5, operationKey: "reserve:k" }),
      });
    });

    it("при включённой блокировке и нехватке баланса операция не стартует (402)", async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]); // UPDATE … WHERE balance - reserved >= amount не прошёл

      await expect(
        wallet.reserve({ userId: "u", operationKey: "k", operation: "video", amount: 30 }),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);
      expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    });

    it("повтор с тем же ключом возвращает существующий резерв без второго удержания", async () => {
      prisma.creditReservation.findUnique.mockResolvedValue({ operationKey: "k", amount: 5, priceVersion: 2 });

      const handle = await wallet.reserve({ userId: "u", operationKey: "k", operation: "image", amount: 5 });

      expect(handle).toEqual({ operationKey: "k", amount: 5, priceVersion: 2 });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("существующему пользователю без кошелька создаёт кошелёк со стартовым бонусом", async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "w-1", balance: 0, reserved: 0 });
      await wallet.reserve({ userId: "u", operationKey: "k", operation: "image", amount: 5 });

      expect(prisma.wallet.create).toHaveBeenCalledWith({ data: { ownerUserId: "u" } });
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "bonus", balanceDelta: 100, operationKey: "bonus:welcome:u" }),
      });
    });
  });

  describe("capture / release", () => {
    it("списывает удержанный резерв: баланс −сумма, резерв −сумма", async () => {
      reservationRow = { id: "r-1", walletId: "w-1", amount: 5, capturedAmount: null, status: "held", aiJobId: "j-1" };
      walletAfter = { balance: 95, reserved: 0 };

      expect(await wallet.capture("k")).toBe(true);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "capture", balanceDelta: -5, reservedDelta: -5, operationKey: "capture:k" }),
      });
      expect(prisma.creditReservation.update).toHaveBeenCalledWith({
        where: { id: "r-1" },
        data: expect.objectContaining({ status: "captured", capturedAmount: 5 }),
      });
    });

    it("повторное списание ничего не делает (нет двойного списания)", async () => {
      reservationRow = { id: "r-1", walletId: "w-1", amount: 5, capturedAmount: 5, status: "captured", aiJobId: null };
      expect(await wallet.capture("k")).toBe(false);
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it("успех после возврата резерва (ретрай воркера) списывает без резерва", async () => {
      reservationRow = { id: "r-1", walletId: "w-1", amount: 5, capturedAmount: null, status: "released", aiJobId: null };
      expect(await wallet.capture("k")).toBe(true);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ balanceDelta: -5, reservedDelta: 0, meta: { lateCapture: true } }),
      });
    });

    it("при ошибке резерв возвращается; уже списанный — не трогается", async () => {
      reservationRow = { id: "r-1", walletId: "w-1", amount: 5, capturedAmount: null, status: "held", aiJobId: null };
      expect(await wallet.release("k", "generation_failed")).toBe(true);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "release", reservedDelta: -5, reason: "generation_failed" }),
      });

      prisma.ledgerEntry.create.mockClear();
      reservationRow = { ...reservationRow, status: "captured" };
      expect(await wallet.release("k", "late")).toBe(false);
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it("неизвестный ключ — ничего не делает", async () => {
      expect(await wallet.capture("missing")).toBe(false);
      expect(await wallet.release("missing", "x")).toBe(false);
    });
  });
});
