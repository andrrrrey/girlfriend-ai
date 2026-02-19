import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsIn(["free", "paid"])
  subscription?: string;

  @IsOptional()
  @IsString()
  @IsIn(["user", "admin"])
  role?: string;
}
