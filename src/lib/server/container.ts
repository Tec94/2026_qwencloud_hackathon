import "server-only";
import { ThreadlineService } from "@/application/threadline-service";
import { ThreadlineRepository } from "@/infrastructure/database/threadline-repository";
import { createQwenAdapter } from "@/infrastructure/qwen/factory";
import { isStrictProductionRuntime, requireProductionConfig } from "./runtime-config";

export function getServerDependencies() {
  if (isStrictProductionRuntime()) requireProductionConfig();
  const repository = new ThreadlineRepository();
  const qwen = createQwenAdapter();
  return { repository, qwen, service: new ThreadlineService(repository, qwen) };
}
