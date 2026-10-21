import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

// Yeu thich (FR-ENGAGE-01). Danh gia nam o ReviewService (F15).
@Injectable()
export class EngageService {
  constructor(@InjectRepository(Favorite) private readonly favoriteRepo: Repository<Favorite>) {}

  // FR-ENGAGE-01
  async toggleFavorite(userId: string, dto: CreateFavoriteDto) {
    const existing = await this.favoriteRepo.findOne({
      where: { userId, targetType: dto.targetType, targetId: dto.targetId },
    });
    if (existing) {
      await this.favoriteRepo.remove(existing);
      return { favorited: false };
    }
    await this.favoriteRepo.save(this.favoriteRepo.create({ userId, ...dto }));
    return { favorited: true };
  }

  listFavorites(userId: string) {
    return this.favoriteRepo.find({ where: { userId } });
  }
}
