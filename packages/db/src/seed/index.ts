import { createDb } from "../client";
import { seedStructureAttachmentRules } from "./structure-attachment-rules";

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    await seedStructureAttachmentRules(createDb(url));
    console.log("Seeded structure attachment rules");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });