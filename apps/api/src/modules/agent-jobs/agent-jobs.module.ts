import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { AgentJobsService } from './agent-jobs.service';
import { AgentJobsController } from './agent-jobs.controller';

@Module({
  imports: [PersistenceModule, AuthModule],
  controllers: [AgentJobsController],
  providers: [AgentJobsService],
  exports: [AgentJobsService],
})
export class AgentJobsModule {}
