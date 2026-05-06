import { Module } from "@nestjs/common";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { PrismaService } from "../prisma.service";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [S3Module],
  controllers: [GenerationController],
  providers: [GenerationService, PrismaService],
})
export class GenerationModule {}
