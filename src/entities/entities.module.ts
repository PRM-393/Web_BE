import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as entities from './index';

// Danh sach entity dung chung cho toan bo module, import mot lan trong AppModule
const allEntities = Object.values(entities);

@Module({
  imports: [TypeOrmModule.forFeature(allEntities as any)],
  exports: [TypeOrmModule],
})
export class EntitiesModule {}
