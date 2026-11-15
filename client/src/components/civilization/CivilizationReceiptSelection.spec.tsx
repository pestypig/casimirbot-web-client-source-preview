// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CivilizationDiplomaticMoveLedger} from './CivilizationDiplomaticMoveLedger';
import {CivilizationEconomicHistory} from './CivilizationEconomicHistory';
import {readDiplomaticMoveLedger} from '../../../../server/services/civilization-diplomacy/diplomatic-move-ledger';
import {readEconomicHistory} from '../../../../server/services/civilization-economy/economic-history';
const now=new Date('2026-10-25T21:15:30Z');
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it.each([
 ['country',{countryIso3s:['CAN']}],['issue',{issueIds:['energy_trade']}],['page',{offset:10}],
])('rejects a structurally valid ledger for a different %s',async(_name,delta)=>{
 const receipt=readDiplomaticMoveLedger({countryIso3s:['USA'],...delta});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>receipt})));
 render(<CivilizationDiplomaticMoveLedger countryIso3s={['USA']}/>);
 expect((await screen.findByRole('alert')).textContent).toContain('Evidence remains unknown');
 expect(screen.queryByLabelText('Diplomatic ledger audit JSON')).toBeNull();
});
it.each([
 ['country',{countryIso3s:['CAN']}],['window',{startYear:2010,endYear:2019}],
 ['mode',{analysisMode:'forecast'}],['cutoff',{reasoningAsOf:'2020-06-30T23:59:59.999Z'}],
])('rejects structurally valid economic evidence for a different %s',async(_name,delta)=>{
 const receipt=await readEconomicHistory({countryIso3s:['USA'],startYear:2016,endYear:2025,...delta},
  {now,fetcher:(async()=>{throw Error('offline');}) as typeof fetch});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>receipt})));
 render(<CivilizationEconomicHistory countryIso3s={['USA']}/>);
 fireEvent.click(screen.getByText('Wages, wealth and spending · ten-year history'));
 expect((await screen.findByRole('alert')).textContent).toContain('Coverage remains unknown');
 expect(screen.queryByLabelText('Economic history audit JSON')).toBeNull();
});
