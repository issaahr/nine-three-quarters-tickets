import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  public root(): { ok: true } {
    return { ok: true };
  }
}
