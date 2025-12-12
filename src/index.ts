// Core exports
export {
  ServerController,
  Action,
  SERVER_ACTION_METADATA,
  SERVER_CONTROLLER_KEY,
} from "./decorators.js";
export type { ServerControllerOptions } from "./decorators.js";

export { createRpcClient, configureRpcClient } from "./client.js";
export type { RpcClientOptions } from "./client.js";

export { createNestBridge, getNestApp } from "./bridge.js";
export type { BridgeOptions } from "./bridge.js";

// Re-export Vite plugin for convenience
export { nestRpcPlugin } from "./vite-plugin.js";
export type { NestRpcPluginOptions } from "./vite-plugin.js";
