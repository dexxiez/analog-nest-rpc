import type {
  CanActivate,
  INestApplicationContext,
  Type,
} from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { ContextIdFactory, Reflector } from "@nestjs/core";
import type { H3Event } from "h3";
import "reflect-metadata";

import { H3ExecutionContext } from "./execution-context.js";

// NestJS route argument types
const enum RouteParamtypes {
  REQUEST = 0,
  RESPONSE = 1,
  NEXT = 2,
  BODY = 3,
  QUERY = 4,
  PARAM = 5,
  HEADERS = 6,
  SESSION = 7,
  FILE = 8,
  FILES = 9,
  HOST = 10,
  IP = 11,
  CUSTOM = 99,
}

export interface InvokeOptions {
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Invokes a NestJS controller action within the H3 request context.
 * Handles DI resolution, guards, and param decorators.
 */
export async function invokeNestAction(
  app: INestApplicationContext,
  ControllerClass: Type<unknown>,
  methodName: string,
  args: unknown[],
  event: H3Event,
  options: InvokeOptions = {},
): Promise<unknown> {
  const { debug = false } = options;
  const log = (...logArgs: unknown[]) => {
    if (debug) console.log("[nest-rpc]", ...logArgs);
  };

  // Create unique context ID for this request
  const contextId = ContextIdFactory.create();

  // Register the H3Event as the REQUEST object
  app.registerRequestByContextId(event, contextId);

  // Resolve the controller from the container
  log("Resolving controller:", ControllerClass.name);
  const controller = await app.resolve(ControllerClass, contextId, {
    strict: false,
  });

  // Verify method exists
  const handler = (controller as Record<string, unknown>)[methodName];
  if (typeof handler !== "function") {
    throw new Error(`Method ${methodName} not found on controller`);
  }

  // Create execution context for guards and decorators
  const executionContext = new H3ExecutionContext(
    event,
    ControllerClass,
    handler as Function,
    args,
  );

  // Run guards
  await runGuards(
    app,
    ControllerClass,
    methodName,
    executionContext,
    contextId,
    log,
  );

  // Resolve param decorators
  const resolvedArgs = resolveParamDecorators(
    ControllerClass,
    methodName,
    executionContext,
    args,
  );

  // Invoke the action
  log("Invoking method:", methodName);
  return (controller as Record<string, Function>)[methodName](...resolvedArgs);
}

async function runGuards(
  app: INestApplicationContext,
  controllerClass: Type<unknown>,
  methodName: string,
  context: H3ExecutionContext,
  contextId: { id: number },
  log: (...args: unknown[]) => void,
): Promise<void> {
  const reflector = app.get(Reflector);

  // Get guards from class and method metadata
  const classGuards =
    reflector.get<Type<CanActivate>[]>(GUARDS_METADATA, controllerClass) ?? [];

  const methodDescriptor = (
    controllerClass.prototype as Record<string, unknown>
  )[methodName];
  const methodGuards =
    reflector.get<Type<CanActivate>[]>(
      GUARDS_METADATA,
      methodDescriptor as Function,
    ) ?? [];

  const allGuards = [...classGuards, ...methodGuards];
  log(`Running ${allGuards.length} guards`);

  for (const GuardClass of allGuards) {
    let guard: CanActivate;
    try {
      guard = await app.resolve(GuardClass, contextId, { strict: false });
    } catch {
      guard = new (GuardClass as new () => CanActivate)();
    }

    const canActivate = await guard.canActivate(context);
    if (!canActivate) {
      throw new ForbiddenException("Access denied by guard");
    }
  }
}

function resolveParamDecorators(
  controllerClass: Type<unknown>,
  methodName: string,
  context: H3ExecutionContext,
  rpcArgs: unknown[],
): unknown[] {
  const metadata: Record<
    string,
    { index: number; data?: unknown; factory?: Function }
  > =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, controllerClass, methodName) || {};

  if (Object.keys(metadata).length === 0) {
    return rpcArgs;
  }

  const resolvedArgs: unknown[] = [];
  let maxIndex = -1;

  for (const key of Object.keys(metadata)) {
    const paramIndex = metadata[key].index;
    if (paramIndex > maxIndex) maxIndex = paramIndex;
  }

  for (let i = 0; i <= maxIndex; i++) {
    resolvedArgs[i] = undefined;
  }

  const decoratorIndices = new Set<number>();

  for (const key of Object.keys(metadata)) {
    const { index, data, factory } = metadata[key];
    decoratorIndices.add(index);

    const isCustomDecorator = key.includes("__customRouteArgs__");

    if (isCustomDecorator && factory) {
      resolvedArgs[index] = factory(data, context);
    } else {
      const [paramTypeStr] = key.split(":");
      const paramType = parseInt(paramTypeStr, 10);

      switch (paramType) {
        case RouteParamtypes.REQUEST:
          resolvedArgs[index] = context.getRequest();
          break;
        default:
          break;
      }
    }
  }

  let rpcArgIndex = 0;
  for (let i = 0; i <= maxIndex; i++) {
    if (!decoratorIndices.has(i) && rpcArgIndex < rpcArgs.length) {
      resolvedArgs[i] = rpcArgs[rpcArgIndex++];
    }
  }

  while (rpcArgIndex < rpcArgs.length) {
    resolvedArgs.push(rpcArgs[rpcArgIndex++]);
  }

  return resolvedArgs;
}
