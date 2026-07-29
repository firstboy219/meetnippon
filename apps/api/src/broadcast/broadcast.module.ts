import { Module } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { BroadcastController } from './broadcast.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule for AuthService.sendActivationEmail — the bulk resend reuses
  // the exact same token-mint-and-email logic as a single admin-created user.
  imports: [AuthModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
})
export class BroadcastModule {}
