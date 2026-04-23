import { Injectable } from '@nestjs/common';
import { CandidatesService as Core } from '@market-researcher/shared';
import { SupabaseService } from '../persistence/supabase.service';

@Injectable()
export class CandidatesService extends Core {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(persistence: SupabaseService) {
    super(persistence);
  }
}
