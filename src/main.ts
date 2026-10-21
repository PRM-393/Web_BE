import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  const apiPrefix = process.env.API_PREFIX || 'api';

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
