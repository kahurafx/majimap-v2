import { createCallerFactory, router } from "./trpc";
import { gisRouter } from "./gis/router";

export const appRouter = router({
    gis: gisRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);