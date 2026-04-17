import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisService } from './analysis.service';

@Module({
  providers: [
    {
      provide: AnalysisService,
      useFactory: (configService: ConfigService) => {
        return new AnalysisService(
          configService.getOrThrow<string>('GEMINI_API_KEY'),
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
