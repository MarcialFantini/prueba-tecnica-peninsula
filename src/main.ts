import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  console.log(process.env.PORT);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Peninsula API 🌊')
    .setDescription(
      `## Peninsula Bank API Documentation
      
      Welcome to the **Peninsula API**. This is a high-performance banking transaction system with optimistic locking.
      
      ### Quick Start
      1. Use the **POST /accounts** endpoint to create a new account.
      2. Use the **POST /accounts/{accountId}/balance** endpoint to deposit or withdraw funds.
      3. Use the **GET /accounts/{accountId}/transactions** to see the history.
      
      ---`,
    )
    .setVersion('1.0')
    .addTag('accounts', 'Operations related to bank accounts and balances')
    .addTag('app', 'Meta-information and health checks')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
    },
    customSiteTitle: 'Peninsula API Docs',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
