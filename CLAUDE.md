# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

analog-nest-rpc is a compiler-driven RPC bridge between AnalogJS (Angular meta-framework) and NestJS. It enables type-safe communication between Angular components and NestJS controllers without manually writing REST endpoints.

## Common Development Commands

### Build & Development
```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode compilation
npm run format         # Format code with Prettier
npm run prepublishOnly # Pre-publish build hook
```

### Testing
This project currently has no test suite configured in package.json.

## Core Architecture

The library consists of five main subsystems that work together to enable seamless RPC:

### 1. Vite Plugin (src/vite-plugin.ts)
- Scans for `*.controller.ts` files matching the configured glob pattern
- Generates two files at build time:
  - **Registry file** (`.analog/nest-controllers.ts`): Server-side map of controller classes
  - **Tokens file** (`.analog/inject.ts`): Angular DI tokens with typed RPC client proxies
- Transforms controller files during client builds: replaces server code with RPC proxy stubs
- Uses magic-string for source transformations
- **Critical ordering**: Must run BEFORE the `analog()` plugin in vite.config.ts

### 2. Decorators System (src/decorators.ts)
- `@ServerController()`: Class decorator that applies `@Injectable({ scope: Scope.REQUEST })` and stores routing metadata
- `@Action()`: Method decorator marking methods as RPC-callable
- Uses NestJS metadata system (`reflect-metadata`) with custom keys:
  - `ANALOG_NEST_CONTROLLER`: Controller alias for routing
  - `ANALOG_NEST_ACTION`: Marks action methods

### 3. Client Proxy (src/client.ts)
- `createRpcClient<T>()`: Returns a Proxy that intercepts method calls
- Serializes args with SuperJSON (handles Date, Map, Set, BigInt, etc.)
- Detects runtime context (SSR vs browser) and uses appropriate endpoint
- Global configuration via `configureRpcClient()`
- Ignores Angular lifecycle hooks and internal properties (underscore, ɵ prefix, 'then', 'toJSON')

### 4. NestJS Bridge (src/bridge.ts)
- `createNestBridge()`: Returns a Nitro plugin that bootstraps NestJS ApplicationContext
- Stores app context in `globalThis.__NEST_APP_CTX__` for request handlers
- `getNestInstance()`: Retrieves the global app context (throws if not initialized)
- Registers shutdown hook to close NestJS app cleanly

### 5. H3 Integration (src/h3/)
Three files work together to bridge H3 events into NestJS execution contexts:

**execution-context.ts**:
- `H3RequestAdapter`: Wraps H3Event to look like an Express-style request object
- `H3ExecutionContext`: Implements NestJS ExecutionContext interface for guards/decorators

**context.ts**:
- `invokeNestAction()`: Main orchestrator that:
  1. Creates per-request DI context with `ContextIdFactory`
  2. Registers H3Event as REQUEST provider
  3. Resolves controller from DI container (respects REQUEST scope)
  4. Runs guards (class-level + method-level)
  5. Resolves param decorators (e.g., `@CurrentUser()`, `@Request()`)
  6. Invokes the controller method with resolved args

## Important Patterns & Constraints

### Request-Scoped DI
Controllers default to `Scope.REQUEST`. Each RPC call:
1. Gets unique context ID via `ContextIdFactory.create()`
2. Registers H3Event as the REQUEST token
3. Resolves controller with `app.resolve(Controller, contextId)`

This ensures proper isolation for request-scoped dependencies and guards.

### TypeScript Configuration
Must enable decorators in tsconfig.json and vite.config.ts:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Module Exports
The package uses ESM with multiple entry points (package.json exports):
- `.` → Main exports (decorators, client, bridge)
- `./vite` → Vite plugin
- `./client` → Client-only code
- `./h3` → H3 integration utilities

### Peer Dependencies
- Required: `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `superjson`, `vite`
- Optional: `h3` (only if using H3 integration)

## Code Generation Flow

1. **Build Start**: Vite plugin scans for `*.controller.ts` files
2. **Registry Generation**: Creates `.analog/nest-controllers.ts` with imports and exports map
3. **Tokens Generation**: Creates `.analog/inject.ts` with Angular InjectionTokens
4. **Client Transform**: During client builds, replaces controller class bodies with `createRpcClient()` calls
5. **SSR Preservation**: SSR builds skip transformation, keeping original controller code

## Request Flow

**Client → Server**:
1. Angular component injects typed controller token
2. Method call → Proxy intercepts → `fetch()` to `/api/_nest_rpc`
3. POST body: `{ controller: "UserController", action: "getUser", data: superjson.stringify({ args }) }`

**Server Handling**:
1. H3 route handler (`_nest_rpc.post.ts`) receives request
2. Looks up controller class in registry
3. Calls `invokeNestAction(app, ControllerClass, action, args, event)`
4. Returns `superjson.stringify(result)`

## Development Notes

- The `.analog/` directory is auto-generated; never edit manually
- Controllers must have `"reflect-metadata"` import at the top
- Guards and param decorators work exactly like in standard NestJS
- SuperJSON handles non-JSON types transparently
- Debug logging available via `{ debug: true }` in plugin/bridge options
