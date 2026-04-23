import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddingsService } from './openai-embeddings.service';
import { ExaService } from './exa.service';

@Module({
  providers: [
    {
      provide: OpenAIEmbeddingsService,
      useFactory: (config: ConfigService) => {
        return new OpenAIEmbeddingsService({
          apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: ExaService,
      useFactory: (config: ConfigService) => {
        return new ExaService({
          apiKey: config.getOrThrow<string>('EXA_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [OpenAIEmbeddingsService, ExaService],
})
export class AiProvidersModule {}
