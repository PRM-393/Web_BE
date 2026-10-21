import { HttpStatus, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { RedeemToken } from '../../entities/redeem-token.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { RedemptionLog } from '../../entities/redemption-log.entity';
import { CampaignStore } from '../../entities/campaign-store.entity';
import { StaffAssignment } from '../../entities/staff-assignment.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { RedeemMethod, VoucherItemStatus } from '../../common/enums/status.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { envInt, formatVnDateTime, startOfVnDay } from '../../common/utils/vn-time';
import { RequestTokenDto, RedeemDto } from './dto/redeem.dto';
import { NotificationService } from '../notification/notification.service';
import { VoucherCampaign } from '../../entities/voucher-campaign.entity';
import { Store } from '../../entities/store.entity';
import { buildQrPayload, newNonce, newOtp, redeemSecret, verifyQrPayload } from './redeem-token';
import { billRequired, usageBlock } from './redeem.rules';

const MINUTE = 60 * 1000;

// Ghi vao audit_logs: dem lan nhap sai OTP va thoi diem khoa (khong can bang moi, khong mat khi may chu khoi dong lai)
const OTP_FAILED = 'REDEEM_OTP_FAILED';
const OTP_LOCKED = 'REDEEM_OTP_LOCKED';

type RedeemOutcome =
  | { ok: true; result: RedeemResult; userId: string; campaignId: string }
  | { ok: false; error: BusinessException; otpFailed?: boolean };

export interface RedeemResult {
  message: string;
  redemptionLogId: string;
  voucherItemId: string;
  voucherCode: string;
  redeemedAt: Date;
  method: RedeemMethod;
  billAmount: number | null;
  billEditableUntil: Date;
  campaign: { id: string; title: string; voucherType: string; faceValue: number };
}

@Injectable()
export class RedeemService implements OnModuleInit {
  constructor(
    @InjectRepository(RedeemToken) private readonly tokenRepo: Repository<RedeemToken>,
    @InjectRepository(VoucherItem) private readonly voucherItemRepo: Repository<VoucherItem>,
    @InjectRepository(RedemptionLog) private readonly logRepo: Repository<RedemptionLog>,
    @InjectRepository(CampaignStore) private readonly campaignStoreRepo: Repository<CampaignStore>,
    @InjectRepository(StaffAssignment)
    private readonly staffAssignmentRepo: Repository<StaffAssignment>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
  ) {}

  // Production thieu REDEEM_HMAC_SECRET thi dung khoi dong, khong chay voi khoa mac dinh
  onModuleInit() {
    redeemSecret();
  }

  // ================= F10 - sinh ma redeem (FR-REDEEM-02/03, BR-06, BR-16) =================

  // Token QR ky HMAC + OTP 6 so, hieu luc 60 giay; chi chu so huu, voucher ACTIVE va con han;
  // sinh ma moi thi vo hieu ma cu; toi da 10 lan / 10 phut moi khach
  async requestToken(userId: string, dto: RequestTokenDto) {
    const item = await this.voucherItemRepo.findOne({ where: { id: dto.voucherItemId } });
    if (!item || item.userId !== userId) throw new NotFoundException('Không tìm thấy voucher.');

    const now = new Date();
    const block = usageBlock(item, now);
    if (block) throw new BusinessException(block.reason, block.message, block.details);
    await this.assertTokenRate(userId, now);

    const ttlSeconds = envInt('REDEEM_TOKEN_TTL_SECONDS', 60);
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const nonce = newNonce();

    const token = await this.dataSource.transaction(async (manager) => {
      // BR-06: moi voucher chi co mot ma con hieu luc
      await manager.update(
        RedeemToken,
        { voucherItemId: item.id, usedAt: IsNull(), revokedAt: IsNull() },
        { revokedAt: now },
      );
      const otpCode = await this.uniqueOtp(manager, now);
      return manager.save(manager.create(RedeemToken, { voucherItemId: item.id, nonce, otpCode, expiresAt }));
    });

    return {
      qrPayload: buildQrPayload(nonce, expiresAt),
      otpCode: token.otpCode,
      expiresAt,
      ttlSeconds,
    };
  }

  private async assertTokenRate(userId: string, now: Date) {
    const windowMinutes = envInt('REDEEM_TOKEN_RATE_WINDOW_MINUTES', 10);
    const max = envInt('REDEEM_TOKEN_MAX_PER_WINDOW', 10);
    const since = new Date(now.getTime() - windowMinutes * MINUTE);
    const recent = await this.tokenRepo
      .createQueryBuilder('t')
      .innerJoin('t.voucherItem', 'v')
      .where('v.userId = :userId', { userId })
      .andWhere('t.issuedAt > :since', { since })
      .orderBy('t.issuedAt', 'ASC')
      .getMany();
    if (recent.length < max) return;
    const retryAt = new Date(new Date(recent[recent.length - max].issuedAt).getTime() + windowMinutes * MINUTE);
    throw new BusinessException(
      'TOKEN_RATE_LIMITED',
      `Bạn đã tạo mã ${max} lần trong ${windowMinutes} phút. Vui lòng thử lại lúc ${formatVnDateTime(retryAt)}.`,
      { retryAt: retryAt.toISOString(), retryAfterSeconds: Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000)) },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // OTP duy nhat trong cac token con hieu luc, de nhan vien nhap OTP xac dinh dung mot voucher
  private async uniqueOtp(manager: EntityManager, now: Date): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const otpCode = newOtp();
      const taken = await manager.count(RedeemToken, {
        where: { otpCode, usedAt: IsNull(), revokedAt: IsNull(), expiresAt: MoreThan(now) },
      });
      if (!taken) return otpCode;
    }
    throw new ServiceUnavailableException('Không sinh được mã OTP, vui lòng thử lại.');
  }

  // ================= F11 - xac nhan su dung (FR-REDEEM-05..13, BR-03, BR-06, BR-07, BR-12) =================

  async redeem(staffUserId: string, dto: RedeemDto): Promise<RedeemResult> {
    if (!!dto.qrPayload === !!dto.otpCode) {
      throw new BusinessException('CODE_REQUIRED', 'Cần gửi đúng một trong hai: mã QR hoặc mã OTP.');
    }
    const now = new Date();

    // BR-07: chi duoc xac nhan tai chi nhanh dang duoc gan va dang hoat dong
    const assignment = await this.staffAssignmentRepo.findOne({
      where: { userId: staffUserId, storeId: dto.storeId, active: true, store: { status: true } },
    });
    if (!assignment) {
      throw new BusinessException('STAFF_NOT_ASSIGNED', 'Bạn không được gán cho chi nhánh này.', null, HttpStatus.FORBIDDEN);
    }

    let lookup: { nonce: string } | { otpCode: string };
    if (dto.qrPayload) {
      const qr = verifyQrPayload(dto.qrPayload);
      if (!qr) throw new BusinessException('TOKEN_INVALID', 'Mã QR không hợp lệ hoặc không phải mã của hệ thống.');
      if (qr.expiresAt.getTime() <= now.getTime()) {
        throw new BusinessException('TOKEN_EXPIRED', 'Mã QR đã hết hạn, nhờ khách làm mới mã trên ứng dụng.');
      }
      lookup = { nonce: qr.nonce };
    } else {
      await this.assertOtpNotLocked(staffUserId, now);
      lookup = { otpCode: dto.otpCode! };
    }

    // Loi nghiep vu (tru BILL_REQUIRED) van commit de token bi danh dau da dung (FR-REDEEM-13) roi moi bao loi
    const outcome = await this.dataSource.transaction((manager) => this.redeemTx(manager, staffUserId, dto, lookup, now));
    if (!outcome.ok) {
      if (outcome.otpFailed) await this.recordOtpFailure(staffUserId, dto.storeId);
      throw outcome.error;
    }

    // FR-REDEEM-09 (F16): bao cho khach SAU khi commit, loi gui thong bao khong lam hong redeem
    await this.notifyUsed(outcome.userId, outcome.result.voucherItemId, outcome.campaignId, dto.storeId);
    return outcome.result;
  }

  private async redeemTx(
    manager: EntityManager,
    staffUserId: string,
    dto: RedeemDto,
    lookup: { nonce: string } | { otpCode: string },
    now: Date,
  ): Promise<RedeemOutcome> {
    // 1) Khoa token (SELECT ... FOR UPDATE): hai quay cung quet mot ma thi chi mot ben di tiep
    const qb = manager.createQueryBuilder(RedeemToken, 't').setLock('pessimistic_write');
    if ('nonce' in lookup) {
      qb.where('t.nonce = :nonce', { nonce: lookup.nonce });
    } else {
      qb.where('t.otpCode = :otpCode', { otpCode: lookup.otpCode })
        .andWhere('t.usedAt IS NULL')
        .andWhere('t.revokedAt IS NULL')
        .andWhere('t.expiresAt > :now', { now });
    }
    let token = await qb.getOne();

    if (!token && 'otpCode' in lookup) {
      // OTP khong khop ma nao con hieu luc: neu la ma cu cua khach thi bao ro, nguoc lai tinh la nhap sai
      token = await manager.findOne(RedeemToken, {
        where: { otpCode: lookup.otpCode, issuedAt: MoreThan(new Date(now.getTime() - 60 * MINUTE)) },
        order: { issuedAt: 'DESC' },
      });
      if (!token) {
        return { ok: false, otpFailed: true, error: new BusinessException('OTP_INVALID', 'Mã OTP không đúng.') };
      }
    }
    if (!token) {
      return { ok: false, error: new BusinessException('TOKEN_INVALID', 'Mã QR không còn tồn tại trên hệ thống.') };
    }
    if (token.revokedAt) {
      return {
        ok: false,
        error: new BusinessException('TOKEN_REVOKED', 'Mã đã được thay bằng mã mới, nhờ khách mở mã mới nhất trên ứng dụng.'),
      };
    }

    // 2) Khoa voucher (NFR-REL-03, BR-12)
    const item = await manager
      .createQueryBuilder(VoucherItem, 'v')
      .setLock('pessimistic_write')
      .where('v.id = :id', { id: token.voucherItemId })
      .getOne();
    if (!item) return { ok: false, error: new BusinessException('TOKEN_INVALID', 'Không tìm thấy voucher của mã này.') };

    if (item.status === VoucherItemStatus.USED) {
      return { ok: false, error: await this.alreadyUsedError(manager, item) };
    }
    if (token.usedAt) return { ok: false, error: new BusinessException('TOKEN_USED', 'Mã này đã được dùng.') };
    if (token.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, error: new BusinessException('TOKEN_EXPIRED', 'Mã đã hết hạn, nhờ khách làm mới mã trên ứng dụng.') };
    }

    // 3) Xet voucher: con hieu luc (BR-22, het han theo expireAt) va chi nhanh ap dung (BR-07)
    const block = usageBlock(item, now);
    let failure: BusinessException | null = block ? new BusinessException(block.reason, block.message, block.details) : null;
    if (!failure) {
      const allowed = await manager.find(CampaignStore, { where: { campaignId: item.campaignId }, relations: ['store'] });
      if (!allowed.some((cs) => cs.storeId === dto.storeId)) {
        const stores = allowed
          .filter((cs) => cs.store?.status !== false)
          .map((cs) => ({ id: cs.storeId, name: cs.store?.name ?? '', address: cs.store?.address ?? '' }));
        failure = new BusinessException(
          'WRONG_STORE',
          `Voucher không áp dụng tại chi nhánh này. Áp dụng tại: ${stores.map((s) => s.name).join(', ') || 'không có chi nhánh nào'}.`,
          { stores },
        );
      }
    }
    const campaign = await manager.findOneOrFail(VoucherCampaign, { where: { id: item.campaignId } });
    if (!failure && billRequired(campaign.voucherType, dto.billAmount)) {
      // Moi thu deu hop le, chi thieu hoa don: CHUA tieu token de nhan vien nhap hoa don roi gui lai ngay (BR-03)
      return {
        ok: false,
        error: new BusinessException('BILL_REQUIRED', 'Voucher mệnh giá bắt buộc nhập giá trị hóa đơn (BR-03).', {
          voucherType: campaign.voucherType,
          faceValue: Number(campaign.faceValue),
        }),
      };
    }

    // 4) Danh dau token da dung (FR-REDEEM-13: ke ca khi voucher khong hop le, chong thu lai ma o quay khac).
    // UPDATE co dieu kien: ngoai khoa ghi, hai request cung ma thi chi mot request cap nhat duoc
    const col = (name: string) => manager.connection.driver.escape(name);
    const consumed = await manager
      .createQueryBuilder()
      .update(RedeemToken)
      .set({ usedAt: now })
      .where(`${col('id')} = :id`, { id: token.id })
      .andWhere(`${col('usedAt')} IS NULL`)
      .execute();
    if (!consumed.affected) return { ok: false, error: new BusinessException('TOKEN_USED', 'Mã này đã được dùng.') };
    if (failure) return { ok: false, error: failure };

    // 5) Thanh cong: ACTIVE -> USED (co dieu kien, BR-12) + RedemptionLog, vo hieu cac ma con lai cua voucher
    const marked = await manager
      .createQueryBuilder()
      .update(VoucherItem)
      .set({ status: VoucherItemStatus.USED, usedAt: now })
      .where(`${col('id')} = :id`, { id: item.id })
      .andWhere(`${col('status')} = :active`, { active: VoucherItemStatus.ACTIVE })
      .execute();
    if (!marked.affected) return { ok: false, error: await this.alreadyUsedError(manager, item) };
    await manager.update(
      RedeemToken,
      { voucherItemId: item.id, usedAt: IsNull(), revokedAt: IsNull(), id: Not(token.id) },
      { revokedAt: now },
    );
    const log = await manager.save(
      manager.create(RedemptionLog, {
        voucherItemId: item.id,
        storeId: dto.storeId,
        staffUserId,
        billAmount: dto.billAmount ?? null,
        method: 'nonce' in lookup ? RedeemMethod.QR : RedeemMethod.OTP,
      } as Partial<RedemptionLog>),
    );
    const redeemedAt = log.redeemedAt ?? now;

    return {
      ok: true,
      userId: item.userId,
      campaignId: item.campaignId,
      result: {
        message: 'Xác nhận sử dụng thành công.',
        redemptionLogId: log.id,
        voucherItemId: item.id,
        voucherCode: item.code,
        redeemedAt,
        method: log.method,
        billAmount: log.billAmount === null || log.billAmount === undefined ? null : Number(log.billAmount),
        billEditableUntil: new Date(new Date(redeemedAt).getTime() + envInt('BILL_EDIT_WINDOW_MINUTES', 10) * MINUTE),
        campaign: {
          id: campaign.id,
          title: campaign.title,
          voucherType: campaign.voucherType,
          faceValue: Number(campaign.faceValue),
        },
      },
    };
  }

  // "Da dung luc ... tai ..." de nhan vien giai thich cho khach (FR-REDEEM-07)
  private async alreadyUsedError(manager: EntityManager, item: VoucherItem) {
    const log = await manager.findOne(RedemptionLog, { where: { voucherItemId: item.id }, relations: ['store'] });
    const usedAt = log?.redeemedAt ?? item.usedAt;
    const storeName = log?.store?.name ?? null;
    const when = usedAt ? ` lúc ${formatVnDateTime(new Date(usedAt))}` : '';
    const where = storeName ? ` tại ${storeName}` : '';
    return new BusinessException('VOUCHER_USED', `Voucher đã được sử dụng${when}${where}.`, {
      usedAt: usedAt ? new Date(usedAt).toISOString() : null,
      storeId: log?.storeId ?? null,
      storeName,
    });
  }

  // ================= F11 - khoa nhap OTP (FR-REDEEM-12): sai 5 lan / 5 phut -> khoa 15 phut =================

  private async assertOtpNotLocked(staffUserId: string, now: Date) {
    const lockMinutes = envInt('REDEEM_OTP_LOCK_MINUTES', 15);
    const lock = await this.dataSource.getRepository(AuditLog).findOne({
      where: { actorUserId: staffUserId, action: OTP_LOCKED, createdAt: MoreThan(new Date(now.getTime() - lockMinutes * MINUTE)) },
      order: { createdAt: 'DESC' },
    });
    if (!lock) return;
    const lockedUntil = new Date(new Date(lock.createdAt).getTime() + lockMinutes * MINUTE);
    throw this.otpLockedError(lockedUntil);
  }

  private otpLockedError(lockedUntil: Date) {
    return new BusinessException(
      'OTP_LOCKED',
      `Nhập sai OTP quá nhiều lần. Ô nhập OTP bị khóa đến ${formatVnDateTime(lockedUntil)}; vẫn có thể quét mã QR.`,
      { lockedUntil: lockedUntil.toISOString() },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // Ghi lan sai roi nem loi: du nguong thi khoa ngay o lan sai nay, chua du thi bao con bao nhieu lan thu
  private async recordOtpFailure(staffUserId: string, storeId: string): Promise<never> {
    const audit = this.dataSource.getRepository(AuditLog);
    const maxFails = envInt('REDEEM_OTP_MAX_FAILS', 5);
    const windowMinutes = envInt('REDEEM_OTP_FAIL_WINDOW_MINUTES', 5);
    await audit.save(audit.create({ actorUserId: staffUserId, action: OTP_FAILED, entityType: 'Store', entityId: storeId }));
    const now = new Date();
    const fails = await audit.count({
      where: { actorUserId: staffUserId, action: OTP_FAILED, createdAt: MoreThan(new Date(now.getTime() - windowMinutes * MINUTE)) },
    });
    if (fails >= maxFails) {
      await audit.save(
        audit.create({ actorUserId: staffUserId, action: OTP_LOCKED, entityType: 'Store', entityId: storeId, detail: { fails } }),
      );
      throw this.otpLockedError(new Date(now.getTime() + envInt('REDEEM_OTP_LOCK_MINUTES', 15) * MINUTE));
    }
    throw new BusinessException('OTP_INVALID', `Mã OTP không đúng. Còn ${maxFails - fails} lần thử trước khi bị khóa.`, {
      remainingAttempts: maxFails - fails,
    });
  }

  // ================= F11 - hoa don va lich su trong ca (FR-REDEEM-08, FR-REDEEM-10) =================

  // Chi nguoi da xac nhan duoc sua, trong 10 phut ke tu luc xac nhan
  async updateBill(staffUserId: string, logId: string, billAmount: number) {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log || log.staffUserId !== staffUserId) throw new NotFoundException('Không tìm thấy lượt xác nhận.');
    const windowMinutes = envInt('BILL_EDIT_WINDOW_MINUTES', 10);
    const editableUntil = new Date(new Date(log.redeemedAt).getTime() + windowMinutes * MINUTE);
    if (Date.now() > editableUntil.getTime()) {
      throw new BusinessException(
        'BILL_EDIT_EXPIRED',
        `Chỉ sửa được giá trị hóa đơn trong ${windowMinutes} phút sau khi xác nhận.`,
        { editableUntil: editableUntil.toISOString() },
      );
    }
    log.billAmount = billAmount;
    log.billUpdatedAt = new Date();
    await this.logRepo.save(log);
    const [updated] = await this.historyQuery().where('log.id = :id', { id: log.id }).getMany();
    return this.toHistoryItem(updated);
  }

  // FR-AUTH-12: danh sach chi nhanh dang duoc gan (active) cho nhan vien
  async findStaffStores(staffUserId: string) {
    const assignments = await this.staffAssignmentRepo.find({
      where: { userId: staffUserId, active: true, store: { status: true } },
      relations: ['store'],
    });
    return assignments.map((a) => a.store);
  }

  // FR-REDEEM-10: cac lan xac nhan cua chinh nhan vien trong ngay (gio Viet Nam)
  async findStaffHistoryToday(staffUserId: string) {
    const logs = await this.historyQuery()
      .where('log.staffUserId = :staffUserId', { staffUserId })
      .andWhere('log.redeemedAt >= :startOfDay', { startOfDay: startOfVnDay() })
      .orderBy('log.redeemedAt', 'DESC')
      .getMany();
    return logs.map((log) => this.toHistoryItem(log));
  }

  private historyQuery() {
    return this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.voucherItem', 'v')
      .leftJoinAndSelect('v.campaign', 'c')
      .leftJoinAndSelect('log.store', 's');
  }

  private toHistoryItem(log: RedemptionLog) {
    const editableUntil = new Date(new Date(log.redeemedAt).getTime() + envInt('BILL_EDIT_WINDOW_MINUTES', 10) * MINUTE);
    return {
      id: log.id,
      voucherItemId: log.voucherItemId,
      voucherCode: log.voucherItem?.code ?? null,
      campaignTitle: log.voucherItem?.campaign?.title ?? null,
      voucherType: log.voucherItem?.campaign?.voucherType ?? null,
      storeId: log.storeId,
      storeName: log.store?.name ?? null,
      method: log.method,
      billAmount: log.billAmount === null || log.billAmount === undefined ? null : Number(log.billAmount),
      billUpdatedAt: log.billUpdatedAt,
      redeemedAt: log.redeemedAt,
      billEditableUntil: editableUntil,
      billEditable: Date.now() <= editableUntil.getTime(),
    };
  }

  private async notifyUsed(userId: string, voucherItemId: string, campaignId: string, storeId: string) {
    try {
      const [campaign, store] = await Promise.all([
        this.dataSource.getRepository(VoucherCampaign).findOne({ where: { id: campaignId } }),
        this.dataSource.getRepository(Store).findOne({ where: { id: storeId } }),
      ]);
      await this.notifications.voucherUsed(userId, voucherItemId, campaign?.title ?? 'Voucher', store?.name);
    } catch {
      // thong bao la phu, khong tra loi cho nhan vien cua hang
    }
  }
}
