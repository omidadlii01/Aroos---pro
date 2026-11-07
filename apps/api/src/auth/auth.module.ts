import { Module, type ModuleMetadata } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DevSmsAdapter } from './dev-sms.adapter.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OtpService } from './otp.service.js';
import { SMS_PORT } from './sms.port.js';
import { TokenService } from './token.service.js';

const metadata: ModuleMetadata = {
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.auth.jwtSecret,
        signOptions: { algorithm: 'HS256' as const },
        verifyOptions: { algorithms: ['HS256' as const] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    JwtAuthGuard,
    { provide: SMS_PORT, useClass: DevSmsAdapter },
  ],
  exports: [AuthService, TokenService, JwtAuthGuard],
};

/** ماژول هویت: OTP، صدور توکن، انتخاب مزون فعال. */
@Module(metadata)
export class AuthModule {}
