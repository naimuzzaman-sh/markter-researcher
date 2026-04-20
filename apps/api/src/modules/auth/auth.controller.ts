import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from '../persistence/supabase.service';

const BEARER_PREFIX = 'Bearer ';

type RefreshBody = {
  refreshToken: string;
};

type AuthorizeBody = {
  userCode: string;
  refreshToken: string;
  tokenExpiresAt: number;
};

type DenyBody = {
  userCode: string;
};

/**
 * HTTP surface for auth-related flows. All domain logic (refresh-token
 * exchange, device-flow state machine) lives in AuthService — this class
 * is pure HTTP glue: parse request, call service, map errors to statuses.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('refresh')
  async refresh(@Body() body: RefreshBody) {
    if (!body?.refreshToken) {
      throw new HttpException(
        'refreshToken is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.auth.refresh(body.refreshToken);
    if (!result) {
      throw new HttpException(
        'Refresh token is invalid or expired',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return result;
  }

  @Post('device/start')
  async deviceStart() {
    const baseUrl = this.configService.get<string>('APP_BASE_URL');
    if (!baseUrl) {
      throw new HttpException(
        'APP_BASE_URL is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    try {
      return this.auth.startDevice(baseUrl);
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Failed to start device flow',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('device/poll')
  async devicePoll(@Query('deviceCode') deviceCode: string | undefined) {
    if (!deviceCode) {
      throw new HttpException(
        'Missing deviceCode query param',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = this.auth.pollDevice(deviceCode);
    if (result.status === 'slow_down') {
      // Surface as HTTP 429 so well-behaved HTTP clients back off naturally.
      throw new HttpException(
        { status: 'slow_down' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return result;
  }

  @Post('device/authorize')
  @UseGuards(JwtGuard)
  async deviceAuthorize(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: AuthorizeBody,
  ) {
    if (!body?.userCode || !body.refreshToken) {
      throw new HttpException(
        'userCode and refreshToken are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      throw new HttpException(
        'Malformed Authorization header',
        HttpStatus.BAD_REQUEST,
      );
    }
    const accessToken = authHeader.slice(BEARER_PREFIX.length).trim();
    if (!accessToken) {
      throw new HttpException('Empty bearer token', HttpStatus.BAD_REQUEST);
    }

    try {
      this.auth.authorizeDevice({
        userCode: body.userCode,
        userId: user.id,
        accessToken,
        refreshToken: body.refreshToken,
        tokenExpiresAt: body.tokenExpiresAt ?? 0,
      });
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Authorize failed',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { ok: true };
  }

  @Post('device/deny')
  @UseGuards(JwtGuard)
  async deviceDeny(@CurrentUser() _user: AuthUser, @Body() body: DenyBody) {
    if (!body?.userCode) {
      throw new HttpException('userCode is required', HttpStatus.BAD_REQUEST);
    }
    try {
      this.auth.denyDevice(body.userCode);
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Deny failed',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { ok: true };
  }
}
