import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { BriefsModule } from '../briefs/briefs.module';
import { AgentFactoryService } from '../agent/agent-factory.service';
import { AnalysisService } from '../analysis/analysis.service';
import { SupabaseService } from '../persistence/supabase.service';
import { BriefsService } from '../briefs/briefs.service';
import { CallService } from './call.service';
import { CallController } from './call.controller';

@Module({
  imports: [AgentModule, AnalysisModule, PersistenceModule, BriefsModule],
  controllers: [CallController],
  providers: [
    {
      provide: CallService,
      useFactory: (
        agentFactory: AgentFactoryService,
        analysisService: AnalysisService,
        persistence: SupabaseService,
        briefsService: BriefsService,
        configService: ConfigService,
      ) => {
        return new CallService(
          agentFactory,
          analysisService,
          persistence,
          briefsService,
          configService.getOrThrow<string>('ELEVENLABS_API_KEY'),
        );
      },
      inject: [
        AgentFactoryService,
        AnalysisService,
        SupabaseService,
        BriefsService,
        ConfigService,
      ],
    },
  ],
  exports: [CallService],
})
export class CallModule {}
