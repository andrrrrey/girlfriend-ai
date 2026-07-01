import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

/**
 * DTO создания записи блога через админ-API (`POST /admin/blog-posts`).
 * Обязательны `title` и `content` (HTML из редактора). Slug генерится на
 * бэкенде из заголовка, excerpt при отсутствии — автогенерится из тела.
 */
export class CreateBlogPostDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  category?: string;

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
