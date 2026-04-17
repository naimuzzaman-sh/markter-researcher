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

@Controller('calls')
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('start')
  async startCall() {
    const call = await this.callService.startCall();
    return {
      callId: call.id,
      agentId: call.agentId,
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
