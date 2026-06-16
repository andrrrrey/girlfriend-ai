import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
} from "class-validator";

export class CreateReportDto {
  @IsUUID()
  characterId!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  reasons: string[] = [];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
