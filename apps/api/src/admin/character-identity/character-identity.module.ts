/**
 * @file character-identity.module.ts
 * @description Админ-API описания аватаров персонажей (сервис — в GenerationModule).
 */

import { Module } from "@nestjs/common";
import { GenerationModule } from "../../generation/generation.module";
import { CharacterIdentityController } from "./character-identity.controller";

@Module({
  imports: [GenerationModule],
  controllers: [CharacterIdentityController],
})
export class CharacterIdentityModule {}
