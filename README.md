# Majimap

A GIS platform for managing a water utility's distribution network —
reservoirs, pumping stations, valves, junctions, meters, hydrants, and the
pipes connecting them. Visual + reporting focused: this is not a
work-order/ticketing system. Field technicians capture and update asset
data from a mobile app designed to keep working through intermittent or
weekly connectivity.

## Layout

This is a pnpm + Turborepo monorepo.

apps/
web/ Next.js dashboard, network map, and reporting (office/admin use)
native/ Expo app for field technicians (map, asset capture, offline sync)
packages/
shared-types/ Zod schemas + inferred types shared by both apps (source of truth
for node/pipe/condition/role shapes, and shared design constants
like CONDITION_HEX)
db/ Database layer — stub, not wired up yet
auth/ Auth (Better Auth) — stub, not wired up yet
api/ tRPC API layer — stub, not wired up yet


Both apps currently run against local mock data in `apps/*/lib/mock-data.ts`
while `packages/db|auth|api` are built out.

## Stack

- **Web**: Next.js 16, shadcn (Base UI-based generation), Tailwind v4, MapLibre GL JS
- **Native**: Expo (SDK 57) + Expo Router, NativeWind, `@maplibre/maplibre-react-native`
  (requires a custom dev client — this library does not run in Expo Go)
- **Shared**: TypeScript, Zod

⚠️ Several of the above are on newer major versions than most training data
or general documentation reflects (Next 16, a Base UI–flavored shadcn, RN
0.86, TypeScript 6). When in doubt, check the version actually installed
before assuming an API — see `apps/web/AGENTS.md`.

## Getting started

```sh
pnpm install
pnpm dev          # runs web + native together
pnpm dev:web      # web only — http://localhost:3000
pnpm dev:native   # native only — scan the QR with a custom dev client
```

Building the native dev client (required once, and again after adding any
package with native code):

```sh
cd apps/native
npx expo prebuild --clean
npx expo run:android   # or run:ios
```

## Status

Actively in progress. Web has a dashboard, network map (with drawable
zone boundaries), assets list/detail, and an admin users page. Native has
sign-in and a map screen with the same zone/asset features. Not yet built:
real auth, a real database, the add-node/valve/pipeline capture flow, and
the offline sync engine itself.