import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from '../../entities/brand.entity';
import { Store } from '../../entities/store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { User } from '../../entities/user.entity';
import { BrandController } from './brand.controller';
import { AuthModule } from '../auth/auth.module';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { BrandService } from './brand.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Brand, Store, StaffAssignment, User, RefreshToken, CampaignStore, VoucherCampaign, VoucherItem])],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
