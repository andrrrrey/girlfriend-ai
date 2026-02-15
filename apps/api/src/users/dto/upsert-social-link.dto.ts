import { IsIn, IsString, IsUrl } from "class-validator";

export class UpsertSocialLinkDto {
  @IsString()
  @IsIn(["vk", "instagram", "x"])
  provider!: string;

  @IsString()
  @IsUrl()
  url!: string;
}
