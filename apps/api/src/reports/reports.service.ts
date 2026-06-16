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

    const report = await this.prisma.report.create({
      data: {
        userId,
        characterId: dto.characterId,
        reasons,
        details,
      },
    });

    return { id: report.id };
  }
}
