import { Controller, Get, Inject, Param, Query } from '@nestjs/common';

import { PublicCatalogQuerySchema, type PublicCatalogQuery } from '@bridalos/contracts';

import { parseWith } from '../common/validation.js';
import { PublicService, type PublicDressView } from './public.service.js';

@Controller('api/v1/public')
export class PublicController {
  constructor(@Inject(PublicService) private readonly publicService: PublicService) {}

  @Get('dresses')
  async dresses(
    @Query() query: Record<string, string>,
  ): Promise<{ items: PublicDressView[]; total: number; page: number; pageSize: number }> {
    const parsed = parseWith<PublicCatalogQuery>(PublicCatalogQuerySchema, query);
    return this.publicService.listDresses(parsed);
  }

  @Get('dresses/:id')
  async dress(@Param('id') id: string): Promise<PublicDressView> {
    return this.publicService.getDress(id);
  }

  @Get('boutiques/:slug')
  async boutique(
    @Param('slug') slug: string,
  ): Promise<Awaited<ReturnType<PublicService['getBoutique']>>> {
    return this.publicService.getBoutique(slug);
  }

  @Get('cities')
  async cities(): Promise<{ items: Array<{ citySlug: string; boutiqueCount: number }> }> {
    return { items: await this.publicService.listCities() };
  }
}
