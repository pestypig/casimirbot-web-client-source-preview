/** Display formatting only; never converts absent/nonfinite inputs to measurements. */
export function formatSolarScientific(value:unknown,digits=2):string {
  if(typeof value!=='number'||!Number.isFinite(value))return 'Unavailable';
  if(value===0)return '0.0e0';
  const [mantissa,exponent]=value.toExponential(digits).split('e');
  return `${mantissa}e${Number(exponent)}`;
}
