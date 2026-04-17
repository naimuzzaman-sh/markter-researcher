import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { AgentFactoryService } from '../agent/agent-factory.service';
import { AnalysisService } from '../analysis/analysis.service';
import { CallService } from './call.service';
import { CallController } from './call.controller';
import { researchContextSchema } from '../../types/research-context.type';
import researchContextData from '../../data/research-context.json';

@Module({
  imports: [AgentModule, AnalysisModule],
  controllers: [CallController],
  providers: [
    {
      provide: CallService,
      useFactory: (
        agentFactory: AgentFactoryService,
        analysisService: AnalysisService,
        configService: ConfigService,
      ) => {
        const context = researchContextSchema.parse(researchContextData);
        return new CallService(
          agentFactory,
          analysisService,
          context,
          configService.getOrThrow<string>('ELEVENLABS_API_KEY'),
        );
      },
      inject: [AgentFactoryService, AnalysisService, ConfigService],
    },
  ],
})
export class CallModule {}
