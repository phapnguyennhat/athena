import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate-limits per signed-in user instead of per IP. Use only on authenticated routes. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(req.user.id);
  }
}
