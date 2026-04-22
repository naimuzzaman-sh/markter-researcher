import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CallModule } from './modules/call/call.module';
import { SetupModule } from './modules/setup/setup.module';
import { BriefsModule } from './modules/briefs/briefs.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { AuthModule } from './modules/auth/auth.module';
import { AgentJobsModule } from './modules/agent-jobs/agent-jobs.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';

/**
 * Locate the built web app (apps/web/dist) relative to the running API.
 * - In dev / `nest start`: __dirname is apps/api/src → walk up to apps/web/dist
 * - In prod / `node dist/main`: __dirname is apps/api/dist → same walk-up still works
 * - In a flat production bundle (Railway): fall back to ../web/dist alongside.
 */
function resolveWebDist(): string | null {
  const candidates = [
    resolve(__dirname, '..', '..', 'web', 'dist'),
    resolve(__dirname, '..', '..', '..', 'web', 'dist'),
    resolve(__dirname, '..', '..', '..', 'apps', 'web', 'dist'),
    resolve(process.cwd(), 'apps', 'web', 'dist'),
  ];
  return candidates.find((p) => existsSync(join(p, 'index.html'))) ?? null;
}

const webDist = resolveWebDist();

const staticImports: DynamicModule[] = webDist
  ? [
      ServeStaticModule.forRoot({
        rootPath: webDist,
        // Don't intercept API routes — these stay with their Nest controllers.
        exclude: [
          '/calls/{*path}',
          '/setup/{*path}',
          '/briefs/{*path}',
          '/interviews/{*path}',
          '/auth/{*path}',
          '/agent-jobs/{*path}',
          '/contacts/{*path}',
          '/candidates/{*path}',
          '/discovery/{*path}',
          '/briefs/{*path}/candidates',
        ],
      }),
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ...staticImports,
    CallModule,
    SetupModule,
    BriefsModule,
    InterviewsModule,
    AuthModule,
    AgentJobsModule,
    ContactsModule,
    CandidatesModule,
    DiscoveryModule,
  ],
})
export class AppModule {}
