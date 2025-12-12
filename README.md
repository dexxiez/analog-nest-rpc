# analog-nest-rpc

Compiler-driven RPC bridge between AnalogJS (Angular meta-framework) and NestJS. Enables type-safe communication between Angular components and NestJS controllers without writing REST endpoints.

## Installation

```bash
npm install analog-nest-rpc
# or
pnpm add analog-nest-rpc
```

### Peer Dependencies

```bash
npm install @nestjs/common @nestjs/core reflect-metadata superjson h3
```

## Quick Start

### 1. Configure Vite

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import analog from "@analogjs/platform";
import { nestRpcPlugin } from "analog-nest-rpc/vite";

export default defineConfig({
  plugins: [
    nestRpcPlugin(), // Must come BEFORE analog()
    analog(),
  ],
  ssr: {
    external: ["@nestjs/common", "@nestjs/core", "reflect-metadata"],
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
});
```

### 2. Create Bridge Plugin

```typescript
// src/server/plugins/bridge.ts
import { createNestBridge } from "analog-nest-rpc";
import { AppModule } from "../nest/app.module";

export default createNestBridge(AppModule);
```

### 3. Create RPC Endpoint

```typescript
// src/server/routes/api/_nest_rpc.post.ts
import { createError, defineEventHandler, readBody } from "h3";
import superjson from "superjson";
import { getNestInstance } from "analog-nest-rpc";
import { invokeNestAction } from "analog-nest-rpc/h3";
import { controllers } from "../../../../.analog/nest-controllers";

export default defineEventHandler(async (event) => {
  const { controller, action, data } = await readBody(event);
  const { args } = superjson.parse(data);

  const ControllerClass = controllers[controller];
  if (!ControllerClass) {
    throw createError({ statusCode: 404, statusMessage: "Controller not found" });
  }

  const result = await invokeNestAction(getNestInstance(), ControllerClass, action, args, event);
  return superjson.stringify(result);
});
```

### 4. Create a Controller

```typescript
// src/server/nest/user.controller.ts
import "reflect-metadata";
import { Injectable } from "@nestjs/common";
import { ServerController, Action } from "analog-nest-rpc";

@Injectable()
@ServerController()
export class UserController {
  @Action()
  async getUser(id: string) {
    return { id, name: "John Doe" };
  }
}
```

### 5. Register in AppModule

```typescript
// src/server/nest/app.module.ts
import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";

@Module({
  providers: [UserController],
})
export class AppModule {}
```

### 6. Configure Path Alias (Recommended)

Add a path alias for cleaner imports. In `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "#server/*": [".analog/*"]
    }
  }
}
```

And in `vite.config.ts`:

```typescript
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "#server": resolve(__dirname, ".analog"),
    },
  },
});
```

### 7. Use from Angular

The plugin auto-generates injection tokens at `.analog/inject.ts`:

```typescript
// src/app/pages/user.page.ts
import { Component, inject } from "@angular/core";
import { UserController } from "#server/inject";

@Component({
  template: `<pre>{{ user | json }}</pre>`,
})
export default class UserPage {
  private ctrl = inject(UserController);
  user = this.ctrl.getUser("123");
}
```

That's it! The generated tokens handle all the boilerplate.

## API Reference

### Vite Plugin

```typescript
import { nestRpcPlugin } from "analog-nest-rpc/vite";

nestRpcPlugin({
  controllersGlob: "src/**/*.controller.ts", // File pattern
  registryPath: ".analog/nest-controllers.ts", // Generated registry (server)
  tokensPath: ".analog/inject.ts",             // Generated Angular tokens (client)
  clientImport: "analog-nest-rpc/client",      // Client import path
  angularCoreImport: "@angular/core",          // Angular import path
  debug: false,                                 // Enable logging
});
```

Set `tokensPath: false` to disable Angular token generation.

### Decorators

```typescript
import { ServerController, Action } from "analog-nest-rpc";

@ServerController()           // Default: uses class name
@ServerController("MyAlias")  // Custom alias for RPC routing
@ServerController({ alias: "MyAlias", scope: Scope.DEFAULT })

@Action()  // Marks method as callable via RPC
```

### Client

```typescript
import { createRpcClient, configureRpcClient } from "analog-nest-rpc/client";

// Global configuration (call once at app startup)
configureRpcClient({
  endpoint: "/api/_nest_rpc",
  ssrEndpoint: "http://localhost:5173/api/_nest_rpc",
  headers: { "X-Custom": "value" },
});

// Create client proxy
const client = createRpcClient<MyController>("MyController");
```

### Bridge

```typescript
import { createNestBridge, getNestInstance} from "analog-nest-rpc";

// Create Nitro plugin
export default createNestBridge(AppModule, {
  logger: ["warn", "error"],
  abortOnError: false,
});

// Get app context anywhere
const app = getNestInstance();
```

### H3 Integration

```typescript
import { invokeNestAction, H3ExecutionContext } from "analog-nest-rpc/h3";

// Invoke controller action with H3 event
const result = await invokeNestAction(app, Controller, "method", args, event);
```

## Features

- **Type-safe RPC**: Full TypeScript support with type inference
- **Request-scoped DI**: Each request gets its own dependency injection context
- **Guards support**: Use `@UseGuards()` with custom guards
- **Param decorators**: Custom decorators like `@CurrentUser()` work correctly
- **SuperJSON serialization**: Handles Date, Map, Set, BigInt, and more

## License

MIT
