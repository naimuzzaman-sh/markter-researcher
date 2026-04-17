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
import { researchContextSchema } from '../../types/research-context.type';

type EndCallBody = {
  conversationId: string;
};

type StartCallBody = {
  context: unknown;
};

@Controller('calls')
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('start')
  async startCall(@Body() body: StartCallBody) {
    const parsed = researchContextSchema.safeParse(body.context);
    if (!parsed.success) {
      throw new HttpException(
        { message: 'Invalid research context', issues: parsed.error.issues },
        HttpStatus.BAD_REQUEST,
      );
    }

    const call = await this.callService.startCall(parsed.data);
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
