import { Module } from '@nestjs/common';

import { SeatRealtimeGateway } from './seatRealtime.gateway';

@Module({
  providers: [SeatRealtimeGateway],
  exports: [SeatRealtimeGateway],
})
export class RealtimeModule {}
