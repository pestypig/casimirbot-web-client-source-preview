// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SolarSurfaceRegistrationViewer} from '../SolarSurfaceRegistrationViewer';
import fixture from '../../../../../tests/fixtures/sunpy-hmi-wcs-registration.json';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('keeps an observation out of the registered chart when WCS and observer geometry are absent',()=>{
  const bytes=new Uint8Array(32*32*4);
  const frame={index:0,obstime:'2026-10-07T00:00:00Z',grid_size:32,
    map_b64:btoa(String.fromCharCode(...bytes)),wcs_header:null,registration_geometry:null};
  render(<SolarSurfaceRegistrationViewer frames={[frame]} selectedFrameIndex={0}/>);
  expect(screen.getAllByRole('status')[0].textContent).toMatch(/lacks native WCS or observer geometry/);
  expect(screen.getByLabelText('WCS-registered solar surface regions')).toBeTruthy();
});

it('renders a selected frame through its real SunPy WCS and observer metadata',()=>{
  const values=new Float32Array(192*192).fill(0.5),bytes=new Uint8Array(values.buffer);
  let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  const frame={index:0,obstime:'2011-06-07T06:32:11Z',grid_size:192,map_b64:btoa(binary),
    wcs_header:fixture.wcs_header,registration_geometry:fixture.registration_geometry};
  const putImageData=vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({putImageData} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,AA==');
  vi.stubGlobal('ImageData',class {constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
  render(<SolarSurfaceRegistrationViewer frames={[frame]} selectedFrameIndex={0}/>);
  expect(screen.getByText(/WCS projected · 2011-06-07T06:32:11Z/)).toBeTruthy();
  expect(screen.getByRole('img',{name:'Native solar observation resampled to Carrington longitude and latitude'})).toBeTruthy();
  expect(screen.getByRole('img',{name:'Latitude-corrected Carrington surface patch'})).toBeTruthy();
  expect(putImageData).toHaveBeenCalled();
});

it('keeps a selected Carrington ROI in timeline order across distinct observer poses',()=>{
  const values=new Float32Array(192*192).fill(0.25),bytes=new Uint8Array(values.buffer);
  let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  const first={index:0,obstime:'2011-06-07T06:32:11Z',grid_size:192,map_b64:btoa(binary),
    wcs_header:fixture.wcs_header,registration_geometry:fixture.registration_geometry};
  const second={...first,index:1,obstime:'2011-06-07T06:32:35Z',registration_geometry:{
    ...fixture.registration_geometry,observerCarringtonLongitudeDeg:fixture.registration_geometry.observerCarringtonLongitudeDeg+0.15}};
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({putImageData:vi.fn()} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,AA==');
  vi.stubGlobal('ImageData',class {constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
  render(<SolarSurfaceRegistrationViewer frames={[first,second]} selectedFrameIndex={1}/>);
  fireEvent.click(screen.getByRole('button',{name:'Render region across observation timeline'}));
  expect(screen.getByText('Rendered 2/2 WCS-registered Carrington patches.')).toBeTruthy();
  expect(screen.getByRole('img',{name:'Carrington registered patch 2011-06-07T06:32:11Z'})).toBeTruthy();
  expect(screen.getByRole('img',{name:'Carrington registered patch 2011-06-07T06:32:35Z'})).toBeTruthy();
});
