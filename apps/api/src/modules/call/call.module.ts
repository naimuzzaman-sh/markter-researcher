import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { AgentFactoryService } from '../agent/agent-factory.service';
import { AnalysisService } from '../analysis/analysis.service';
import { SupabaseService } from '../persistence/supabase.service';
import { CallService } from './call.service';
import { CallController } from './call.controller';

@Module({
  imports: [AgentModule, AnalysisModule, PersistenceModule],
  controllers: [CallController],
  providers: [
    {
      provide: CallService,
      useFactory: (
        agentFactory: AgentFactoryService,
        analysisService: AnalysisService,
        persistence: SupabaseService,
        configService: ConfigService,
      ) => {
        return new CallService(
          agentFactory,
          analysisService,
          persistence,
          configService.getOrThrow<string>('ELEVENLABS_API_KEY'),
        );
      },
      inject: [
        AgentFactoryService,
        AnalysisService,
        SupabaseService,
        ConfigService,
      ],
    },
  ],
  exports: [CallService],
})
export class CallModule {}
