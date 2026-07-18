import { getDatabase, migrateDatabase } from "../src/infrastructure/database/database";

const database = getDatabase();
migrateDatabase(database.sqlite);
process.stdout.write(`${JSON.stringify({ ok: true, database: database.filename })}\n`);
