import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchVoucherDto } from './dto/search-voucher.dto';

@ApiTags('search')
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('categories')
  categories() {
    return this.searchService.listCategories();
  }

  @Get('vouchers')
  search(@Query() dto: SearchVoucherDto) {
    return this.searchService.search(dto);
  }

  @Get('vouchers/:id')
  detail(@Param('id') id: string) {
    return this.searchService.detail(id);
  }
}
