import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { NotificationSetting } from '../../entities/notification-setting.entity';
import { DeviceToken } from '../../entities/device-token.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { Favorite } from '../../entities/favorite.entity';
import { FavoriteTargetType, VoucherItemStatus } from '../../common/enums/status.enum';
import { PaginationQueryDto, skipTake, toPage } from '../../common/dto/pagination.dto';
import { PushSender } from './push-sender';

// Nhom thong bao: khach bat / tat theo tung nhom (NotificationSetting.type)
export const NotificationType = {
  VOUCHER_ISSUED: 'VOUCHER_ISSUED',
  VOUCHER_USED: 'VOUCHER_USED',
  REFUND_RESULT: 'REFUND_RESULT',
  VOUCHER_EXPIRING: 'VOUCHER_EXPIRING',
  CAMPAIGN_NEW: 'CAMPAIGN_NEW',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  VOUCHER_ISSUED: 'Voucher đã phát hành',
  VOUCHER_USED: 'Voucher đã sử dụng',
  REFUND_RESULT: 'Kết quả hoàn tiền',
  VOUCHER_EXPIRING: 'Nhắc voucher sắp hết hạn',
  CAMPAIGN_NEW: 'Chiến dịch mới của thương hiệu theo dõi',
};

export interface NotifyInput {
  title: string;
  body: string;
  data?: Record<string, string>;
  // Cung khoa -> chi gui mot lan (chong gui trung theo su kien, doi tuong)
  dedupeKey?: string;
}

const DAY = 24 * 60 * 60 * 1000;

