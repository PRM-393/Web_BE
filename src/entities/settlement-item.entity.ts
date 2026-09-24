import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Settlement } from './settlement.entity';
import { Order } from './order.entity';

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

  @Column({ unique: true })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'bigint' })
  amount: number;

  @Column({ type: 'bigint' })
  commissionAmount: number;
}
