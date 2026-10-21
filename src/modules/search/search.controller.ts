import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { LocationDto, SearchVoucherDto } from './dto/search-voucher.dto';

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
  detail(@Param('id', ParseUUIDPipe) id: string, @Query() location: LocationDto) {
    return this.searchService.detail(id, location);
  }
}
