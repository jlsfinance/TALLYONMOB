import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { FilesController } from './files/files.controller';
import { RagController } from './rag/rag.controller';
import { AnalyticsController } from './analytics/analytics.controller';
import { WebhooksController } from './webhooks/webhooks.controller';

@Module({ controllers: [AuthController, FilesController, RagController, AnalyticsController, WebhooksController] })
export class AppModule {}
