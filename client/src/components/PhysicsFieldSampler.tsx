import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FieldResponse {
  count: number;
  axes: any;
  w_m: number;
  physics: {
    gammaGeo: number;
    qSpoiling: number;
    sectorStrobing: number;
  };
  data: FieldSampleBuffer;
}

interface FieldSampleBuffer {
  length: number;
  x: number[];
  y: number[];
  z: number[];
  nx: number[];
  ny: number[];
  nz: number[];
  rho: number[];
  bell: number[];
  sgn: number[];
  disp: number[];
  dA: number[];
}

export function PhysicsFieldSampler() {
  const [nTheta, setNTheta] = useState(36);
  const [nPhi, setNPhi] = useState(18);
  const [sectors, setSectors] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldData, setFieldData] = useState<FieldResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleField = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        nTheta: nTheta.toString(),
        nPhi: nPhi.toString(),
        sectors: sectors.toString(),
        split: Math.floor(sectors / 2).toString()
      });
      
      const response = await fetch(`/api/helix/field?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setFieldData(data);
      
      // Log comparison data for dev console analysis
      console.log('🔬 PHYSICS FIELD SAMPLER:');
      console.log('  Sample count:', data.count);
      console.log('  Hull axes:', data.axes);
      console.log('  Wall width (m):', data.w_m);
      console.log('  Physics params:', data.physics);
      
      // Sample a few displacement values for comparison
      const logCount = Math.min(10, data.data.length);
      console.log('  Sample displacements:');
      for (let i = 0; i < logCount; i++) {
        const rho = data.data.rho[i];
        const bell = data.data.bell[i];
        const sgn = data.data.sgn[i];
        const disp = data.data.disp[i];
        console.log(`    [${i}] ρ=${rho.toFixed(4)}, bell=${bell.toExponential(2)}, sgn=${sgn.toFixed(3)}, disp=${disp.toExponential(2)}`);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sample field');
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = () => {
    if (!fieldData) return;
    
    const headers = ['theta', 'phi', 'x', 'y', 'z', 'rho', 'bell', 'nx', 'ny', 'nz', 'sgn', 'disp'];
    const buffer = fieldData.data;
    const rows: string[][] = [];
    for (let i = 0; i < buffer.length; i++) {
      const theta = (i % nTheta) * (2 * Math.PI) / nTheta;
      const phi = -Math.PI / 2 + Math.floor(i / nTheta) * Math.PI / (nPhi - 1);
      rows.push([
        theta.toFixed(6),
        phi.toFixed(6),
        buffer.x[i].toFixed(3),
        buffer.y[i].toFixed(3),
        buffer.z[i].toFixed(3),
        buffer.rho[i].toFixed(6),
        buffer.bell[i].toExponential(6),
        buffer.nx[i].toFixed(6),
        buffer.ny[i].toFixed(6),
        buffer.nz[i].toFixed(6),
        buffer.sgn[i].toFixed(3),
        buffer.disp[i].toExponential(6)
      ]);
    }
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `physics_field_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Physics Field Sampler</CardTitle>
        <CardDescription>
          Sample displacement field from physics engine for renderer validation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nTheta">θ Points</Label>
            <Input
              id="nTheta"
              type="number"
              value={nTheta}
              onChange={(e) => setNTheta(Number(e.target.value))}
              min={4}
              max={360}
              data-testid="input-theta-points"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nPhi">φ Points</Label>
            <Input
              id="nPhi"
              type="number"
              value={nPhi}
              onChange={(e) => setNPhi(Number(e.target.value))}
              min={2}
              max={180}
              data-testid="input-phi-points"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sectors">Sectors</Label>
            <Input
              id="sectors"
              type="number"
              value={sectors}
              onChange={(e) => setSectors(Number(e.target.value))}
              min={1}
              max={400}
              data-testid="input-sectors"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={sampleField} 
            disabled={isLoading}
            data-testid="button-sample-field"
          >
            {isLoading ? 'Sampling...' : 'Sample Field'}
          </Button>
          
          {fieldData && (
            <Button 
              variant="outline" 
              onClick={exportCSV}
              data-testid="button-export-csv"
            >
              Export CSV
            </Button>
          )}
        </div>

        {error && (
          <div className="text-red-500 text-sm" data-testid="text-error">
            Error: {error}
          </div>
        )}

        {fieldData && (
          <div className="space-y-2 text-sm" data-testid="text-results">
            <div>✓ Sampled {fieldData.count} points</div>
            <div>Hull: [{fieldData.axes?.Lx_m?.toFixed(1) || 'N/A'} × {fieldData.axes?.Ly_m?.toFixed(1) || 'N/A'} × {fieldData.axes?.Lz_m?.toFixed(1) || 'N/A'}] m</div>
            <div>Wall width: {(fieldData.w_m * 1e9).toFixed(1)} nm</div>
            <div>γ_geo: {fieldData.physics.gammaGeo}, Q_spoil: {fieldData.physics.qSpoiling}, Sectors: {fieldData.physics.sectorStrobing}</div>
            <div className="text-blue-600">📊 Check console for detailed comparison data</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
