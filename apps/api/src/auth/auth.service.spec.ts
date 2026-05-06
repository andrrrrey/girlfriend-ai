import { Test } from "@nestjs/testing";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma.service";

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue("test_access_token"),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe("register", () => {
    it("hashes password and returns verification message", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: "user-1" });

      const result = await service.register("test@example.com", "password123");

      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      const hash = createCall.data.passwordHash;
      expect(typeof hash).toBe("string");
      expect(await bcrypt.compare("password123", hash)).toBe(true);
    });

    it("throws ConflictException if email already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

      await expect(
        service.register("taken@example.com", "password123"),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login", () => {
    it("throws UnauthorizedException for wrong password", async () => {
      const hash = await bcrypt.hash("correct_password", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: hash,
        deletedAt: null,
      });

      await expect(
        service.login("user@example.com", "wrong_password"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException for non-existent user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login("nobody@example.com", "password123"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("returns token pair on successful login", async () => {
      const hash = await bcrypt.hash("correct_password", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: hash,
        deletedAt: null,
      });
      mockPrisma.session.create.mockResolvedValue({
        refreshToken: "refresh-uuid",
      });

      const result = await service.login("user@example.com", "correct_password");

      expect(result.accessToken).toBe("test_access_token");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });
  });
});
