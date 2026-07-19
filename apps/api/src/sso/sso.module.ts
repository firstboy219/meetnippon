import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SsoService } from './sso.service';
import { SsoController } from './sso.controller';

@Module({
  imports: [AuthModule],
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
