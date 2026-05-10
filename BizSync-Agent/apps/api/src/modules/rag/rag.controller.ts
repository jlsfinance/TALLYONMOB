import { Body, Controller, Post } from '@nestjs/common';
import { CompareRateRequestDto } from './dto/compare-rate.dto';
import { RateCompareService } from './services/rate-compare.service';

@Controller('rag')
export class RagController {
  constructor(private readonly rateCompareService: RateCompareService) {}

  @Post('query')
  query(@Body() body: { question: string; language?: string }): { answer: string } {
    const language = body.language ?? 'hinglish';
    return { answer: `[${language}] Demo response for: ${body.question}` };
  }

  @Post('compare-item-rate')
  compareItemRate(@Body() body: CompareRateRequestDto): { itemName: string; matches: unknown[]; message: string } {
    return this.rateCompareService.compareItemRates(body);
  }
}
