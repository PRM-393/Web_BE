import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as entities from './index';

// Dang ky moi entity mot lan (AppModule): autoLoadEntities nap du 25 bang va moi module
// inject duoc Repository cua bat ky entity nao ma khong can khai bao lai forFeature
const allEntities = Object.values(entities);

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(allEntities as any)],
  exports: [TypeOrmModule],
})
export class EntitiesModule {}
