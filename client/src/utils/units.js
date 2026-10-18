// WarpFactory-inspired unit system for eliminating magic numbers
// Based on github.com/NerdsWithAttitudes/WarpFactory Units/ directory

// Length conversions to meters
export const nm = 1e-9;     // nanometers
export const um = 1e-6;     // micrometers
export const mm = 1e-3;     // millimeters
export const cm = 1e-2;     // centimeters
export const m = 1.0;       // meters
export const km = 1e3;      // kilometers

// Power conversions to watts
export const mW = 1e-3;     // milliwatts
export const W = 1.0;       // watts
export const kW = 1e3;      // kilowatts
export const MW = 1e6;      // megawatts
export const GW = 1e9;      // gigawatts

// Mass conversions to kilograms
export const mg = 1e-6;     // milligrams
export const g = 1e-3;      // grams
export const kg = 1.0;      // kilograms
export const tonne = 1e3;   // metric tonnes

// Time conversions to seconds
export const ns = 1e-9;     // nanoseconds
export const us = 1e-6;     // microseconds
export const ms = 1e-3;     // milliseconds
export const s = 1.0;       // seconds
export const min = 60;      // minutes
export const hr = 3600;     // hours

// Energy conversions to joules
export const mJ = 1e-3;     // millijoules
export const J = 1.0;       // joules
export const kJ = 1e3;      // kilojoules
export const MJ = 1e6;      // megajoules

// Fundamental constants (SI units)
import { C as c } from '../lib/physics-const';
export { c };
export const hbar = 1.054571817e-34;  // reduced Planck constant (J⋅s)
export const G = 6.67430e-11;         // gravitational constant (m³/kg⋅s²)

// Conversion utilities
export function convertLength(value, fromUnit, toUnit) {
    return value * fromUnit / toUnit;
}

export function convertPower(value, fromUnit, toUnit) {
    return value * fromUnit / toUnit;
}

export function formatScientific(value, decimals = 3) {
    return value.toExponential(decimals);
}

// Unit validation helpers
export function validateNonNegative(value, name) {
    if (value < 0) {
        throw new Error(`${name} must be non-negative, got ${value}`);
    }
    return value;
}

export function validatePositive(value, name) {
    if (value <= 0) {
        throw new Error(`${name} must be positive, got ${value}`);
    }
    return value;
}