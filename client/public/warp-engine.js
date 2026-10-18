// -----------------------------------------------------------------------------
// File: client/public/warp-engine.js (SSOT v2)
// Objective: CPU/2D reference engine that
//  - computes θ = γ_geo^3 · q · γ_VdB · √(d_FR) inside the engine
//  - applies an ellipsoidal ring window (Natário-like wall) to deform the grid
//  - enforces strictScientific parity/ridge, coalesces writes per RAF
//  - draws a clean grid via Canvas2D as a fallback (no WebGL required)
// -----------------------------------------------------------------------------
;(function (global) {
  'use strict'

  function _isFinite(v){ return typeof v === 'number' && isFinite(v) }
  const clamp01 = (x) => Math.max(0, Math.min(1, x))

  function WarpEngine(canvas, opts){
    if (!(this instanceof WarpEngine)) return new WarpEngine(canvas, opts)
    if (!canvas) throw new Error('WarpEngine requires a canvas element')
    this.canvas = canvas
    this.ctx2d = canvas.getContext('2d')

    // Options
    opts = opts || {}
    this.strictScientific = opts.strictScientific !== false
    this.debugTag = opts.debugTag || 'WarpEngine'

    // Public uniforms
    this.uniforms = Object.assign({}, opts.initialUniforms || {})
    if (this.strictScientific) {
      this.uniforms.physicsParityMode = true
      this.uniforms.ridgeMode = 0
    }

    // Pending patch → flushed once / RAF
    this._pending = {}
    this._raf = 0
    this._destroyed = false

    // Grid (line list)
    const grid = this._createGrid(1.6, 64)
    this.originalGrid = new Float32Array(grid)
    this.gridVertices = new Float32Array(grid)

    // Book-keeping for smoothing
    this._prevDisp = []
    this._dispAlpha = 0.25

    // Default non-physics knobs
    this.uniforms.userGain = 1.0
    this.uniforms.vizGain = 1.0
    this.uniforms.curvatureGainT = 0
    this.uniforms.curvatureBoostMax = 40
    this.uniforms.zeroStop = 1e-7
    this.uniforms.exposure = 6.0

    // Initial loading state (simulate async shader compile)
    this.onLoadingStateChange && this.onLoadingStateChange({ type: 'compiling', message: 'Compiling shaders (simulated)…' })
    setTimeout(() => { this.onLoadingStateChange && this.onLoadingStateChange({ type: 'ready', message: 'Ready' }) }, 60)

    // Kick loop
    this._startLoop()
  }

  // Factory
  WarpEngine.getOrCreate = function (canvas, opts){
    if (!canvas.__warp_instance) canvas.__warp_instance = new WarpEngine(canvas, opts || {})
    return canvas.__warp_instance
  }

  // Public API used by the viewer ------------------------------------------------
  WarpEngine.prototype.updateUniforms = function (patch){
    if (!patch || typeof patch !== 'object') return
    for (var k in patch){ if (!Object.prototype.hasOwnProperty.call(patch, k)) continue
      if (this.strictScientific && (k === 'physicsParityMode' || k === 'ridgeMode')) continue
      this._pending[k] = patch[k]
    }
    if (!this._raf){ var self=this; this._raf = requestAnimationFrame(function(){ self._flush() }) }
  }

  WarpEngine.prototype.bootstrap = function (initial){ this.updateUniforms(initial || {}) }
  WarpEngine.prototype.requestRewarp = function (){ this._needWarp = true }
  WarpEngine.prototype.setDisplayGain = function (g){ if (_isFinite(+g)) { this.updateUniforms({ userGain: Math.max(1, +g) }) } }
  WarpEngine.prototype.setSceneScale = function (s){ if (_isFinite(+s)) { this.updateUniforms({ sceneScale: Math.max(1e-6, +s) }) } }
  WarpEngine.prototype._startRenderLoop = function(){ /* loop always on; present for legacy */ }
  WarpEngine.prototype._resizeCanvasToDisplaySize = function(){
    const cv = this.canvas
    const dpr = Math.min(2, (global.devicePixelRatio || 1))
    const w = Math.floor((cv.clientWidth || cv.width || 800) * dpr)
    const h = Math.floor((cv.clientHeight || cv.height || 450) * dpr)
    if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h }
  }
  WarpEngine.prototype._resize = function(){ this._resizeCanvasToDisplaySize() }
  WarpEngine.prototype.destroy = function(){ this._destroyed = true; if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0 }

  // Internals --------------------------------------------------------------------
  WarpEngine.prototype._flush = function(){
    this._raf = 0
    if (this._destroyed) return
    const p = this._pending; this._pending = {}
    for (var k in p){ if (Object.prototype.hasOwnProperty.call(p, k)) this.uniforms[k] = p[k] }
    if (this.strictScientific){ this.uniforms.physicsParityMode = true; this.uniforms.ridgeMode = 0 }
    this._needWarp = true
  }

  WarpEngine.prototype._startLoop = function(){
    const self = this
    function tick(){ if (self._destroyed) return; if (self._needWarp) self._updateGrid(); self._draw(); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }

  WarpEngine.prototype._createGrid = function(span, divisions){
    const spanSafe = (_isFinite(span) && span > 0) ? span : 1.6
    let div = (_isFinite(divisions) && divisions > 0) ? Math.floor(divisions) : 64
    div = Math.max(8, Math.min(512, div))
    const verts = []
    const step = (spanSafe * 2) / div
    const half = spanSafe
    const yBase = -0.15
    const yVariation = 0 // no cosmetic y-wobble in scientific engine
    for (let z = 0; z <= div; ++z){ const zPos = -half + z * step; for (let x = 0; x < div; ++x){
      const x0 = -half + x * step, x1 = -half + (x + 1) * step
      const y0 = yBase + yVariation * Math.sin(x0 * 2) * Math.cos(zPos * 3)
      const y1 = yBase + yVariation * Math.sin(x1 * 2) * Math.cos(zPos * 3)
      verts.push(x0, y0, zPos, x1, y1, zPos)
    }}
    for (let xi = 0; xi <= div; ++xi){ const xPos = -half + xi * step; for (let zi = 0; zi < div; ++zi){
      const z0 = -half + zi * step, z1 = -half + (zi + 1) * step
      const yy0 = yBase + yVariation * Math.sin(xPos * 2) * Math.cos(z0 * 3)
      const yy1 = yBase + yVariation * Math.sin(xPos * 2) * Math.cos(z1 * 3)
      verts.push(xPos, yy0, z0, xPos, yy1, z1)
    }}
    return verts
  }

  // θ chain (canonical)
  function thetaFromUniforms(u){
    const g = Math.max(1, +u.gammaGeo || +u.g_y || 1)
    const q = Math.max(1e-12, +u.deltaAOverA || +u.qSpoilingFactor || 1)
    const vdb = Math.max(1, +u.gammaVanDenBroeck_vis || +u.gammaVdB || +u.gammaVanDenBroeck || 1)
    // resolve FR duty (ship-effective)
    let dFR = +u.dutyEffectiveFR
    if (!isFinite(dFR)){
      const dutyCycle = Math.max(0, +u.dutyCycle || 0)
      const sectors = Math.max(1, Math.floor(+u.sectors || 1))
      const sectorCount = Math.max(1, Math.floor(+u.sectorCount || sectors))
      dFR = dutyCycle * (sectors / sectorCount)
    }
    const dFRc = clamp01(dFR)
    // Standby guard: if averaging is on and duty is 0, θ must be 0 regardless of any server θ
    if (u.viewAvg && dFRc === 0) return 0
    // Server θ only when explicitly flagged AND duty isn't zero
    if (Number.isFinite(+u.thetaScale) && u.thetaSource === 'server' && dFRc > 0) {
      return +u.thetaScale
    }
    const sqrtFR = (u.viewAvg ? Math.sqrt(dFRc) : 1)
    return Math.pow(g, 3) * q * vdb * sqrtFR
  }

  // Deform grid by Natário-like ring kernel
  WarpEngine.prototype._updateGrid = function(){
    this._needWarp = false
    const U = this.uniforms
    const a = +(U.hullAxes?.[0] || 1), b = +(U.hullAxes?.[1] || 1), c = +(U.hullAxes?.[2] || 1)
    const axes = U.axesClip || [1,1,1]
    const w_rho = Math.max(1e-4, +U.wallWidth || 0.06)

    const theta = thetaFromUniforms(U)
    const userGain = Math.max(1, +U.userGain || 1)
    const vizGain  = Math.max(1, +U.vizGain  || 1)
    const curvT = Math.max(0, Math.min(1, +U.curvatureGainT || 0))
    const boostMax = Math.max(1, +U.curvatureBoostMax || 40)
    const boostNow = 1 + curvT * (boostMax - 1)
    const thetaScale = theta * userGain * vizGain * boostNow

    // Store for diagnostics
    this.uniforms.thetaScale = theta
    this.uniforms.thetaScale_actual = thetaScale

    const N = this.originalGrid.length
    if (!this.gridVertices || this.gridVertices.length !== N) this.gridVertices = new Float32Array(N)

    // Temporal smoothing cache size
    if (!this._prevDisp || this._prevDisp.length * 3 !== N) this._prevDisp = new Array(N/3).fill(0)

    const gridK = 1.0 // geometry base gain (engine-internal)
    const zeroStop = Math.max(1e-18, +U.zeroStop || 1e-7)

    for (let i = 0; i < N; i += 3){
      const x = this.originalGrid[i+0]
      const y = this.originalGrid[i+1]
      const z = this.originalGrid[i+2]

      // Ellipsoidal radius (ρ) in clip axes
      const rx = x / (axes[0] || 1), ry = y / (axes[1] || 1), rz = z / (axes[2] || 1)
      const rho = Math.sqrt(rx*rx + ry*ry + rz*rz)
      const d = rho - 1.0

      // Gaussian ring and its radial derivative
      const w = w_rho
      const gaussian = Math.exp(- (d*d) / (w*w))
      const df = (2 * d / (w*w)) * gaussian // proportional to ∂/∂ρ exp(-((ρ-1)^2)/w^2)

      // Parity/ridge: double-lobe (physics) vs single crest (show)
      const useSingleRidge = ((U.ridgeMode|0) === 1)
      const baseMag = useSingleRidge ? Math.abs(d) * gaussian : Math.abs(d * df)

      // Log-compressed amplitude (avoid instant saturation)
      const REF_BOOSTMAX = 40
      const magMax = Math.log(1.0 + (baseMag * theta * REF_BOOSTMAX) / zeroStop)
      const magNow = Math.log(1.0 + (baseMag * thetaScale) / zeroStop)
      const A_geom = Math.pow(Math.min(1.0, magNow / Math.max(1e-12, magMax)), 0.85)

      // Gentle interior tilt (ε, β̂) with interior envelope
      const eps = +U.epsilonTilt || 0
      const bt = U.betaTiltVec || [0,-1,0]
      const tiltEnv = Math.exp(-Math.pow(rho / 1.0, 2))
      const tiltY = eps * (Array.isArray(bt) ? (bt[1] || -1) : -1) * tiltEnv

      // Final displacement along +y
      let disp = gridK * A_geom * gaussian + tiltY

      // Soft clamp; let exaggeration breathe a bit
      const softClamp = (x, m) => m * Math.tanh(x / m)
      const maxPush = 0.22
      disp = softClamp(disp, maxPush)

      // Temporal smoothing
      const vi = i / 3
      const prev = this._prevDisp[vi] || 0
      const blended = prev + this._dispAlpha * (disp - prev)
      this._prevDisp[vi] = blended

      this.gridVertices[i+0] = x
      this.gridVertices[i+1] = y + blended
      this.gridVertices[i+2] = z
    }
  }

  // Very simple 3D→2D draw (Canvas2D)
  WarpEngine.prototype._draw = function(){
    const ctx = this.ctx2d; if (!ctx) return
    this._resizeCanvasToDisplaySize()

    const U = this.uniforms
    const w = this.canvas.width, h = this.canvas.height
    ctx.clearRect(0,0,w,h)
    ctx.lineWidth = Math.max(1, w/900)
    ctx.strokeStyle = 'rgba(180,200,255,0.85)'

    const camZ = Math.max(0.1, +U.cameraZ || 2.0)
    const eyeY = -0.15

    // quick perspective
    const project = (X, Y, Z) => {
      const z = Z + camZ
      const s = camZ / Math.max(1e-3, z)
      const px = (X * s * 0.9 + 0.5) * w
      const py = (-(Y - eyeY) * s * 0.9 + 0.5) * h
      return [px, py]
    }

    const verts = this.gridVertices
    for (let i = 0; i < verts.length; i += 6){
      const x0 = verts[i],   y0 = verts[i+1], z0 = verts[i+2]
      const x1 = verts[i+3], y1 = verts[i+4], z1 = verts[i+5]
      const p0 = project(x0,y0,z0)
      const p1 = project(x1,y1,z1)
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke()
    }
  }

  // Export
  global.WarpEngine = global.WarpEngine || WarpEngine
})(typeof window !== 'undefined' ? window : this)
