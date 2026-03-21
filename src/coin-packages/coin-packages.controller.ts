import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { CoinPackagesService } from './coin-packages.service';
import { CreateCoinPackageDto, UpdateCoinPackageDto } from './dto/coin-package.dto';
import { CoinPackage } from './model/coin-package.entity';

@ApiTags('coin-packages')
@Controller('coin-packages')
export class CoinPackagesController {
  constructor(private readonly coinPackagesService: CoinPackagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active coin packages (public)',
    description:
      'Returns purchasable coin bundles with price and coin amount. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Active packages', type: [CoinPackage] })
  findAllPublic(): Promise<CoinPackage[]> {
    return this.coinPackagesService.findAllPublic();
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all coin packages including inactive (ADMIN)' })
  @ApiResponse({ status: 200, type: [CoinPackage] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAllAdmin(): Promise<CoinPackage[]> {
    return this.coinPackagesService.findAllAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one coin package by id' })
  @ApiParam({ name: 'id', description: 'Package UUID' })
  @ApiResponse({ status: 200, type: CoinPackage })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CoinPackage> {
    return this.coinPackagesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create coin package (ADMIN)' })
  @ApiResponse({ status: 201, type: CoinPackage })
  create(@Body() dto: CreateCoinPackageDto): Promise<CoinPackage> {
    return this.coinPackagesService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update coin package (ADMIN)' })
  @ApiParam({ name: 'id', description: 'Package UUID' })
  @ApiResponse({ status: 200, type: CoinPackage })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCoinPackageDto,
  ): Promise<CoinPackage> {
    return this.coinPackagesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete coin package (ADMIN)' })
  @ApiParam({ name: 'id', description: 'Package UUID' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.coinPackagesService.remove(id);
  }
}
