import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CallModule } from './modules/call/call.module';
import { SetupModule } from './modules/setup/setup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    CallModule,
    SetupModule,
  ],
})
export class AppModule {}
