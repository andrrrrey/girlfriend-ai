import { IsObject } from "class-validator";

export class UpsertSettingsDto {
  @IsObject()
  settings!: Record<string, string>;
}
