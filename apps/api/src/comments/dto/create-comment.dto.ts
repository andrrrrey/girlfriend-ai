import { IsString, IsUUID, MinLength, MaxLength } from "class-validator";

export class CreateCommentDto {
  @IsUUID()
  characterId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;
}
