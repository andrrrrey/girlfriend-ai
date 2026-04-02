import { Module } from "@nestjs/common";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [GenerationController],
  providers: [GenerationService, PrismaService],
})
export class GenerationModule {}
