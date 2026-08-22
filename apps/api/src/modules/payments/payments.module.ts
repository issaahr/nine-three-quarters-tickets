import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { Reservation } from '../reservations/reservation.entity';
import { FakePaymentGateway } from './fakePaymentGateway';
import { Payment } from './payment.entity';
import { paymentGatewayToken } from './payments.constants';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentRepository } from './repositories/payment.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Reservation, ReservationItem]), AuthModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentRepository,
    FakePaymentGateway,
    { provide: paymentGatewayToken, useExisting: FakePaymentGateway },
  ],
})
export class PaymentsModule {}
