import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { corsOrigin } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const apiPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(apiPrefix);

  app.enableCors({ origin: corsOrigin(), credentials: true });

  // Validation toan cuc theo DTO (class-validator) - NFR-MNT
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger tu sinh tai liệu API - NFR-MNT-03
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Voucher Platform API')
    .setDescription('Nen tang ban va su dung voucher da thuong hieu - REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  // 0.0.0.0 de Render / Docker truy cap duoc tu ben ngoai container
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${port}/${apiPrefix}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs on http://localhost:${port}/docs`);
}

bootstrap();
