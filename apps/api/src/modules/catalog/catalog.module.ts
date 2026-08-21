import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { catalogProviderToken } from './catalog.constants';
import { CatalogController } from './catalog.controller';
import { TmdbCatalogProvider } from './tmdb/tmdbCatalogProvider';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [
    TmdbCatalogProvider,
    {
      provide: catalogProviderToken,
      useExisting: TmdbCatalogProvider,
    },
  ],
  exports: [catalogProviderToken],
})
export class CatalogModule {}
