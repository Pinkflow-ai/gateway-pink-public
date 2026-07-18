export interface WindowResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface WindowLimiter {
  check(key: string, limit: number, now?: number, requestId?: string): WindowResult | Promise<WindowResult>;
}
