import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { movieCatalogProviderToken, showCatalogProviderToken } from './catalog.constants';
import { CatalogController } from './catalog.controller';
import { TicketmasterCatalogProvider } from './ticketmaster/ticketmasterCatalogProvider';
import { TmdbCatalogProvider } from './tmdb/tmdbCatalogProvider';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [
    TmdbCatalogProvider,
    TicketmasterCatalogProvider,
    {
      provide: movieCatalogProviderToken,
      useExisting: TmdbCatalogProvider,
    },
    {
      provide: showCatalogProviderToken,
      useExisting: TicketmasterCatalogProvider,
    },
  ],
  exports: [movieCatalogProviderToken, showCatalogProviderToken],
})
export class CatalogModule {}
