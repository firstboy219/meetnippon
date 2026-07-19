import { Global, Module } from '@nestjs/common';
import { TenantResolverService } from './tenant-resolver.service';
import { TenantController } from './tenant.controller';

@Global()
@Module({
  controllers: [TenantController],
  providers: [TenantResolverService],
  exports: [TenantResolverService],
})
export class TenantModule {}
