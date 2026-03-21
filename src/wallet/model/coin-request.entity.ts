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
