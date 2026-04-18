import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0 so Railway's proxy can reach us (127.0.0.1 won't work in-container).
  await app.listen(port, '0.0.0.0');
}
bootstrap();
