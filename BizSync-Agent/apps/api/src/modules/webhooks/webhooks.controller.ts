import { Body, Controller, Post } from '@nestjs/common';

@Controller('webhooks')
export class WebhooksController {
  @Post('telegram')
  telegram(@Body() body: Record<string, unknown>): object { return { provider: 'telegram', accepted: true, body }; }
  @Post('whatsapp')
  whatsapp(@Body() body: Record<string, unknown>): object { return { provider: 'whatsapp', accepted: true, body }; }
  @Post('imessage')
  imessage(@Body() body: Record<string, unknown>): object { return { provider: 'imessage', accepted: true, body }; }
}
