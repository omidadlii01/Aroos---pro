import { type DynamicModule, Global, Module } from '@nestjs/common';

import { ImageService } from './image.service.js';
import { LocalMediaStorage, MEDIA_STORAGE } from './local-storage.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MediaSigner } from './media-signer.js';

@Global()
@Module({})
export class MediaModule {
  static forRoot(): DynamicModule {
    return {
      module: MediaModule,
      controllers: [MediaController],
      providers: [
        ImageService,
        MediaSigner,
        MediaService,
        { provide: MEDIA_STORAGE, useClass: LocalMediaStorage },
      ],
      exports: [MediaService, MediaSigner, ImageService, MEDIA_STORAGE],
    };
  }
}
