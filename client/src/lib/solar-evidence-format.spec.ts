import {it,expect} from 'vitest';
import {formatSolarScientific} from './solar-evidence-format';
it('does not turn missing or nonfinite values into measured zero',()=>{
  for(const value of [null,undefined,NaN,Infinity,-Infinity,'0'])expect(formatSolarScientific(value)).toBe('Unavailable');
});
it('preserves finite zero and signed finite quantities',()=>{
  expect(formatSolarScientific(0)).toBe('0.0e0');
  expect(formatSolarScientific(120)).toBe('1.20e2');
  expect(formatSolarScientific(-0.02)).toBe('-2.00e-2');
});
it('formats finite subnormals and maximum magnitude without division underflow',()=>{
  expect(formatSolarScientific(Number.MIN_VALUE)).toBe('4.94e-324');
  expect(formatSolarScientific(-Number.MIN_VALUE)).toBe('-4.94e-324');
  expect(formatSolarScientific(Number.MAX_VALUE)).toBe('1.80e308');
});
it('normalizes a rounded mantissa crossing a power of ten',()=>{
  expect(formatSolarScientific(9.999)).toBe('1.00e1');
  expect(formatSolarScientific(-9.999)).toBe('-1.00e1');
});
