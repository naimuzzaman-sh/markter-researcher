import { Injectable } from '@nestjs/common';
import { BriefsService as Core } from '@market-researcher/shared';
import { SupabaseService } from '../persistence/supabase.service';

/**
 * Nest-injectable wrapper around the shared `BriefsService`. Behaviour lives
 * in `@market-researcher/shared`; this class only participates in DI.
 *
 * The constructor looks redundant but is required: Nest's DI uses the
 * constructor parameter metadata (emitted by `emitDecoratorMetadata`) on THIS
 * class — not on the parent — to know what to inject.
 */
@Injectable()
export class BriefsService extends Core {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(persistence: SupabaseService) {
    super(persistence);
  }
}
