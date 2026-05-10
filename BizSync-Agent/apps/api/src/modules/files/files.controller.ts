import { Body, Controller, Post } from '@nestjs/common';

@Controller('files')
export class FilesController {
  @Post('upload')
  upload(@Body() body: { fileName: string; mimeType: string; companyId: string }): object {
    return { status: 'queued', ...body, maxSizeMb: 20 };
  }
}
