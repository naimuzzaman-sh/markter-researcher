import { Injectable } from '@nestjs/common';
import { AgentJobsService as Core } from '@market-researcher/shared';
import { SupabaseService } from '../persistence/supabase.service';

/**
 * Nest-injectable wrapper around the shared `AgentJobsService`. Behaviour
 * lives in `@market-researcher/shared`; this class only participates in DI.
 *
 * Mirrors `BriefsService`'s wrapper pattern — the redundant-looking
 * constructor is required because Nest's DI reads parameter metadata from
 * this class, not the parent.
 */
@Injectable()
export class AgentJobsService extends Core {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(persistence: SupabaseService) {
    super(persistence);
  }
}
