import { IsOptional, IsString, IsUUID } from "class-validator";

export class CreateChatDto {
  @IsUUID()
  characterId!: string;

  @IsOptional()
  @IsString()
  title?: string;
}
