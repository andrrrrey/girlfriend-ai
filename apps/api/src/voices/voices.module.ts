import { Module } from "@nestjs/common";
import { VoicesController } from "./voices.controller";
import { VoicesAdminController } from "./voices-admin.controller";
import { VoicesService } from "./voices.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [VoicesController, VoicesAdminController],
  providers: [VoicesService, PrismaService],
  exports: [VoicesService],
})
export class VoicesModule {}