// F16: dich vu thong bao dung chung. Cac tinh nang khac chi goi notify(userId, type, input).
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationSetting) private readonly settingRepo: Repository<NotificationSetting>,
    @InjectRepository(DeviceToken) private readonly deviceRepo: Repository<DeviceToken>,
    @InjectRepository(VoucherItem) private readonly voucherRepo: Repository<VoucherItem>,
    @InjectRepository(Favorite) private readonly favoriteRepo: Repository<Favorite>,
    private readonly push: PushSender,
  ) {}

  // Luu thong bao + day FCM neu co. Tra ve null khi bi bo qua (khach tat nhom thong bao / da gui truoc do).
  // Khong bao gio nem loi ra ngoai: thong bao hong khong duoc lam hong giao dich mua / redeem / hoan tien.
  async notify(userId: string, type: NotificationType, input: NotifyInput): Promise<Notification | null> {
    try {
      const setting = await this.settingRepo.findOne({ where: { userId, type } });
      if (setting && !setting.enabled) return null;
      if (input.dedupeKey && (await this.notificationRepo.exist({ where: { dedupeKey: input.dedupeKey } }))) return null;

      const saved = await this.notificationRepo.save(
        this.notificationRepo.create({
          userId,
          type,
          title: input.title,
          body: input.body,
          data: input.data ?? null,
          dedupeKey: input.dedupeKey ?? null,
        }),
      );
      const devices = await this.deviceRepo.find({ where: { userId } });
      await this.push.send(
        devices.map((d) => d.token),
        { title: input.title, body: input.body, data: { type, notificationId: saved.id, ...(input.data ?? {}) } },
      );
      return saved;
    } catch (e) {
      this.logger.warn(`Khong gui duoc thong bao ${type} cho ${userId}: ${(e as Error).message}`);
      return null;
    }
  }

  // ---- Su kien nghiep vu dung san cho cac tinh nang ----

  // F09: voucher phat hanh sau thanh toan
  vouchersIssued(userId: string, orderId: string, campaignTitle: string, quantity: number) {
    return this.notify(userId, NotificationType.VOUCHER_ISSUED, {
      title: 'Voucher đã về ví',
      body: `${quantity} voucher "${campaignTitle}" đã sẵn sàng sử dụng.`,
      data: { orderId },
      dedupeKey: `VOUCHER_ISSUED:${orderId}`,
    });
  }

  // F11: voucher duoc xac nhan su dung tai cua hang
  voucherUsed(userId: string, voucherItemId: string, campaignTitle: string, storeName?: string) {
    return this.notify(userId, NotificationType.VOUCHER_USED, {
      title: 'Đã sử dụng voucher',
      body: storeName ? `"${campaignTitle}" đã được sử dụng tại ${storeName}.` : `"${campaignTitle}" đã được sử dụng.`,
      data: { voucherItemId },
      dedupeKey: `VOUCHER_USED:${voucherItemId}`,
    });
  }

  // F12: ket qua hoan tien (dedupe theo yeu cau + trang thai)
  refundResult(userId: string, refId: string, status: string, message: string) {
    return this.notify(userId, NotificationType.REFUND_RESULT, {
      title: 'Kết quả hoàn tiền',
      body: message,
      data: { refundId: refId, status },
      dedupeKey: `REFUND_RESULT:${refId}:${status}`,
    });
  }

  // F08: chien dich moi cua thuong hieu khach dang theo doi
  async campaignPublished(campaign: { id: string; brandId: string; title: string }, brandName: string) {
    const followers = await this.favoriteRepo.find({
      where: { targetType: FavoriteTargetType.BRAND, targetId: campaign.brandId },
    });
    for (const f of followers) {
      await this.notify(f.userId, NotificationType.CAMPAIGN_NEW, {
        title: `${brandName} có ưu đãi mới`,
        body: campaign.title,
        data: { campaignId: campaign.id },
        dedupeKey: `CAMPAIGN_NEW:${campaign.id}:${f.userId}`,
      });
    }
    return followers.length;
  }

  // FR-ENGAGE-07: nhac voucher ACTIVE sap het han truoc 7 ngay va 1 ngay (job hang ngay)
  async remindExpiringVouchers(now = new Date()): Promise<number> {
    let sent = 0;
    for (const days of [7, 1]) {
      const vouchers = await this.voucherRepo.find({
        where: {
          status: VoucherItemStatus.ACTIVE,
          expireAt: Between(new Date(now.getTime() + (days - 1) * DAY), new Date(now.getTime() + days * DAY)),
        },
        relations: ['campaign'],
      });
      for (const v of vouchers) {
        const n = await this.notify(v.userId, NotificationType.VOUCHER_EXPIRING, {
          title: days === 1 ? 'Voucher hết hạn ngày mai' : 'Voucher sắp hết hạn',
          body: `"${v.campaign?.title ?? v.code}" còn ${days} ngày sử dụng.`,
          data: { voucherItemId: v.id },
          dedupeKey: `VOUCHER_EXPIRING:${days}:${v.id}`,
        });
        if (n) sent++;
      }
    }
    if (sent) this.logger.log(`Da nhac ${sent} voucher sap het han`);
    return sent;
  }

  // ---- API cho app ----

  async listMine(userId: string, q: PaginationQueryDto) {
    const page = toPage(
      await this.notificationRepo.findAndCount({ where: { userId }, order: { createdAt: 'DESC' }, ...skipTake(q) }),
      q,
    );
    const unread = await this.notificationRepo.count({ where: { userId, readAt: IsNull() } });
    return { ...page, unread };
  }

  async markRead(userId: string, id: string) {
    const n = await this.notificationRepo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException('Khong tim thay thong bao.');
    if (!n.readAt) {
      n.readAt = new Date();
      await this.notificationRepo.save(n);
    }
    return n;
  }

  async markAllRead(userId: string) {
    const result = await this.notificationRepo.update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return { updated: result.affected ?? 0 };
  }

  // Moi nhom kem trang thai bat / tat; chua co dong cai dat = dang bat
  async getSettings(userId: string) {
    const rows = await this.settingRepo.find({ where: { userId } });
    return (Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((type) => ({
      type,
      label: NOTIFICATION_TYPE_LABELS[type],
      enabled: rows.find((r) => r.type === type)?.enabled ?? true,
    }));
  }

  async updateSetting(userId: string, type: NotificationType, enabled: boolean) {
    await this.settingRepo.save(this.settingRepo.create({ userId, type, enabled }));
    return this.getSettings(userId);
  }

  async registerDeviceToken(userId: string, token: string, platform: string) {
    const existing = await this.deviceRepo.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      return this.deviceRepo.save(existing);
    }
    return this.deviceRepo.save(this.deviceRepo.create({ userId, token, platform }));
  }
}
