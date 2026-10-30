import { createCallerFactory, router } from "./trpc";
import { attachmentsRouter } from "./attachments";
import { gisRouter } from "./gis/router";
import { modulesRouter } from "./modules";
import { workOrdersRouter } from "./work-orders/router";

export const appRouter = router({
    gis: gisRouter,
    workOrders: workOrdersRouter,
    attachments: attachmentsRouter,
    modules: modulesRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);