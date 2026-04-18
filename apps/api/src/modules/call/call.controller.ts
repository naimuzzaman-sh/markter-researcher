import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CallService } from './call.service';

type EndCallBody = {
  conversationId: string;
};

type StartCallBody = {
  briefId?: string;
};

@Controller('calls')
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('start')
  async startCall(@Body() body: StartCallBody) {
    if (!body.briefId || typeof body.briefId !== 'string') {
      throw new HttpException(
        { message: 'briefId is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const call = await this.callService.startCall(body.briefId);
    return {
      callId: call.id,
      agentId: call.agentId,
      briefId: call.briefId,
      signedUrl: call.signedUrl,
      status: call.status,
    };
  }

  @Get(':id')
  getCall(@Param('id') id: string) {
    const call = this.callService.getCall(id);
    if (!call) {
      throw new HttpException('Call not found', HttpStatus.NOT_FOUND);
    }
    return call;
  }

  @Post(':id/end')
  async endCall(@Param('id') id: string, @Body() body: EndCallBody) {
    try {
      const call = await this.callService.endCall(id, body.conversationId);
      return call;
    } catch (error) {
      if (error instanceof Error && error.message === 'Call not found') {
        throw new HttpException('Call not found', HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }
}
