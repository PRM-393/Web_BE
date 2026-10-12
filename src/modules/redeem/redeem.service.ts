import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { RedeemToken } from '../../entities/redeem-token.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { RedemptionLog } from '../../entities/redemption-log.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { RedeemMethod, VoucherItemStatus } from '../../common/enums/status.enum';
import { RequestTokenDto, RedeemDto } from './dto/redeem.dto';

@Injectable()
export class RedeemService {
  constructor(
    @InjectRepository(RedeemToken) private readonly tokenRepo: Repository<RedeemToken>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(RedemptionLog) private readonly logRepo: Repository<RedemptionLog>,
    @InjectRepository(CampaignStore) private readonly campaignStoreRepo: Repository<CampaignStore>,
    @InjectRepository(StaffAssignment)
    private readonly staffAssignmentRepo: Repository<StaffAssignment>,
    private readonly dataSource: DataSource,
  ) {}

  // FR-REDEEM-02/03, BR-06: sinh token QR (chu ky HMAC) + ma OTP tuong ung, het han 60 giay, dung mot lan
  async requestToken(userId: string, dto: RequestTokenDto) {
    const item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Khong tim thay voucher.');
    }
    if (item.status !== VoucherItemStatus.ACTIVE) {
      throw new BadRequestException('Voucher khong con hieu luc de su dung.');
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const ttlSeconds = parseInt(process.env.REDEEM_TOKEN_TTL_SECONDS || '60', 10);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const token = this.tokenRepo.create({
      voucherItemId: item.id,
      nonce,
      otpCode,
      expiresAt,
    });
    await this.tokenRepo.save(token);

    // Chu ky HMAC dua tren secretKey rieng cua voucher - NFR-SEC-02
    const signature = crypto
      .createHmac('sha256', item.secretKey)
      .update(`${item.id}.${nonce}.${expiresAt.getTime()}`)
      .digest('hex');

    return {
      qrPayload: `${item.id}.${nonce}.${expiresAt.getTime()}.${signature}`,
      otpCode,
      expiresAt,
      ttlSeconds,
    };
  }

  // FR-REDEEM-05/06/07/09/11, BR-06, BR-07, BR-12, NFR-REL-03
  async redeem(staffUserId: string, dto: RedeemDto) {
    if (!dto.nonce && !dto.otpCode) {
      throw new BadRequestException('Can cung cap ma QR hoac ma OTP.');
    }

    // BR-07: nhan vien chi duoc redeem tai chi nhanh minh duoc gan
    const assignment = await this.staffAssignmentRepo.findOne({
      where: { userId: staffUserId, storeId: dto.storeId, active: true },
    });
    if (!assignment) {
      throw new BadRequestException('Nhan vien khong duoc gan cho chi nhanh nay.');
    }

    const token = await this.tokenRepo.findOne({
      where: dto.nonce ? { nonce: dto.nonce } : { otpCode: dto.otpCode },
      order: { issuedAt: 'DESC' },
    });
    if (!token) {
      throw new BadRequestException('Ma khong hop le.');
    }
    if (token.usedAt) {
      throw new BadRequestException('Ma da duoc su dung.');
    }
    if (token.expiresAt < new Date()) {
      throw new BadRequestException('Ma da het han, vui long yeu cau ma moi.');
    }

    return this.dataSource.transaction(async (manager) => {
      // NFR-REL-03 / BR-12: khoa ban ghi voucher (pessimistic lock) de chong redeem trung khi truy cap dong thoi
      const item = await manager
        .createQueryBuilder(VoucherItem, 'v')
        .setLock('pessimistic_write')
        .where('v.id = :id', { id: token.voucherItemId })
        .getOne();

      if (!item) throw new NotFoundException('Khong tim thay voucher.');
      if (item.status !== VoucherItemStatus.ACTIVE) {
        throw new BadRequestException(`Voucher khong hop le: trang thai hien tai la ${item.status}.`);
      }
      if (item.expireAt < new Date()) {
        throw new BadRequestException('Voucher da het han su dung.');
      }

      // BR-07: chi nhanh phai nam trong danh sach CampaignStore cua chien dich
      const allowed = await manager.findOne(CampaignStore, {
        where: { campaignId: item.campaignId, storeId: dto.storeId },
      });
      if (!allowed) {
        throw new BadRequestException('Voucher khong duoc ap dung tai chi nhanh nay.');
      }

      item.status = VoucherItemStatus.USED;
      item.usedAt = new Date();
      await manager.save(item);

      token.usedAt = new Date();
      await manager.save(token);

      const log = manager.create(RedemptionLog, {
        voucherItemId: item.id,
        storeId: dto.storeId,
        staffUserId,
        billAmount: dto.billAmount,
        method: dto.nonce ? RedeemMethod.QR : RedeemMethod.OTP,
      });
      await manager.save(log);

      // TODO: gui thong bao cho khach hang (FR-REDEEM-09)
      return { message: 'Redeem thanh cong.', voucherItemId: item.id, redeemedAt: log.redeemedAt };
    });
  }

  // FR-AUTH-12: danh sach chi nhanh dang duoc gan (active) cho nhan vien
  async findStaffStores(staffUserId: string) {
    const assignments = await this.staffAssignmentRepo.find({
      where: { userId: staffUserId, active: true },
      relations: ['store'],
    });
    return assignments.map((a) => a.store);
  }

  // FR-REDEEM-10
  findStaffHistoryToday(staffUserId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.logRepo
      .createQueryBuilder('log')
      .where('log.staffUserId = :staffUserId', { staffUserId })
      .andWhere('log.redeemedAt >= :startOfDay', { startOfDay })
      .orderBy('log.redeemedAt', 'DESC')
      .getMany();
  }
}
