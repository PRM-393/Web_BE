import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Settlement } from './settlement.entity';
import { Order } from './order.entity';
import { VoucherItem } from './voucher-item.entity';

// DC-06: mot Order chi xuat hien trong toi da mot SettlementItem
@Entity('settlement_items')
export class SettlementItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  settlementId: string;

  @ManyToOne(() => Settlement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settlementId' })
  settlement: Settlement;

  // DC-06: moi voucher chi nam trong toi da mot phieu doi soat
  @Column({ unique: true })
  voucherItemId: string;

  @ManyToOne(() => VoucherItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'voucherItemId' })
  voucherItem: VoucherItem;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'bigint' })
  amount: number;

  // ty le da chot vao don (Order.commissionRate)
  @Column({ type: 'decimal', precision: 5, scale: 4 })
  commissionRate: number;

  @Column({ type: 'bigint' })
  commissionAmount: number;
}
