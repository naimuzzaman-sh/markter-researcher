import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromptBuilderService } from './prompt-builder.service';
import { AgentFactoryService } from './agent-factory.service';

@Module({
  providers: [
    PromptBuilderService,
    {
      provide: AgentFactoryService,
      useFactory: (
        promptBuilder: PromptBuilderService,
        configService: ConfigService,
      ) => {
        return new AgentFactoryService(promptBuilder, {
          apiKey: configService.getOrThrow<string>('ELEVENLABS_API_KEY'),
          voiceId:
            configService.get<string>('ELEVENLABS_VOICE_ID') ??
            'cjVigY5qzO86Huf0OWal',
        });
      },
      inject: [PromptBuilderService, ConfigService],
    },
  ],
  exports: [AgentFactoryService, PromptBuilderService],
})
export class AgentModule {}
