import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCameraOptionDto {
  @IsString()
  @IsIn(["FRAMING", "CAMERA_ANGLE"])
  section!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
