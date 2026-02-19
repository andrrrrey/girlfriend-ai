import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { AdminModule } from "./admin/admin.module";
import { InternalModule } from "./internal/internal.module";
import { ChatsModule } from "./chats/chats.module";
import { CleanupModule } from "./cleanup/cleanup.module";

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AdminModule,
    InternalModule,
    ChatsModule,
    CleanupModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
