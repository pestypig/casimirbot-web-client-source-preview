import React, { useEffect, useState } from "react";
import {z} from 'zod';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,readCachedAccountProfileIdentity} from '@/lib/workstation/accountCapabilityPolicy';
import {captureAccountOperationScope} from '@/lib/workstation/accountOperationScope';
import {solarReasoningBudget} from '@shared/solar-reasoning';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const amountString=z.string().regex(/^\d{1,16}$/).refine(value=>Number.isSafeInteger(Number(value)));
const statusSchema=z.object({
  enabled:z.boolean(),provider_available:z.boolean(),
  budgets:z.array(z.object({id:z.string().min(1).max(160),executor:z.enum(['domain','developer_harness']),
    maximum_micros:amountString,committed_micros:amountString,maximum_calls:z.number().int().positive().max(1000),
    calls:z.number().int().nonnegative(),active:z.boolean(),paused_reason:z.string().max(160).nullable(),
    expires_at:z.string().datetime({offset:true})})).max(20),
  results:z.array(z.object({id:z.string().min(1).max(160),seq:amountString,status:z.string().max(80),
    reported_micros:amountString.nullable(),input_tokens:amountString.nullable(),output_tokens:amountString.nullable()})).max(20),
  deliveries:z.array(z.object({result_id:z.string().max(160),subscription_id:z.string().max(160),
    status:z.string().max(80),message_id:z.string().max(160).nullable()})).max(20).optional(),
});
type Status=z.infer<typeof statusSchema>;
const workerCredential=z.string().regex(/^solaredit_[A-Za-z0-9_-]{43}$/);
const endpoint="/api/discord/solar/feed/reasoning";
const dollars=(micros:string|number)=>`$${(Number(micros)/1_000_000).toFixed(6)}`;
function subscribeBudgetAccount(changed:()=>void){
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
  return()=>window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,changed);
}
const accountSnapshot=()=>JSON.stringify(readCachedAccountProfileIdentity());
export function SolarReasoningBudget(){
  const account=React.useSyncExternalStore(subscribeBudgetAccount,accountSnapshot,accountSnapshot);
  return <AccountSolarReasoningBudget key={account}/>;
}
function AccountSolarReasoningBudget() {
  const [status,setStatus]=useState<Status|null>(null),[message,setMessage]=useState("");
  const [amount,setAmount]=useState(""),[calls,setCalls]=useState(""),[hours,setHours]=useState("24");
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
  const [executor,setExecutor]=useState<"developer_harness"|"domain">("developer_harness");
  const [workerToken,setWorkerToken]=useState(""),[nativeToken,setNativeToken]=useState("");
  const active=React.useRef(false),busyRef=React.useRef(false);
  const requests=React.useRef(new Set<AbortController>());
  const isAccountCurrent=captureAccountOperationScope();
  const isCurrent=()=>active.current&&isAccountCurrent();
  const request=async(path:string,init:RequestInit={})=>{
    if(!isCurrent())return null;
    const controller=new AbortController();requests.current.add(controller);
    try{
      const response=await fetch(endpoint+path,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});
      const data=response.status===401||response.status===403?null:await response.json();
      return !controller.signal.aborted&&isCurrent()?{response,data}:null;
    }catch(error){if(controller.signal.aborted||!isCurrent())return null;throw error;}
    finally{requests.current.delete(controller);}
  };
  const refresh=async()=>{
    try {
      const result=await request('');if(!result)return false;
      const {response,data}=result;
      if(response.status===403||response.status===401){
        setStatus(null);setWorkerToken('');setConsent(false);
        setMessage("Budget controls are available to the configured platform owner.");return false;
      }
      if(!response.ok)throw Error();
      setStatus(statusSchema.parse(data));return true;
    }catch{if(isCurrent()){setStatus(null);setConsent(false);setMessage("Could not load the platform analysis budget.");}return false;}
  };
  useEffect(()=>{
    active.current=true;void refresh();
    const retire=()=>{active.current=false;requests.current.forEach(controller=>controller.abort());requests.current.clear();};
    const accountChanged=()=>{if(!isAccountCurrent())retire();};
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,accountChanged);
    return()=>{retire();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,accountChanged);};
  },[]);
  const mutate=async(path:string,method:string,body?:object)=>{
    if(!isCurrent()||busyRef.current)return;
    busyRef.current=true;setBusy(true);setMessage("");setWorkerToken('');setConsent(false);
    try {
      const result=await request(path,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
      if(!result)return;const {response,data}=result;
      if(!response.ok||data?.ok!==true)throw Error("Request not confirmed. Reopen this panel to check status before trying again.");
      if(method==='POST'){
        const created=z.object({id:z.string().min(1).max(160),worker_token:workerCredential.nullable().optional()}).parse(data);
        setWorkerToken(created.worker_token??'');
      }else if(data.revoked!==true)throw Error('Stop request not confirmed. Reopen this panel to check status before trying again.');
      const refreshed=await refresh();
      if(isCurrent()&&refreshed)setMessage(method==="DELETE"?"Platform analysis stopped.":"Platform budget authorized. Only opted-in channels receive new explanations.");
    }catch{if(isCurrent())setMessage("Request not confirmed. Reopen this panel to check status before trying again.");}
    finally{if(isCurrent()){busyRef.current=false;setBusy(false);}}
  };
  const nativeAction=async(action:'start'|'stop')=>{
    const bridge=window.casimirDesktop?.solarEditorial;
    if(!isCurrent()||busyRef.current||!bridge||(action==='start'&&!workerCredential.safeParse(nativeToken).success))return;
    const token=nativeToken;
    busyRef.current=true;setBusy(true);setMessage('');setNativeToken('');
    try{
      const result=await bridge(action==='start'?{action,token}:{action});
      if(isCurrent())setMessage(result.ok?`Solar worker: ${result.state}`:'Developer pilot request was not confirmed.');
    }catch{if(isCurrent())setMessage('Developer pilot request was not confirmed.');}
    finally{if(isCurrent()){busyRef.current=false;setBusy(false);}}
  };
  const micros=/^\d+(?:\.\d{1,6})?$/.test(amount)?Math.round(Number(amount)*1_000_000):0;
  const valid=Number.isSafeInteger(micros)&&micros>0&&micros<=100_000_000&&/^\d+$/.test(calls)&&Number(calls)>0&&Number(calls)<=1000&&
    Number.isFinite(Number(hours))&&Number(hours)>=1&&Number(hours)<=168;
  const canAuthorize=!busy&&consent&&valid&&status?.enabled&&(executor!=="domain"||status.provider_available);
  return <Card>
    <CardHeader><CardTitle>Solar explanations</CardTitle><CardDescription>
      CasimirBot can explain each new HEK report once and share that explanation with opted-in channels.
      These platform-funded posts use no subscriber allowance. Personal follow-up questions retain their selected funding limits.
    </CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm">A server administrator can use <code>/solarupdate action:explain-on</code> in its live channel, or <code>explain-off</code> to stop explanations. This authorizes analysis posts only.</p>
      {status&&<>
        <p className="text-sm">Solar reasoning: {status.enabled?"enabled; requires an authorized platform budget":"not enabled"}.</p>
        <form className="space-y-2" onSubmit={e=>{e.preventDefault();if(!canAuthorize||busyRef.current||!isCurrent())return;
          const body=solarReasoningBudget.safeParse({executor,maximum_micros:micros,maximum_calls:Number(calls),
            expires_at:new Date(Date.now()+Number(hours)*3600_000).toISOString(),consent:"platform_funded_explanations_only"});
          if(body.success)void mutate("/budget","POST",body.data);}}>
          <Label htmlFor="solar-platform-executor">Where to run the platform explanation</Label>
          <select id="solar-platform-executor" className="block rounded border p-2" value={executor} onChange={e=>setExecutor(e.target.value as typeof executor)}>
            <option value="developer_harness">Developer harness — selected API key stays on this computer</option>
            <option value="domain">Domain — dedicated platform API key</option>
          </select>
          <Label htmlFor="solar-platform-dollars">Maximum platform cost (USD)</Label>
          <Input id="solar-platform-dollars" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Owner-set ceiling"/>
          <Label htmlFor="solar-platform-calls">Maximum explanations</Label>
          <Input id="solar-platform-calls" type="number" min="1" max="1000" value={calls} onChange={e=>setCalls(e.target.value)}/>
          <Label htmlFor="solar-platform-hours">Expires after (hours, up to 168)</Label>
          <Input id="solar-platform-hours" type="number" min="1" max="168" value={hours} onChange={e=>setHours(e.target.value)}/>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
            I authorize this platform cost ceiling for shared solar explanations and Discord posts only. Subscriber allowances must remain unchanged.</label>
          <Button type="submit" disabled={!canAuthorize}>Authorize platform budget</Button>
        </form>
        {status.budgets.map(b=><div key={b.id} className="rounded border p-2 text-sm">
          <p>{b.active?b.paused_reason?`Paused: ${b.paused_reason}`:"Authorized":"Stopped"} · {b.executor} · {b.calls}/{b.maximum_calls} calls · expires {new Date(b.expires_at).toLocaleString()}</p>
          <p>Committed/reserved {dollars(b.committed_micros)} of {dollars(b.maximum_micros)}. Unconfirmed calls keep their reserve.</p>
          {b.active&&<Button variant="outline" disabled={busy} onClick={()=>void mutate(`/budget/${encodeURIComponent(b.id)}`,"DELETE")}>Stop this budget</Button>}
        </div>)}
        {status.results.map(r=><p className="text-xs" key={r.id}>solar_{r.seq}: {r.status} · provider-reported tokens {r.input_tokens??"unknown"} in / {r.output_tokens??"unknown"} out · observed cost {r.reported_micros===null?"unknown":dollars(r.reported_micros)} (estimate, not invoice)</p>)}
        {status.deliveries?.map(d=><p className="text-xs" key={`${d.result_id}:${d.subscription_id}`}>Analysis delivery: {d.status}{d.message_id?` · Discord message ${d.message_id}`:""}</p>)}
      </>}
      {workerToken&&<div className="space-y-2 rounded border p-2 text-sm">
        <p>Show-once pilot credential. Transfer it directly to the developer harness below; do not put it in chat or source files.</p>
        <Input aria-label="Show-once solar worker credential" type="password" readOnly value={workerToken}/>
        <Button variant="outline" onClick={()=>setWorkerToken("")}>Dismiss credential</Button>
      </div>}
      {typeof window!=="undefined"&&window.casimirDesktop?.solarEditorial&&<div className="space-y-2 rounded border p-2 text-sm">
        <Label htmlFor="solar-worker-token">Developer pilot credential</Label>
        <Input id="solar-worker-token" type="password" autoComplete="off" value={nativeToken} onChange={e=>setNativeToken(e.target.value)}/>
        <Button disabled={busy||!workerCredential.safeParse(nativeToken).success} onClick={()=>void nativeAction('start')}>Review and start developer pilot</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void nativeAction('stop')}>Stop developer pilot</Button>
      </div>}
      {message&&<p role="status" className="text-sm">{message}</p>}
    </CardContent>
  </Card>;
}
