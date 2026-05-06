import { Module } from "@nestjs/common";
import { S3Module } from "../s3/s3.module";
import { MediaController } from "./media.controller";

@Module({
  imports: [S3Module],
  controllers: [MediaController],
})
export class MediaModule {}
