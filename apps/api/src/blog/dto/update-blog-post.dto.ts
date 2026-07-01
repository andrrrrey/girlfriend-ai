import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

/**
 * DTO частичного обновления записи блога (`PATCH /admin/blog-posts/:id`).
 * Передаются только изменяемые поля.
 */
export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
