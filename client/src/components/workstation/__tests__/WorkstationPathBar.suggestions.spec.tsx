// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('@/hooks/useHelixStartSettings',()=>({useHelixStartSettings:()=>({userSettings:{interfaceLanguage:'en'}})}));
vi.mock('@/lib/i18n/interfaceText',()=>({useInterfaceText:()=>({t:(key:string)=>key})}));
vi.mock('@/lib/i18n/panelTitles',()=>({getInterfacePanelTitle:(_t:unknown,_id:string,title:string)=>title}));
vi.mock('@/lib/desktop/panelRegistry',()=>{
  const panelRegistry=Array.from({length:20},(_,index)=>({id:`panel-${String(index).padStart(2,'0')}`,title:`Panel ${String(index).padStart(2,'0')}`}));
  return {panelRegistry,getPanelDef:(id:string)=>panelRegistry.find(panel=>panel.id===id)};
});
vi.mock('@/lib/workstation/accountCapabilityPolicy',()=>({HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT:'test-policy',readCachedAccountCapabilityPolicy:()=>({account_type:'developer'}),fetchAccountCapabilityPolicy:async()=>({account_type:'developer'})}));
vi.mock('@/store/useDocViewerStore',()=>({useDocViewerStore:(select:any)=>select({mode:'doc',currentPath:null,anchor:null})}));
vi.mock('@/store/useDocEquationContextStore',()=>({useDocEquationContextStore:(select:any)=>select({latestContext:null})}));
vi.mock('@/store/useWorkstationLayoutStore',()=>({useWorkstationLayoutStore:(select:any)=>select({openPanelInGroup:vi.fn(),setActivePanel:vi.fn(),focusGroup:vi.fn()})}));
import {WorkstationPathBar} from '../WorkstationPathBar';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps keyboard selection within the twelve rendered matches in a larger catalog',()=>{
  vi.stubGlobal('React',React);
  render(<WorkstationPathBar activePanelId="panel-00" groupId="main"/>);
  const input=screen.getByTestId('workstation-path-input');
  fireEvent.change(input,{target:{value:'workspace://workspace/panels/'}});
  expect(screen.getAllByRole('option')).toHaveLength(12);
  for(let index=0;index<12;index++)fireEvent.keyDown(input,{key:'ArrowDown'});
  expect(screen.getAllByRole('option').filter(option=>option.getAttribute('aria-selected')==='true')).toHaveLength(1);
  fireEvent.keyDown(input,{key:'Enter'});
  expect(input).toHaveValue('workspace://workspace/panels/panel-00');
  fireEvent.change(input,{target:{value:'workspace://workspace/panels/'}});
  fireEvent.keyDown(input,{key:'ArrowUp'});
  fireEvent.keyDown(input,{key:'Tab'});
  expect(input).toHaveValue('workspace://workspace/panels/panel-11');
});
