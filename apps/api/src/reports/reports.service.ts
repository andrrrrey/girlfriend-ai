import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateReportDto } from "./dto/create-report.dto";

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateReportDto) {
    const reasons = (dto.reasons ?? []).filter(Boolean);
    const details = dto.details?.trim() || null;

    if (reasons.length === 0 && !details) {
      throw new BadRequestException(
        "Specify at least one reason or provide details",
      );
    }

    const targetType = dto.targetType || "character";
    const targetId = dto.targetId || dto.characterId || null;
    if (!targetId) {
      throw new BadRequestException("Report target is required");
    }

    const report = await this.prisma.report.create({
      data: {
        userId,
        // characterId заполняем только для жалоб на персонажей (FK к characters).
        characterId: targetType === "character" ? (dto.characterId ?? dto.targetId ?? null) : null,
        targetType,
        targetId,
        reasons,
        details,
      },
    });

    return { id: report.id };
  }
}
