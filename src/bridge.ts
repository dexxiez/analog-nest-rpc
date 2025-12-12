import type { INestApplicationContext, LogLevel, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";

declare global {
  var __NEST_APP_CTX__: INestApplicationContext | undefined;
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
export function createNestBridge(
  AppModule: Type<unknown>,
  options: BridgeOptions = {},
) {
  const {
    logger = ["warn", "error"],
    abortOnError = false,
    globalKey = "__NEST_APP_CTX__",
  } = options;

  return async (nitroApp: {
    hooks: { hook: (event: string, cb: () => Promise<void>) => void };
  }) => {
    console.info("[nest-rpc] Bootstrapping NestJS context...");

    const existing = (globalThis as Record<string, unknown>)[globalKey] as
      | INestApplicationContext
      | undefined;
    if (!existing) {
      const app = await NestFactory.createApplicationContext(AppModule, {
        logger: logger || undefined,
        abortOnError,
      });

      await app.init();

      (globalThis as Record<string, unknown>)[globalKey] = app;

      nitroApp.hooks.hook("close", async () => {
        console.info("[nest-rpc] Shutting down NestJS context...");
        await app.close();
      });
    }
  };
}

/**
 * Gets the NestJS application context from the global store.
 * Throws if not initialized.
 */
export function getNestApp(
  globalKey = "__NEST_APP_CTX__",
): INestApplicationContext {
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
}
