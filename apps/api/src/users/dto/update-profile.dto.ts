import { IsOptional, IsString, MaxLength, IsIn, Matches, IsNotIn } from "class-validator";

const RESERVED_NICKNAMES = ["me", "admin", "check-nickname", "api", "support"];

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: "Nickname can only contain letters, numbers and underscores" })
  @IsNotIn(RESERVED_NICKNAMES, { message: "This nickname is reserved" })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aboutMe?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(["en", "ru"])
  lang?: string;

  @IsOptional()
  @IsString()
  @IsIn(["nsfw", "sfw"])
  contentMode?: string;
}
