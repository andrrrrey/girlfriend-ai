import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CHAT_ARCHETYPES,
  CHAT_LIKES,
  CHAT_RELATIONSHIPS,
  CONTENT_LEVELS,
  EMOJI_LEVELS,
  JEALOUSY_LEVELS,
  LIMITS,
  MEETING_SCENARIOS,
  MESSAGE_LENGTHS,
  SWEARING_LEVELS,
  VOICE_MODES,
} from "../chat-settings";

const list = (l: readonly string[]) => [...l];

export class ChatSettingsSlidersDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) boldness?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) edge?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) talkativeness?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) humor?: number;
  @IsOptional() @IsIn(list(JEALOUSY_LEVELS)) jealousy?: string;
}

export class ChatSettingsStyleDto {
  @IsOptional() @IsIn(list(MESSAGE_LENGTHS)) length?: string;
  @IsOptional() @IsIn(list(EMOJI_LEVELS)) emoji?: string;
  @IsOptional() @IsString() @MaxLength(LIMITS.petName) petName?: string;
  @IsOptional() @IsIn(list(SWEARING_LEVELS)) swearing?: string;
}

/** Тело PUT /chats/:id/settings — все поля необязательны; заменяет прежние настройки. */
export class ChatSettingsDto {
  @IsOptional() @IsString() @MaxLength(LIMITS.backstory) backstory?: string;
  @IsOptional() @IsIn([...MEETING_SCENARIOS, "custom"]) meetingScenario?: string;
  @IsOptional() @IsString() @MaxLength(LIMITS.meetingCustom) meetingCustom?: string;
  @IsOptional() @IsString() @MaxLength(LIMITS.occupation) occupation?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(LIMITS.hobbies) @IsString({ each: true }) @MaxLength(LIMITS.hobby, { each: true })
  hobbies?: string[];

  /** Только из списка: запрещённых значений (родственники, учитель/ученица) в нём нет. */
  @IsOptional() @IsIn(list(CHAT_ARCHETYPES)) archetype?: string;
  @IsOptional() @IsIn(list(CHAT_RELATIONSHIPS)) relationship?: string;

  @IsOptional() @ValidateNested() @Type(() => ChatSettingsSlidersDto) sliders?: ChatSettingsSlidersDto;
  @IsOptional() @ValidateNested() @Type(() => ChatSettingsStyleDto) style?: ChatSettingsStyleDto;

  @IsOptional() @IsString() @MaxLength(100) voiceId?: string;
  @IsOptional() @IsIn(list(VOICE_MODES)) voiceMode?: string;
  @IsOptional() @IsIn(list(CONTENT_LEVELS)) level?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(CHAT_LIKES.length) @IsIn(list(CHAT_LIKES), { each: true })
  likes?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(LIMITS.boundaries) @IsString({ each: true }) @MaxLength(LIMITS.boundary, { each: true })
  boundaries?: string[];
}

/** Тело POST /chats/:id/settings/backstory-assist. */
export class BackstoryAssistDto {
  @IsString() @MaxLength(LIMITS.backstoryIdea) idea!: string;
  @IsOptional() @IsIn(["en", "ru", "de", "fr"]) lang?: string;
}
