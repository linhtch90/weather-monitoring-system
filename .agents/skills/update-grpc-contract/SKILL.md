---
name: update-grpc-contract
description: >-
  Use this skill when adding or modifying gRPC services, RPC methods, or Protocol Buffer
  messages in station.proto or telemetry.proto, or when wiring new gRPC clients and controllers.
---

# Updating gRPC Contracts & Protobuf Definitions

Follow these steps whenever modifying or extending synchronous gRPC contracts in the monorepo.

## Step 1: Update the `.proto` Schema

1. Edit the appropriate Protocol Buffer definition in `libs/contracts/src/proto/`:
   - Station registry & frequency management: `libs/contracts/src/proto/station.proto` (`package weather.station.v1`)
   - Telemetry ingestion: `libs/contracts/src/proto/telemetry.proto` (`package weather.telemetry.v1`)
2. Keep field names in `snake_case` (the gRPC loader is configured with `keepCase: true`).

## Step 2: Sync TypeScript Interfaces in `@libs/contracts`

1. Open `libs/contracts/src/index.ts`.
2. Add or update the corresponding TypeScript request/response interfaces and enums to match the `.proto` file exactly.
3. If adding a brand-new `.proto` file, export its package constant and path using `resolveProtoPath('<name>.proto')`:
   ```typescript
   export const MY_NEW_PROTO_PATH = resolveProtoPath('my-new.proto');
   ```

## Step 3: Implement the gRPC Server Handler

1. In the target microservice controller (e.g., `apps/station-service/src/station.controller.ts`), decorate the handler with `@GrpcMethod('<ServiceName>', '<RpcMethodName>')`:
   ```typescript
   @GrpcMethod('StationService', 'MyNewMethod')
   async myNewMethod(data: MyNewRequest): Promise<MyNewResponse> {
     return this.stationService.myNewMethod(data);
   }
   ```

## Step 4: Wire the gRPC Client Stub with Circuit Breaker

1. In the calling service's client wrapper (e.g., `apps/ingestion-service/src/grpc-clients/station-grpc.client.ts`):
   - Add the method returning `Observable<ResponseType>` to the local `StationGrpcService` interface (using `camelCase` for the method name).
   - Wrap the `firstValueFrom(this.grpcService.myNewMethod(req))` call inside `createCircuitBreaker()` from `@libs/common` with a graceful fallback.

## Step 5: Verification

1. Ensure the TypeScript build succeeds with zero errors:
   ```bash
   npm run build
   ```
2. Test the gRPC method directly using `grpcurl` against the running service (`:50051` for `station-service`, `:50052` for `ingestion-service`).
