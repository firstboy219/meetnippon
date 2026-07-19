import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { RegisterWorkspaceDto } from './dto/register.dto';

/** Public onboarding surface (no auth). Rate-limited by the global throttler. */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterWorkspaceDto) {
    return this.onboarding.register(dto);
  }
}
