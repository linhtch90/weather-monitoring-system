---
name: scaffold-microservice
description: >-
  Use this skill when creating a new NestJS microservice application (e.g., query-service,
  notification-service) in the apps/ directory of the weather-monitoring-system monorepo.
---

# Scaffolding a New Microservice in the Monorepo

Follow this checklist to add a new microservice cleanly while maintaining monorepo conventions and architecture diagrams.

## Step 1: Create Application Directory & `tsconfig.app.json`

1. Create `apps/<service-name>/tsconfig.app.json`:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "declaration": false,
       "outDir": "../../dist/apps/<service-name>"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
   }
   ```
2. Create `apps/<service-name>/src/main.ts` and root module `apps/<service-name>/src/<name>.module.ts`.
   - Use `AppLogger` from `@libs/common` for structured JSON logging.
   - Call `app.enableShutdownHooks()` before listening.

## Step 2: Register in `nest-cli.json` and `package.json`

1. Add the project entry under `"projects"` in `nest-cli.json`:
   ```json
   "<service-name>": {
     "type": "application",
     "root": "apps/<service-name>",
     "entryFile": "main",
     "sourceRoot": "apps/<service-name>/src",
     "compilerOptions": {
       "tsConfigPath": "apps/<service-name>/tsconfig.app.json"
     }
   }
   ```
   *(If the service uses gRPC `.proto` files, include the `.proto` asset mapping in `compilerOptions.assets`.)*
2. Add start scripts in `package.json`:
   ```json
   "start:<short-name>": "nest start <service-name>",
   "start:<short-name>:dev": "nest start <service-name> --watch"
   ```

## Step 3: Update Architecture Diagram & Documentation

1. Update `prompt/generate_diagram.py` to include the new service box and connection arrows (use numeric XML entities like `&#8226;`, `&#8594;`, `&#916;`).
2. Regenerate the SVG diagram:
   ```bash
   python3 prompt/generate_diagram.py
   ```
3. Document the new service in `README.md` and `docs/DEVELOPER_GUIDE.md`.

## Step 4: Verification

1. Run `npm run build` to verify TypeScript compilation across the monorepo.
2. Start the new service in watch mode (`npm run start:<short-name>:dev`) and verify clean initialization logs.
