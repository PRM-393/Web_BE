import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { corsOrigin } from './config/cors';

// Cau hinh dung chung cho main.ts va test e2e, de chay that va chay test giong het nhau
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix(process.env.API_PREFIX || 'api');
  app.enableCors({ origin: corsOrigin(), credentials: true });

  // Validation toan cuc theo DTO (class-validator) - NFR-MNT
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  // F01: moi phan hoi co dang { data, error, meta }
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)));
  return app;
}
