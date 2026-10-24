jest.mock("@repo/config", () => ({
  loadEnv: () => ({ SECRETS_ENC_KEY: Buffer.alloc(32, 7).toString("base64") }),
}));

import { CryptoService, parseEncryptionKey } from "./crypto.service";

describe("CryptoService", () => {
  const crypto = new CryptoService();

  it("шифрует и расшифровывает строку", () => {
    const enc = crypto.encrypt("123456:ABC-bot-token");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("ABC-bot-token");
    expect(crypto.decrypt(enc)).toBe("123456:ABC-bot-token");
  });

  it("одинаковый текст даёт разный шифротекст (случайный IV)", () => {
    expect(crypto.encrypt("same")).not.toBe(crypto.encrypt("same"));
  });

  it("обнаруживает подмену шифротекста", () => {
    const [v, iv, tag, data] = crypto.encrypt("secret").split(":");
    const tampered = Buffer.from(data, "base64");
    tampered[0] ^= 1;
    expect(() => crypto.decrypt([v, iv, tag, tampered.toString("base64")].join(":"))).toThrow();
  });

  it("принимает ключ в hex и отклоняет ключ неверной длины", () => {
    expect(parseEncryptionKey("ab".repeat(32))).toHaveLength(32);
    expect(() => parseEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow();
  });
});
