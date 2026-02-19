import { Module } from "@nestjs/common";
import { CleanupService } from "./cleanup.service";
import { PrismaService } from "../prisma.service";

@Module({
  providers: [CleanupService, PrismaService],
})
export class CleanupModule {}
