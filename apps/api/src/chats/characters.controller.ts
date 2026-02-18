import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma.service";

@Controller("characters")
@UseGuards(JwtAuthGuard)
export class CharactersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listPublic() {
    return this.prisma.character.findMany({
      where: { isPublic: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tags: true,
        personality: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.prisma.character.findFirst({
      where: { id, isPublic: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tags: true,
        personality: true,
      },
    });
  }
}
