import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestActivationDto, CompleteActivationDto } from './dto/activation.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, CurrentUserCtx } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req.headers['host']);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: CurrentUserCtx) {
    return this.auth.me(user.userId);
  }

  /**
   * "First time here" — email a set-password link to an account that has none.
   *
   * Deliberately returns the same body whether or not the address exists, so
   * the endpoint cannot be used to test who has an account here.
   */
  @Post('activation/request')
  @HttpCode(200)
  async requestActivation(@Body() dto: RequestActivationDto, @Req() req: Request) {
    await this.auth.requestActivation(dto.email, dto.tenantSlug, req.headers['host']);
    return { ok: true };
  }

  /** Redeem the link: set the first password and return a session. */
  @Post('activation/complete')
  @HttpCode(200)
  completeActivation(@Body() dto: CompleteActivationDto) {
    return this.auth.completeActivation(dto.token, dto.newPassword);
  }
}
