import { Body, Controller, Post } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('login')
  login(@Body() body: { email: string }): { token: string; email: string } {
    return { token: `mock-jwt-${body.email}`, email: body.email };
  }
}
