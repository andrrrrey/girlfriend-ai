import { IsOptional, IsString, MaxLength, IsIn, Matches, IsNotIn, IsArray, ArrayMaxSize, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

/** Диапазоны возраста в предпочтениях (фильтр персонажей по personality.age). */
export const PREFERENCE_AGE_RANGES = ["18-25", "26-35", "36-45", "46+"] as const;
/** Стили персонажей (как в визарде /create; регистр не важен). */
export const PREFERENCE_STYLES = ["realistic", "semi-real", "anime", "2d"] as const;

/** Предпочтения пользователя: фильтры по умолчанию на главной и в галерее. */
export class UserPreferencesDto {
  @IsOptional()
  @IsString()
  @IsIn(PREFERENCE_STYLES as unknown as string[])
  style?: string;

  @IsOptional()
  @IsString()
  @IsIn(PREFERENCE_AGE_RANGES as unknown as string[])
  ageRange?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

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
  @IsIn(["en", "ru", "de", "fr"])
  lang?: string;

  @IsOptional()
  @IsString()
  @IsIn(["nsfw", "sfw"])
  contentMode?: string;

  /** Часовой пояс IANA из браузера (Intl) — для тихих часов инициативных сообщений. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, { message: "Invalid timezone" })
  timezone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;
}
