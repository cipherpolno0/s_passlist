import {backfillRetainedStatistics} from '../lib/statistics-source-service';
import {backfillProvinceRegions} from '../lib/province-region-backfill';
import {backfillVassa} from '../lib/vassa-backfill';
import {backfillExamAges} from '../lib/exam-age-backfill';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import {bootstrapOrganizationRegistry} from '../lib/organization-registry-bootstrap';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response=await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    if(env.DB)ctx.waitUntil(bootstrapOrganizationRegistry(env.DB).catch(error=>console.error('Organization registry bootstrap',error)));
    if(env.DB&&env.BUCKET)ctx.waitUntil(backfillExamAges(env.DB,env.BUCKET).catch(error=>console.error('Exam age backfill',error)));
    if(env.DB&&env.BUCKET)ctx.waitUntil(backfillVassa(env.DB,env.BUCKET).catch(error=>console.error('Vassa backfill',error)));
    if(env.DB&&env.BUCKET)ctx.waitUntil(backfillRetainedStatistics(env.DB,env.BUCKET,{background:true}).catch(error=>console.error('Retained statistics backfill',error)));
    if(env.DB)ctx.waitUntil(backfillProvinceRegions(env.DB).catch(error=>console.error('Province region backfill',error)));
    return response;
  },
};
