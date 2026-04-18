import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CallModule } from './modules/call/call.module';
import { SetupModule } from './modules/setup/setup.module';
import { BriefsModule } from './modules/briefs/briefs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    CallModule,
    SetupModule,
    BriefsModule,
  ],
})
export class AppModule {}
