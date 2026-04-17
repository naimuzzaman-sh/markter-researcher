import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { SetupService } from './setup.service';

type ChatBody = {
  sessionId: string;
  message: string;
};

@Controller('setup')
export class SetupController {
  private readonly logger = new Logger(SetupController.name);

  constructor(private readonly setupService: SetupService) {}

  @Post('start')
  async startSession() {
    try {
      return await this.setupService.startSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`startSession failed: ${message}`, (error as Error)?.stack);
      throw new HttpException(
        { message: `Failed to start setup: ${message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('chat')
  async chat(@Body() body: ChatBody) {
    try {
      return await this.setupService.sendMessage(body.sessionId, body.message);
    } catch (error) {
      if (error instanceof Error && error.message === 'Session not found') {
        throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`chat failed: ${message}`, (error as Error)?.stack);
      throw new HttpException(
        { message: `Failed to send message: ${message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
