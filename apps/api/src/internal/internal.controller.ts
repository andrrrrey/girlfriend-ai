import { Controller, Get, Param } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Controller("internal")
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("settings")
  async getAllSettings() {
    const settings = await this.prisma.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  }

  @Get("settings/:key")
  async getSetting(@Param("key") key: string) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    return { key, value: setting?.value ?? null };
  }

  @Get("characters/:id")
  async getCharacter(@Param("id") id: string) {
    return this.prisma.character.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        systemPrompt: true,
        personality: true,
        voiceId: true,
      },
    });
  }
}
