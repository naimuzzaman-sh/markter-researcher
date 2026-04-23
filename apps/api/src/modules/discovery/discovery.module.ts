import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentJobsModule } from '../agent-jobs/agent-jobs.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CandidatesModule } from '../candidates/candidates.module';
import { BriefsModule } from '../briefs/briefs.module';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { DiscoveryService } from './discovery.service';
import { DiscoveryController } from './discovery.controller';

@Module({
  imports: [
    AuthModule,
    AgentJobsModule,
    ContactsModule,
    CandidatesModule,
    BriefsModule,
    AiProvidersModule,
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
