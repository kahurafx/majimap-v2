import { handleTrpcRequest } from "@majimap/api";
import { getDb } from "@majimap/db";
import { getApiSession } from "@majimap/auth";

const handler = (req: Request) => handleTrpcRequest(req, { db: getDb(), getSession: getApiSession });
export { handler as GET, handler as POST };1