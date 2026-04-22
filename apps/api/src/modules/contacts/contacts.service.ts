import { Injectable } from '@nestjs/common';
import { ContactsService as Core } from '@market-researcher/shared';
import { SupabaseService } from '../persistence/supabase.service';

@Injectable()
export class ContactsService extends Core {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(persistence: SupabaseService) {
    super(persistence);
  }
}
