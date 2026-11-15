import React, { useState } from "react";
import { atomicRequestSchema, defaultAtomicRequest, ELEMENT_SYMBOLS, type AtomicRequest } from "@shared/atomic-emission/contracts";
import { atomicResultCurrent, runAtomicOperator, validateAtomicResult, type AtomicResult } from "@shared/atomic-emission/operator";
import { atomicResultScenario, exportAtomicRecipe } from "@shared/atomic-emission/presentation";
import { QuantumGlyphAnswer } from "./QuantumGlyphAnswer";

const style="rounded border border-slate-600 bg-slate-900 p-2 text-sm";
const textOf=(r: unknown)=>JSON.stringify(r,null,2);
export function AtomicEmissionWorkbench({ profileKey }: { profileKey: string | null }) {
  const [text,setText]=useState(()=>textOf(defaultAtomicRequest()));
  const [result,setResult]=useState<AtomicResult|null>(null);
  const [error,setError]=useState("");
  const [code,setCode]=useState("");
  const [document,setDocument]=useState("");
  const [notice,setNotice]=useState("");
  const storageKey=profileKey?`${profileKey}:super-model-atomic-v1`:null;
  const parse=()=>{if(text.length>32768) throw new Error("Recipe exceeds 32 KiB"); return atomicRequestSchema.parse(JSON.parse(text));};
  const edit=(next:string)=>{setText(next);setResult(null);setError("");setNotice("Recipe changed; calculation evidence invalidated.");};
  const calculate=()=>{try { const r=parse(); setResult(runAtomicOperator(r)); setError("");setNotice("Fixed bounded operator executed locally. Editable code cell remains unexecuted."); } catch(e) {setResult(null);setError(String(e));}};
  const example=(kind:string)=>{
    const r=defaultAtomicRequest();
    if(kind==="he-ion") {r.atomicNumber=2;r.ionCharge=1;r.mass={kind:"isotope",id:"He-4"};}
    if(kind==="he-data") {r.atomicNumber=2;r.ionCharge=0;r.electronCount=2;r.mass={kind:"isotope",id:"He-4"};r.provider="nist-he-i";r.initial={configuration:"1s2p-1P",J:1,m:null};r.final={configuration:"1s2-1S",J:0,m:null};r.preparation.basis="unresolved-Jm";}
    if(kind==="iron") {r.atomicNumber=26;r.electronCount=26;r.mass={kind:"declared_nucleus",kg:9.27e-26,label:"Illustrative Fe nuclear mass, not isotope certified"};}
    edit(textOf(r));
  };
  const load=(value:string)=>{
    if(value.length>131072) throw new Error("Document exceeds 128 KiB");
    const doc=JSON.parse(value);
    if(doc.schema!=="super-model.atomic-document.v1" || Object.keys(doc).some(k=>!["schema","request","result","code"].includes(k))) throw new Error("Invalid atomic document schema");
    const r=atomicRequestSchema.parse(doc.request);
    if(typeof doc.code!=="string"||doc.code.length>32768) throw new Error("Invalid code-cell text");
    if(doc.result!==null&&!validateAtomicResult(doc.result,r)) throw new Error("Stale, malformed or altered result receipt");
    setText(textOf(r));setResult(doc.result===null?null:runAtomicOperator(r));setCode(doc.code);setError("");setNotice("Document loaded; saved evidence independently recomputed. Code cell not executed.");
  };
  let current=false;
  try {current=atomicResultCurrent(result,JSON.parse(text));} catch { /* Incomplete edit. */ }
  const scenario=current&&result&&["calculated","database-derived"].includes(result.status)?atomicResultScenario(result):null;
  const makeDocument=()=>textOf({schema:"super-model.atomic-document.v1",request:parse(),result:current?result:null,code});
  const guarded=(fn:()=>void)=>{try{fn();setError("");}catch(e){setError(String(e));}};
  return <details className="rounded-lg border border-sky-800 p-4" data-testid="atomic-emission-workbench"><summary className="cursor-pointer font-semibold">Super Model · atomic emission tool</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm">Execute a versioned atomic calculation, inspect its evidence, then unfold its qualitative glyph explanation. Inputs use SI. Electron spin is explicit; total J requires a different provider.</p>
      <div className="flex flex-wrap gap-2"><button className={style} onClick={()=>example("h")}>H-1 analytic</button><button className={style} onClick={()=>example("he-ion")}>He-4⁺ analytic</button><button className={style} onClick={()=>example("he-data")}>He I source data</button><button className={style} onClick={()=>example("iron")}>Neutral Fe capability gap</button></div>
      <label className="block">Element identity (Z=1…118)<select aria-label="Atomic element identity" className={`${style} ml-2`} value={(()=>{try{return JSON.parse(text).atomicNumber;}catch{return 1;}})()} onChange={e=>guarded(()=>{
        const r=parse(), Z=Number(e.target.value);r.atomicNumber=Z;r.ionCharge=Z-r.electronCount;
        r.mass={kind:"declared_nucleus",kg:Math.max(1,Z)*2*1.67262192595e-27,label:"Illustrative 2Z nucleon mass; replace with declared nuclear mass"};r.specificsOrigin="user";edit(textOf(r));
      })}>{ELEMENT_SYMBOLS.map((symbol,i)=><option key={symbol} value={i+1}>{i+1} · {symbol}</option>)}</select></label>
      <label className="block">Calculation recipe JSON<textarea aria-label="Atomic calculation recipe JSON" className={`${style} mt-2 block min-h-64 w-full font-mono`} maxLength={32768} value={text} onChange={e=>edit(e.target.value)} spellCheck={false}/></label>
      <p className="text-xs text-slate-400">The fixed operator supports one-electron Z≤10, 2p(m=−1,0,+1)→1s, E1, spectator spin and a declared Gaussian COM. Other states/providers return explicit gaps. Changing identity preserves the declared electron count and updates ion charge; verify mass, state and preparation before calculating.</p>
      <button className={style} onClick={calculate}>Calculate atomic recipe</button>
      {error&&<p role="alert" className="text-amber-200">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {current&&result&&<section aria-label="Atomic calculation evidence" className="space-y-3"><h3 className="font-semibold">{result.status} · {result.operator}</h3>
        <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(result.values).map(([name,v])=><div key={name}><dt className="text-xs text-slate-400">{name}</dt><dd className="font-mono text-sm">{v.value.toPrecision(8)} {v.unit}</dd></div>)}</dl>
        <ol className="list-inside list-decimal space-y-2 text-sm">{result.derivation.map((d,i)=><li key={i}>{d}</li>)}</ol>
        {result.missing.length>0&&<div><h4>Missing requirements</h4><ul className="list-inside list-disc text-sm">{result.missing.map(m=><li key={m}>{m}</li>)}</ul></div>}
        <details><summary>Assumptions, residuals and exact provenance</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{textOf(result)}</pre></details>
        {scenario&&<div><p className="text-xs text-slate-400">Result-backed explanation · drawing remains qualitative. Evidence hash {result.resultHash}</p><QuantumGlyphAnswer key={result.resultHash} scenario={scenario} onWorkbench={()=>setNotice("Inspect the calculation evidence and editable recipe above.")}/></div>}
      </section>}
      <details><summary>Editable code cell and reproducible document</summary><div className="mt-3 space-y-3">
        <p className="text-sm">Code-cell execution status: NOT EXECUTED. This is editable export text. The Calculate button executes only the fixed typed operator from the JSON recipe. The existing display sandbox remains a separate presentation surface.</p>
        <button className={style} onClick={()=>guarded(()=>setCode(exportAtomicRecipe(parse())))}>Fill export code cell</button>
        <textarea aria-label="Atomic export code cell" className={`${style} block min-h-40 w-full font-mono`} maxLength={32768} value={code} onChange={e=>setCode(e.target.value)} spellCheck={false}/>
        <div className="flex flex-wrap gap-2"><button className={style} onClick={()=>guarded(()=>setDocument(makeDocument()))}>Show atomic document</button><button className={style} disabled={!storageKey} onClick={()=>guarded(()=>{if(storageKey){localStorage.setItem(storageKey,makeDocument());setNotice("Atomic recipe saved for this profile.");}})}>Save atomic recipe</button><button className={style} disabled={!storageKey} onClick={()=>guarded(()=>{const saved=storageKey&&localStorage.getItem(storageKey);if(!saved)throw new Error("No saved atomic recipe for this profile");load(saved);})}>Replay saved atomic recipe</button></div>
        <textarea aria-label="Atomic document JSON" className={`${style} block min-h-40 w-full font-mono`} maxLength={131072} value={document} onChange={e=>setDocument(e.target.value)}/><button className={style} onClick={()=>guarded(()=>load(document))}>Load atomic document</button>
      </div></details>
    </div>
  </details>;
}
