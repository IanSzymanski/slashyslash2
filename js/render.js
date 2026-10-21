'use strict';
// Frame composition: the 3D scene through Gfx, then the 480x270 pixel HUD on a canvas above it.
// The 2D HUD (bars, gauges, style rank, title card) is copied in here in Phase 1.

const Render = {
  hud: null, ctx: null, fps: 60, standIn: null,

  init(glCanvas, hudCanvas) {
    Gfx.init(glCanvas);
    this.hud = hudCanvas;
    hudCanvas.width = VIEW_W; hudCanvas.height = VIEW_H;
    this.ctx = hudCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.standIn = Gfx.standIn();
    this.standIn.visible = false;
    Gfx.scene.add(this.standIn);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  // The 2D game's 16:9 frame; the 3D view renders at the frame's native size times the resolution scale.
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / VIEW_W, wh / VIEW_H);
    const w = Math.floor(VIEW_W * scale), h = Math.floor(VIEW_H * scale);
    const app = document.getElementById('app');
    app.style.width = w + 'px';
    app.style.height = h + 'px';
    app.style.setProperty('--ui-scale', (h / 720).toFixed(3));
    document.getElementById('scanlines').style.backgroundSize = '100% ' + Math.max(2, Math.round(scale)) + 'px';
    const k = Math.min(2, window.devicePixelRatio || 1) * S.visuals.resScale;
    Gfx.resize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  },

  draw(realDt) {
    this.fps = lerp(this.fps, 1 / Math.max(realDt, 0.001), 0.05);
    const G = Game, def = World.def, t = G.realTime;
    Gfx.beginFrame();
    for (const l of def.lights) {
      const f = l.flick ? (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.82 ? 0.25 : 1) : 1;
      Gfx.light(l.x, l.y, l.z, l.color, (S.visuals.lighting ? l.intensity : l.intensity * 0.6) * f, l.distance);
    }
    Gfx.endFrame();
    const p = G.player;
    this.standIn.visible = !!p;
    if (p) { this.standIn.position.set(p.pos.x, p.pos.y, p.pos.z); this.standIn.rotation.y = p.yaw; }
    Gfx.render();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (G.state === 'playing') {
      const cx = VIEW_W / 2, cy = VIEW_H / 2;
      ctx.fillStyle = '#0b0910'; ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = '#f2e6ee'; ctx.fillRect(cx, cy, 1, 1);
    }
    if (FX.flashA > 0) {
      ctx.globalAlpha = Math.min(0.7, FX.flashA);
      ctx.fillStyle = FX.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      FX.flashA = Math.max(0, FX.flashA - realDt * 6);
    }
    if (S.visuals.showFps) drawText(ctx, Math.round(this.fps) + ' FPS', VIEW_W - 4, VIEW_H - 9, { align: 'right', color: '#7a849c' });
  },
};
