import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { UpdateProfileDto } from './profile.dto';

// Anh dai dien luu dang data URL (image/jpeg | image/png, base64), toi da 2 MB anh goc (F17, FR-AUTH-05).
// Khong dung o dia cua may chu: Render xoa file moi lan deploy.
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_PATTERN = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

export function assertAvatar(avatar: string) {
  const match = AVATAR_PATTERN.exec(avatar);
  if (!match) throw new BadRequestException('Ảnh đại diện chỉ nhận JPG hoặc PNG.');
  const bytes = Math.floor((match[2].length * 3) / 4);
  if (bytes > MAX_AVATAR_BYTES) throw new BadRequestException('Ảnh đại diện tối đa 2 MB.');
}

// F17 / FR-AUTH-05: khach xem va cap nhat ho so cua chinh minh
@Injectable()
export class ProfileService {
  constructor(@InjectRepository(User) private readonly userRepo: Repository<User>) {}

  async me(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    const { id, email, fullName, phone, avatar, role, createdAt } = user;
    return { id, email, fullName, phone, avatar, role, createdAt };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim();
    if (dto.avatar !== undefined) {
      if (dto.avatar) assertAvatar(dto.avatar);
      user.avatar = dto.avatar || (null as unknown as string);
    }
    await this.userRepo.save(user);
    return this.me(userId);
  }
}
