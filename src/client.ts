import superjson, { type SuperJSONResult } from "superjson";

export interface RpcClientOptions {
  /**
   * RPC endpoint URL for browser requests
   * @default "/api/_nest_rpc"
   */
  endpoint?: string;

  /**
   * RPC endpoint URL for SSR requests (must be absolute)
   * @default "http://localhost:5173/api/_nest_rpc"
   */
  ssrEndpoint?: string;

  /**
   * Custom fetch implementation
   */
  fetch?: typeof fetch;

  /**
   * Additional headers to include with each request
   */
  headers?: Record<string, string>;
}

// Global configuration - can be set once at app startup
let globalOptions: RpcClientOptions = {};

/**
 * Configure global RPC client options
 */
export const configureRpcClient = (options: RpcClientOptions): void => {
  globalOptions = { ...globalOptions, ...options };
};

// Properties to ignore on the proxy
const IGNORED_PROPS = new Set([
  "then",
  "toJSON",
  "toString",
  "constructor",
  "prototype",
  // Angular lifecycle hooks
  "ngOnInit",
  "ngOnDestroy",
  "ngOnChanges",
  "ngDoCheck",
  "ngAfterContentInit",
  "ngAfterContentChecked",
  "ngAfterViewInit",
  "ngAfterViewChecked",
]);

/**
 * Creates an RPC client proxy for a NestJS controller
 */
export const createRpcClient = <T extends object = Record<string, unknown>>(
  controllerName: string,
  options: RpcClientOptions = {},
): T => {
  const mergedOptions = { ...globalOptions, ...options };
  const {
    endpoint = "/api/_nest_rpc",
    ssrEndpoint = "http://localhost:5173/api/_nest_rpc",
    headers: customHeaders = {},
  } = mergedOptions;

  const fetchFn = mergedOptions.fetch ?? fetch;

  return new Proxy({} as T, {
    get(_target, prop: string | symbol) {
      if (typeof prop === "symbol") return undefined;
      if (prop.startsWith("_") || prop.startsWith("ɵ")) return undefined;
      if (IGNORED_PROPS.has(prop)) return undefined;

      return async (...args: unknown[]) => {
        const payload = superjson.stringify({ args });
        const isServer = typeof globalThis.window === "undefined";
        const url = isServer ? ssrEndpoint : endpoint;

        const res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...customHeaders,
          },
          body: JSON.stringify({
            controller: controllerName,
            action: prop,
            data: payload,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(
            `RPC call to ${controllerName}.${prop} failed: ${res.statusText}\n${errorText}`,
          );
        }

        const responseData = (await res.json()) as SuperJSONResult;
        return superjson.deserialize(responseData);
      };
    },
  });
};

export default createRpcClient;
