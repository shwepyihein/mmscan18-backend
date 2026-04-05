import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CoinPackage } from '../../coin-packages/model/coin-package.entity';
import { User } from '../../users/model/user.entity';

export enum CoinRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('coin_requests')
export class CoinRequest {
  @ApiProperty({ description: 'Coin Request UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty({ description: 'Amount of coins requested' })
  @Column({ type: 'int' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Coin package id when purchase is tied to a catalog package',
  })
  @Column({ type: 'uuid', nullable: true })
  coinPackageId: string | null;

  @ManyToOne(() => CoinPackage, { nullable: true })
  @JoinColumn({ name: 'coinPackageId' })
  coinPackage: CoinPackage | null;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency snapshot at purchase time',
    example: 'USD',
  })
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @ApiPropertyOptional({
    description: 'Fiat amount snapshot at purchase time (major units)',
    example: '4.99',
  })
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  priceAmount: string | null;

  @ApiProperty({
    description: 'Status of the request',
    enum: CoinRequestStatus,
  })
  @Column({
    type: 'enum',
    enum: CoinRequestStatus,
    default: CoinRequestStatus.PENDING,
  })
  status: CoinRequestStatus;

  @ApiPropertyOptional({
    description: 'Optional proof of payment (image URL/path)',
  })
  @Column({ type: 'text', nullable: true })
  proofImageUrl: string | null;

  @ApiPropertyOptional({ description: 'Admin notes' })
  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
