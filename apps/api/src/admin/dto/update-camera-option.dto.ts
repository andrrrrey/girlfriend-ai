import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateCameraOptionDto {
  @IsOptional()
  @IsString()
  @IsIn(["FRAMING", "CAMERA_ANGLE"])
  section?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
