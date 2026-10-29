import { config } from 'dotenv';
import { defineConfig } from "drizzle-kit";
import * as path from "node:path";

// config({ path: '.env' });
config({ path: path.resolve(process.cwd(), "../../.env") });

export default defineConfig({
    out: "./drizzle",
    schema: "./src/schema/index.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});