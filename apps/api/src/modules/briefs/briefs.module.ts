import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { BriefsService } from './briefs.service';
import { BriefsController } from './briefs.controller';

@Module({
  imports: [PersistenceModule],
  controllers: [BriefsController],
  providers: [BriefsService],
  exports: [BriefsService],
})
export class BriefsModule {}
