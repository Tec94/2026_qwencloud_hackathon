import { ThreadlineRepository } from "../src/infrastructure/database/threadline-repository";

const cleaned = new ThreadlineRepository().cleanupExpired();
process.stdout.write(`${JSON.stringify({ ok: true, cleaned })}\n`);
