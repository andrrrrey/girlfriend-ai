import { IsString, IsIn, IsUUID } from "class-validator";

export class ToggleLikeDto {
  @IsString()
  @IsIn(["character", "comment", "gallery_item", "short"])
  targetType!: string;

  @IsUUID()
  targetId!: string;
}
