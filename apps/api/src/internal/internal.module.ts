import { Module } from "@nestjs/common";
import { InternalController } from "./internal.controller";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [InternalController],
  providers: [PrismaService],
})
export class InternalModule {}
