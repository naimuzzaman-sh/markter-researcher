import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  controllers: [SetupController],
  providers: [
    {
      provide: SetupService,
      useFactory: (configService: ConfigService) => {
        return new SetupService(
          configService.getOrThrow<string>('GEMINI_API_KEY'),
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [SetupService],
})
export class SetupModule {}
