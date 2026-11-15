import React, { useId, useState } from 'react';
import { DEVELOPER_CONNECTOR_GUIDE_PATH, CONNECTOR_SOURCE_PREVIEW_URL,
  developerConnectorGuide } from '@shared/developer-connector-guide';

export default function DeveloperConnectorGuide({ native = false }: { native?: boolean }) {
  const [notice, setNotice] = useState('');
  const promptId = useId();
  const guide = developerConnectorGuide;
  const copy = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch { setNotice('Select and copy the text below. Clipboard access is unavailable.'); }
  };
  const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-cyan-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
  return <details className="mb-6 rounded-2xl border border-cyan-300/25 bg-slate-900/70 p-5">
    <summary className="cursor-pointer font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Build a connector</summary>
    <div className="mt-5 max-w-4xl space-y-5">
      <div><h2 className="text-xl font-semibold">{guide.title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{guide.introduction}</p>
        <p className="mt-3 rounded-lg border-l-2 border-cyan-300 bg-cyan-300/5 p-3 text-sm text-cyan-100">{guide.currentBoundary}</p></div>
      <ol className="list-decimal space-y-4 pl-5 text-sm leading-6 text-slate-300">{guide.steps.map(step => <li key={step.title}>
        <strong className="text-slate-100">{step.title}.</strong> {step.body}</li>)}</ol>
      <div><label htmlFor={promptId} className="font-semibold">Give this to your coding assistant</label>
        <textarea id={promptId} readOnly value={guide.codingAssistantPrompt} rows={10}
          className="mt-3 block w-full rounded-lg border border-slate-600 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" />
        <button type="button" className={`${button} mt-3`} onClick={() => void copy(guide.codingAssistantPrompt, 'Assistant prompt')}>Copy assistant prompt</button></div>
      <div className="rounded-lg border border-slate-700 p-4"><h3 className="font-semibold">Read-only source preview</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{guide.available[0].body}</p>
        <p className="mt-2 break-all font-mono text-xs text-slate-300">{CONNECTOR_SOURCE_PREVIEW_URL}</p>
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => void copy(CONNECTOR_SOURCE_PREVIEW_URL, 'Source URL')}>Copy source URL</button>
          {!native && <a className={button} href={DEVELOPER_CONNECTOR_GUIDE_PATH} target="_blank" rel="noopener noreferrer">Read full developer guide</a>}</div></div>
      <p className="text-sm leading-6 text-slate-400">{guide.localTooling.instruction}</p>
      <p className="text-sm leading-6 text-slate-400">{guide.localFileInspection.instruction}</p>
      <p className="text-sm leading-6 text-slate-400">{guide.fixedReviewedImportPrototype.instruction}</p>
      <p className="text-sm text-slate-400">{guide.developerMeaning}</p>
      <p role="status" aria-live="polite" className="text-sm text-cyan-100">{notice}</p>
    </div>
  </details>;
}
