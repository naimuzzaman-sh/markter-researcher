import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { JwtGuard } from './jwt.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [PersistenceModule],
  controllers: [AuthController],
  providers: [JwtGuard, AuthService],
  // Re-export PersistenceModule so consumers that import AuthModule transitively
  // have SupabaseService available. Without this, Nest fails to construct
  // JwtGuard inside importing modules (SetupModule, BriefsModule) because
  // SupabaseService isn't visible in their injector.
  exports: [JwtGuard, PersistenceModule],
})
export class AuthModule {}
