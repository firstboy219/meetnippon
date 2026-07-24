import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileService } from './profile.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/profile.dto';

/**
 * The caller's own account. No @Roles guard: every signed-in user owns their
 * profile, and every route here acts on the caller's own id — never one
 * supplied by the request.
 */
@Controller('me/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get() get() { return this.profile.get(); }

  @Put() update(@Body() dto: UpdateProfileDto) { return this.profile.update(dto); }

  @Put('password') password(@Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(dto);
  }

  /** Whether this person still needs onboarding, and which steps are left. */
  @Get('onboarding') onboarding() { return this.profile.onboarding(); }

  @Post('onboarding/done') completeOnboarding() {
    return this.profile.completeOnboarding();
  }
}
