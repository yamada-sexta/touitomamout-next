import { DEBUG } from "env";
import { debug } from "utils/logs";
import z from "zod";

const MisskeyRateLimitErrorSchema = z.object({
  code: z.literal("RATE_LIMIT_EXCEEDED"),
  message: z.string(),
  info: z.object({
    resetMs: z.number(),
  }),
});

export async function withRateLimitRetry<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  ...args: TArgs
): Promise<TResult> {
  while (true) {
    try {
      return await fn(...args);
    } catch (error) {
      const parsed = MisskeyRateLimitErrorSchema.safeParse(error);

      if (!parsed.success) {
        throw error; // Not a rate limit error
      }

      const { resetMs } = parsed.data.info;
      const waitTime = resetMs - Date.now();

      if (waitTime > 0) {
        debug(
          `[Misskey] Rate limit exceeded. Waiting ${Math.ceil(waitTime / 1000)}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      // Then loop again and retry
    }
  }
}

export async function handleRateLimit(error: unknown): Promise<boolean> {
  const parsed = MisskeyRateLimitErrorSchema.safeParse(error);

  if (!parsed.success) {
    return false; // Not a rate limit error
  }

  const { resetMs } = parsed.data.info;
  const waitTime = resetMs - Date.now();

  if (waitTime > 0) {
    if (DEBUG) {
      console.log(
        `[Misskey] Rate limit exceeded. Waiting ${Math.ceil(waitTime / 1000)}s...`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  return true;
}
