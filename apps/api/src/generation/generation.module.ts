import { Module } from "@nestjs/common";
import { GenerationController } from "./generation.controller";
import { GenerationService } from "./generation.service";
import { PrismaService } from "../prisma.service";
import { S3Module } from "../s3/s3.module";
import { DemoModule } from "../demo/demo.module";
import { OptionCatalogService } from "./prompt/option-catalog.service";
import { GenerationSpecService } from "./prompt/generation-spec.service";
import { CharacterIdentityService } from "./prompt/character-identity.service";
import { MediaCacheService } from "./media-cache.service";

@Module({
  imports: [S3Module, DemoModule],
  controllers: [GenerationController],
  providers: [GenerationService, PrismaService, OptionCatalogService, GenerationSpecService, CharacterIdentityService, MediaCacheService],
  // GenerationService — для AutogenModule (фоновая автогенерация персонажей);
  // спецификация и каталог опций — для ядра чата (роутер намерений, фото в чате);
  // MediaCacheService — общий кэш фото/видео чата (и его админка).
  exports: [GenerationService, GenerationSpecService, OptionCatalogService, CharacterIdentityService, MediaCacheService],
})
export class GenerationModule {}
