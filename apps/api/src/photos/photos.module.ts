import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
