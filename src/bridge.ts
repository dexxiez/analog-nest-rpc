import type { INestApplicationContext, LogLevel, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";

declare global {
  var __NEST_APP_CTX__: INestApplicationContext | undefined;
  var __NEST_APP_CTX_PROMISE__: Promise<INestApplicationContext> | undefined;
}

export interface BridgeOptions {
  /**
   * NestJS log levels to enable
   * @default ["warn", "error"]
   */
  logger?: LogLevel[] | false;

  /**
   * Whether to abort on DI errors during bootstrap
   * @default false (allows graceful degradation in development)
   */
  abortOnError?: boolean;

  /**
   * Global variable name to store the app context
   * @default "__NEST_APP_CTX__"
   */
  globalKey?: string;
}

/**
 * Creates a Nitro plugin that bootstraps a NestJS application context.
 *
 * @example
 * ```typescript
 * // src/server/plugins/bridge.ts
 * import { createNestBridge } from "analog-nest-rpc";
 * import { AppModule } from "../nest/app.module";
 *
 * export default createNestBridge(AppModule);
 * ```
 */
export const createNestBridge = (
  AppModule: Type<unknown>,
  options: BridgeOptions = {},
) => {
  const {
    logger = ["warn", "error"],
    abortOnError = false,
    globalKey = "__NEST_APP_CTX__",
  } = options;

  // Remove trailing underscores before appending _PROMISE__
  const promiseKey = globalKey.replace(/__$/, "") + "_PROMISE__";

  return async (nitroApp: {
    hooks: { hook: (event: string, cb: () => Promise<void>) => void };
  }) => {
    // Check if already initialized
    const existing = (globalThis as Record<string, unknown>)[globalKey] as
      | INestApplicationContext
      | undefined;
    if (existing) {
      return;
    }

    // Check if bootstrap is already in progress (race condition protection)
    const existingPromise = (globalThis as Record<string, unknown>)[
      promiseKey
    ] as Promise<INestApplicationContext> | undefined;
    if (existingPromise) {
      await existingPromise;
      return;
    }

    console.info("[nest-rpc] Bootstrapping NestJS context...");

    // Create and store the bootstrap promise before awaiting
    const bootstrapPromise = (async () => {
      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: logger || undefined,
        abortOnError,
      });

      await app.init();
      return app;
    })();

    (globalThis as Record<string, unknown>)[promiseKey] = bootstrapPromise;

    try {
      const app = await bootstrapPromise;
      (globalThis as Record<string, unknown>)[globalKey] = app;

      nitroApp.hooks.hook("close", async () => {
        console.info("[nest-rpc] Shutting down NestJS context...");
        await app.close();
        (globalThis as Record<string, unknown>)[globalKey] = undefined;
        (globalThis as Record<string, unknown>)[promiseKey] = undefined;
      });
    } catch (err) {
      // Clear the promise on failure so retry is possible
      (globalThis as Record<string, unknown>)[promiseKey] = undefined;
      throw err;
    }
  };
};

/**
 * Gets the NestJS application context from the global store.
 * Throws if not initialized.
 */
export const getNestApp = (
  globalKey = "__NEST_APP_CTX__",
): INestApplicationContext => {
  const app = (globalThis as Record<string, unknown>)[globalKey] as
    | INestApplicationContext
    | undefined;
  if (!app) {
    throw new Error(
      "[nest-rpc] NestJS app context not initialized. " +
        "Ensure createNestBridge plugin is registered.",
    );
  }
  return app;
};
