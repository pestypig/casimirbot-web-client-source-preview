import {prepareDeepMixToyRunReceipt,type DeepMixToyPresetId} from '@shared/deepmix-toy-model';

export async function exportDeepMixToyRun(presetId:DeepMixToyPresetId,
  controls:{ships:number;ratePerShipKgS:number;horizonYears:number;stepYears:number}){
  const receipt=await prepareDeepMixToyRunReceipt(presetId,controls);
  const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}));
  try{
    const link=document.createElement('a');link.href=url;link.download=`${receipt.runId}.json`;
    document.body.appendChild(link);link.click();link.remove();
  }finally{URL.revokeObjectURL(url);}
  return receipt.runId;
}
