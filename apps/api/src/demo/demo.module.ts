import { Module } from "@nestjs/common";
import { DemoService } from "./demo.service";
import { PrismaService } from "../prisma.service";

@Module({
  providers: [DemoService, PrismaService],
  exports: [DemoService],
})
export class DemoModule {}
