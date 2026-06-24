import { Body, Controller, Post } from '@nestjs/common';

@Controller('analytics')
export class AnalyticsController {
  @Post('summary')
  summary(@Body() body: { prompt: string }): object {
    return { prompt: body.prompt, topItems: [], gstSummary: {}, generatedAt: new Date().toISOString() };
  }
}
