import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateCoinPackageDto,
  UpdateCoinPackageDto,
} from './dto/coin-package.dto';
import { CoinPackage } from './model/coin-package.entity';

@Injectable()
export class CoinPackagesService {
  constructor(
    @InjectRepository(CoinPackage)
    private readonly coinPackageRepository: Repository<CoinPackage>,
  ) {}

  async findAllPublic(): Promise<CoinPackage[]> {
    return this.coinPackageRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findAllAdmin(): Promise<CoinPackage[]> {
    return this.coinPackageRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CoinPackage> {
    const pkg = await this.coinPackageRepository.findOne({ where: { id } });
    if (!pkg) {
      throw new NotFoundException(`Coin package ${id} not found`);
    }
    return pkg;
  }

  async create(dto: CreateCoinPackageDto): Promise<CoinPackage> {
    const entity = this.coinPackageRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      coins: dto.coins,
      price: dto.price,
      currency: dto.currency ?? 'USD',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return this.coinPackageRepository.save(entity);
  }

  async update(id: string, dto: UpdateCoinPackageDto): Promise<CoinPackage> {
    const pkg = await this.findOne(id);
    Object.assign(pkg, dto);
    return this.coinPackageRepository.save(pkg);
  }

  async remove(id: string): Promise<void> {
    const pkg = await this.findOne(id);
    await this.coinPackageRepository.remove(pkg);
  }
}
