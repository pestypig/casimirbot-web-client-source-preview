import React from 'react';
import {createRoot} from 'react-dom/client';
import {SolarMagneticGlobe} from '../components/SolarMagneticGlobe';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
    <div className="mx-auto max-w-6xl space-y-3">
      <p className="text-xs uppercase tracking-widest text-amber-300">Local development preview · not a Star Watcher session or scientific result</p>
      <SolarMagneticGlobe/>
    </div>
  </main>,
);
