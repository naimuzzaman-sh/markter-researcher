import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';

@Module({
  providers: [
    {
      provide: SupabaseService,
      useFactory: (configService: ConfigService) => {
        return new SupabaseService(
          configService.getOrThrow<string>('SUPABASE_URL'),
          configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [SupabaseService],
})
export class PersistenceModule {}
