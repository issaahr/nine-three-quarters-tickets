import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { applicationConfig } from '../../config/applicationConfig';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { jwtStrategyName, publicSignupEnabledToken } from './auth.constants';
import { JwtAuthGuard } from './guards/jwtAuth.guard';
import { OptionalJwtAuthGuard } from './guards/optionalJwtAuth.guard';
import { PublicSignupGuard } from './guards/publicSignup.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: jwtStrategyName, session: false }),
    JwtModule.register({
      secret: applicationConfig.auth.jwtSecret,
      signOptions: {
        algorithm: 'HS256',
        expiresIn: applicationConfig.auth.jwtExpiresInSeconds,
      },
      verifyOptions: {
        algorithms: ['HS256'],
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    PublicSignupGuard,
    RolesGuard,
    {
      provide: publicSignupEnabledToken,
      useValue: applicationConfig.publicSignupEnabled,
    },
  ],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
