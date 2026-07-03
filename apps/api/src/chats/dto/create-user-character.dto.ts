import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class CreateUserCharacterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @IsNumber()
  @Min(18)
  @Max(100)
  age!: number;

  @IsString()
  @MinLength(1)
  gender!: string;

  @IsString()
  @MinLength(1)
  orientation!: string;

  @IsString()
  @MinLength(1)
  style!: string;

  @IsOptional()
  @IsString()
  generationStyle?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  voice?: string;

  // ElevenLabs voice id из каталога голосов (админка). Пишется в Character.voiceId
  // и используется при TTS в чате. Хранится как есть, без нормализации.
  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  eyeColor?: string;

  @IsOptional()
  @IsString()
  hairStyle?: string;

  @IsOptional()
  @IsString()
  hairColor?: string;

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsString()
  breastSize?: string;

  @IsOptional()
  @IsString()
  buttSize?: string;

  @IsOptional()
  @IsString()
  personality?: string;

  @IsOptional()
  @IsString()
  relationshipType?: string;

  @IsOptional()
  @IsString()
  familyStatus?: string;

  @IsOptional()
  @IsString()
  lifestyle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  work?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hobbies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  kinks?: string[];

  @IsOptional()
  @IsString()
  childhoodMemory?: string;

  @IsOptional()
  @IsString()
  lifeStory?: string;

  @IsOptional()
  @IsString()
  phobias?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
