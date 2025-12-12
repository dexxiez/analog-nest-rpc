import type { ArgumentsHost, ExecutionContext, Type } from "@nestjs/common";
import type { H3Event } from "h3";

/**
 * Wraps an H3Event to provide a request-like object that NestJS guards
 * and decorators expect.
 */
export class H3RequestAdapter {
  user: unknown = null;

  constructor(private readonly event: H3Event) {}

  get headers() {
    return this.event.headers;
  }

  get method() {
    return this.event.method;
  }

  get url() {
    return this.event.path;
  }

  get body() {
    return this.event.context.body;
  }

  /**
   * Access the underlying H3Event for H3-specific operations
   */
  get h3Event() {
    return this.event;
  }
}

// Define the host interfaces inline since they're not exported from @nestjs/common
interface HttpArgumentsHost {
  getRequest<T = unknown>(): T;
  getResponse<T = unknown>(): T;
  getNext<T = unknown>(): T;
}

interface RpcArgumentsHost {
  getData<T = unknown>(): T;
  getContext<T = unknown>(): T;
}

interface WsArgumentsHost {
  getData<T = unknown>(): T;
  getClient<T = unknown>(): T;
  getPattern(): string;
}

/**
 * ExecutionContext implementation that bridges H3 events to NestJS's
 * guard and decorator system.
 */
export class H3ExecutionContext implements ExecutionContext {
  private readonly request: H3RequestAdapter;
  private readonly argsArray: unknown[];

  constructor(
    private readonly event: H3Event,
    private readonly controllerClass: Type<unknown>,
    private readonly handlerFn: Function,
    _methodArgs: unknown[] = [],
  ) {
    this.request = new H3RequestAdapter(event);
    this.argsArray = [this.request, null, null];
  }

  getRequest(): H3RequestAdapter {
    return this.request;
  }

  getClass<T = unknown>(): Type<T> {
    return this.controllerClass as Type<T>;
  }

  getHandler(): Function {
    return this.handlerFn;
  }

  getArgs<T extends unknown[] = unknown[]>(): T {
    return this.argsArray as T;
  }

  getArgByIndex<T = unknown>(index: number): T {
    return this.argsArray[index] as T;
  }

  getType<TContext extends string = string>(): TContext {
    return "http" as TContext;
  }

  switchToHttp(): HttpArgumentsHost {
    return {
      getRequest: <T = unknown>(): T => this.request as T,
      getResponse: <T = unknown>(): T => null as T,
      getNext: <T = unknown>(): T => null as T,
    };
  }

  switchToRpc(): RpcArgumentsHost {
    throw new Error("RPC context not supported in H3 adapter");
  }

  switchToWs(): WsArgumentsHost {
    throw new Error("WebSocket context not supported in H3 adapter");
  }
}
