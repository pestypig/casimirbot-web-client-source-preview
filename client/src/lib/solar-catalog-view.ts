import {z} from 'zod';
import {patrolReportSchema,patrolWindowSchema} from '@shared/solar-patrol';

/** Presentation parsing only; neither retained hashes nor scientific meaning are verified here. */
const utc=z.string().datetime({offset:true});
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const eventSchema=z.object({ivorn:z.string().min(1).max(2048),event_type:z.string().min(1).max(32),
  start:utc,end:utc.optional(),u:z.number().finite().optional(),v:z.number().finite().optional(),
  hpc_x:z.number().finite().optional(),hpc_y:z.number().finite().optional(),goes_class:z.string().max(80).optional(),
  observatory:z.string().max(500).optional(),frm_name:z.string().max(500).optional(),
  references:z.array(z.object({name:z.string().max(500).nullable(),type:z.string().max(100),url:z.string().max(4096)})).max(128).nullish(),
});
const dailyCatalogSchema=z.object({ok:z.literal(true),mode:z.enum(['rolling24h','utcDay']),windowStartUtc:utc,windowEndUtc:utc,
  eventTypes:z.array(z.string().max(32)).max(64).optional(),complete:z.boolean(),refreshFailed:z.boolean(),archivedOnly:z.boolean().optional(),
  events:z.array(eventSchema).max(2000),reel:z.object({reelId:hash,windowStartUtc:utc,windowEndUtc:utc,
    sources:z.array(z.object({ivorn:z.string().max(2048)})).max(2000),
    unavailableSources:z.array(z.object({ivorn:z.string().max(2048),reason:z.string().max(1000)})).max(2000).optional()}).nullable(),
});
export type SolarDailyCatalogView=z.infer<typeof dailyCatalogSchema>;
export function readDailySolarCatalog(value:unknown,dayUtc:string|null){
  const next=dailyCatalogSchema.parse(value),start=Date.parse(next.windowStartUtc),end=Date.parse(next.windowEndUtc);
  if(end-start!==86400_000||next.mode!==(dayUtc?'utcDay':'rolling24h')||
    (dayUtc&&start!==Date.parse(`${dayUtc}T00:00:00Z`)))throw Error('Daily catalog window mismatch');
  return next;
}
const patrolCatalogSchema=z.object({ok:z.literal(true),schema:z.literal('casimir.public_solar_patrol.v1'),window:patrolWindowSchema,
  reports:z.array(patrolReportSchema).max(256),coverage:z.object({status:z.enum(['complete','unavailable','retained_only']),fetchedAt:utc.nullable().optional()}),
  reels:z.array(z.object({reelId:hash,outputSha256:hash,windowStartUtc:utc,windowEndUtc:utc,
    patrol:z.object({schema:z.literal('casimir.solar_patrol.v1'),frames:z.array(z.unknown()).max(4096),
      unavailable:z.array(z.unknown()).max(4096),excludedReportIds:z.array(z.string()).max(256)})})).max(8),
});
export type SolarPatrolCatalogView=z.infer<typeof patrolCatalogSchema>;
export function readSolarPatrolCatalogView(value:unknown,start:string,end:string){
  const next=patrolCatalogSchema.parse(value);
  if(next.window.start!==start||next.window.end!==end)throw Error('Patrol catalog window mismatch');
  return next;
}
/** Keep citation navigation separate from executable URL schemes and embedded credentials. */
export function solarCitationHref(value:string):string|undefined{
  try{const url=new URL(value);if((url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password)return url.href;}catch{}
  return undefined;
}
