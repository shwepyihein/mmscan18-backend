import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('coin_packages')
export class CoinPackage {
  @ApiProperty({ description: 'Package UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Starter', description: 'Display name' })
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @ApiPropertyOptional({
    example: '100 coins for new users',
    description: 'Optional description shown in UI',
  })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({
    example: 100,
    description: 'Number of coins granted when this package is purchased',
  })
  @Column({ type: 'int' })
  coins: number;

  @ApiProperty({
    example: 4.99,
    description: 'Price in major currency units (e.g. USD)',
  })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: string;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @ApiProperty({
    example: 0,
    description: 'Sort order (lower first)',
  })
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @ApiProperty({ description: 'Whether this package is offered for sale' })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;
}
