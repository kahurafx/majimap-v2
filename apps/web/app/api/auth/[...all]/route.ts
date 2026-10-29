import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@majimap/auth";

// Built per request so importing this file never touches DATABASE_URL at build time.
export const GET = (req: Request) => toNextJsHandler(getAuth()).GET(req);
export const POST = (req: Request) => toNextJsHandler(getAuth()).POST(req);