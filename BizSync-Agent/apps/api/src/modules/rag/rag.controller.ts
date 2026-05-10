import { Body, Controller, Post } from '@nestjs/common';

@Controller('rag')
export class RagController {
  @Post('query')
  query(@Body() body: { question: string; language?: string }): { answer: string } {
    const language = body.language ?? 'hinglish';
    return { answer: `[${language}] Demo response for: ${body.question}` };
  }
}
