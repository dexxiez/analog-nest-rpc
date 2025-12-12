import { Injectable, Scope, SetMetadata } from "@nestjs/common";

export const SERVER_ACTION_METADATA = "ANALOG_NEST_ACTION";
export const SERVER_CONTROLLER_KEY = "ANALOG_NEST_CONTROLLER";

export interface ServerControllerOptions {
  /**
   * Optional custom name for RPC routing
   */
  alias?: string;

  /**
   * DI scope for the controller
   * @default Scope.REQUEST
   */
  scope?: Scope;
}

/**
 * Marks a class as a server-side controller accessible via RPC.
 * Automatically applies @Injectable() with REQUEST scope.
 */
export function ServerController(
  pathOrOptions?: string | ServerControllerOptions,
): ClassDecorator {
  return (target: Function) => {
    const options =
      typeof pathOrOptions === "string"
        ? { alias: pathOrOptions }
        : (pathOrOptions ?? {});

    // Apply NestJS Injectable with specified scope (default: REQUEST)
    Injectable({ scope: options.scope ?? Scope.REQUEST })(target);

    // Add metadata for RPC routing
    const alias = options.alias || target.name;
    SetMetadata(SERVER_CONTROLLER_KEY, alias)(target);
  };
}

/**
 * Marks a method as an RPC action that can be called from the client.
 */
export function Action(): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (descriptor?.value) {
      SetMetadata(SERVER_ACTION_METADATA, true)(descriptor.value);
    }
    return descriptor;
  };
}
