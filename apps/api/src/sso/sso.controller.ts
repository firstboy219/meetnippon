import {
  Body, Controller, Get, Param, Post, Query, Req, HttpCode,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Request } from 'express';
import { SsoService } from './sso.service';

class SsoStartDto {
  @IsOptional() @IsString() tenantSlug?: string;
}
class SsoCallbackDto {
  @IsString() code!: string;
  @IsString() state!: string;
}

@Controller('auth/sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  /** Begin sign-in. Returns { url, mode } — mode 'mock' tells the UI to prompt. */
  @Post(':provider/start')
  @HttpCode(200)
  start(@Param('provider') provider: string, @Body() dto: SsoStartDto, @Req() req: Request) {
    return this.sso.start(provider, dto.tenantSlug, req.headers['host']);
  }

  /** Complete sign-in via POST (SPA-friendly) — returns tokens + user. */
  @Post(':provider/callback')
  @HttpCode(200)
  callbackPost(@Param('provider') provider: string, @Body() dto: SsoCallbackDto) {
    return this.sso.callback(provider, dto.code, dto.state);
  }

  /** Provider redirect target (GET) — same exchange, returns tokens + user. */
  @Get(':provider/callback')
  callbackGet(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.sso.callback(provider, code, state);
  }
}
