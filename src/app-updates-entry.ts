/** Isolated staging entrypoint: validates update changes without deploying unrelated app work. */
import { handleAppUpdateRequest, maintainAppUpdates } from './app-updates';
import type { Env } from './types';
export default {
 async fetch(request: Request, env: Env) {
  const response = await handleAppUpdateRequest(request, env);
  if (response) return response;
  return env.ASSETS.fetch(request);
 },
 scheduled(_event: ScheduledController, env: Env, context: ExecutionContext) { context.waitUntil(maintainAppUpdates(env)); },
} satisfies ExportedHandler<Env>;
