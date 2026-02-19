import { Module } from "@nestjs/common";
import { ChatsController } from "./chats.controller";
import { CharactersController } from "./characters.controller";
import { ChatsService } from "./chats.service";
import { PrismaService } from "../prisma.service";
import { DemoModule } from "../demo/demo.module";

@Module({
  imports: [DemoModule],
  controllers: [ChatsController, CharactersController],
  providers: [ChatsService, PrismaService],
})
export class ChatsModule {}
