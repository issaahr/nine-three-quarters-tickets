import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { AuthModule } from '../auth/auth.module';
import { ReservationItem } from '../reservations/reservationItem.entity';
import { Reservation } from '../reservations/reservation.entity';
import { TicketsModule } from '../tickets/tickets.module';
import { Event } from '../events/event.entity';
import { EventSeat } from '../events/eventSeat.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { FakePaymentGateway } from './fakePaymentGateway';
import { FakePaymentsModeGuard } from './guards/fakePaymentsMode.guard';
import { TrustedPaymentOriginGuard } from './guards/trustedPaymentOrigin.guard';
import { HostedCheckoutController } from './hostedCheckout.controller';
import { HostedCheckoutService } from './hostedCheckout.service';
import { HostedPaymentReconciliationService } from './hostedPaymentReconciliation.service';
import { Payment } from './payment.entity';
import { PaymentFinalizationService } from './paymentFinalization.service';
import { PaymentProvider } from './paymentProvider.enum';
import {
  hostedPaymentGatewayToken,
  paymentGatewayToken,
  stripeCheckoutWebhookToken,
} from './payments.constants';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentRepository } from './repositories/payment.repository';
import { StripeHostedPaymentGateway } from './stripe/stripeHostedPaymentGateway';
import { StripeCheckoutWebhook } from './stripe/stripeCheckoutWebhook';
import { StripeCheckoutWebhookController } from './stripe/stripeCheckoutWebhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Reservation, ReservationItem, Event, EventSeat]),
    AuthModule,
    TicketsModule,
    RealtimeModule,
  ],
  controllers: [PaymentsController, HostedCheckoutController, StripeCheckoutWebhookController],
  providers: [
    PaymentsService,
    PaymentFinalizationService,
    PaymentRepository,
    FakePaymentGateway,
    FakePaymentsModeGuard,
    HostedCheckoutService,
    HostedPaymentReconciliationService,
    TrustedPaymentOriginGuard,
    { provide: paymentGatewayToken, useExisting: FakePaymentGateway },
    {
      provide: hostedPaymentGatewayToken,
      useFactory: () => {
        const config = applicationConfig.payments;
        return config.provider === PaymentProvider.Stripe
          ? new StripeHostedPaymentGateway(config.secretKey)
          : null;
      },
    },
    {
      provide: stripeCheckoutWebhookToken,
      useFactory: () => {
        const config = applicationConfig.payments;
        return config.provider === PaymentProvider.Stripe
          ? new StripeCheckoutWebhook(config.webhookSecret)
          : null;
      },
    },
  ],
})
export class PaymentsModule {}
