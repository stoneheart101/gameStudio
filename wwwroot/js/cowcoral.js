// cowcoral.js  —  Cow Coral v3
// Level-based cow herding: pick up hay (8s lure), dodge mud, level up!

window.initCowCoral = function (dotNetRef) {
    const canvas = document.getElementById('cowCoralCanvas');
    if (!canvas) return;
    if (window.cowCoralGame) window.cowCoralGame.destroy();
    window.cowCoralGame = new CowCoralGame(canvas, dotNetRef);
    window.cowCoralGame.start();
};

window.restartCowCoral = function (dotNetRef) {
    const canvas = document.getElementById('cowCoralCanvas');
    if (!canvas) return;
    if (window.cowCoralGame) window.cowCoralGame.destroy();
    window.cowCoralGame = new CowCoralGame(canvas, dotNetRef);
    window.cowCoralGame.start();
};

window.destroyCowCoral = function () {
    if (window.cowCoralGame) { window.cowCoralGame.destroy(); window.cowCoralGame = null; }
};

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
function mkRng(seed) {
    let s = (seed ^ 0xdeadbeef) >>> 0;
    return () => { s = Math.imul(s ^ (s >>> 15), s | 1); s ^= s + Math.imul(s ^ (s >>> 7), s | 61); return ((s ^ (s >>> 14)) >>> 0) / 0x100000000; };
}

// ─── Main class ───────────────────────────────────────────────────────────────
class CowCoralGame {
    constructor(canvas, dotNetRef) {
        this.canvas    = canvas;
        this.ctx       = canvas.getContext('2d');
        this.dotNetRef = dotNetRef;
        this.W = canvas.width;   // 800
        this.H = canvas.height;  // 560

        // Pen — top-right, fixed, entrance gap at bottom-centre
        this.pen = { x: 644, y: 14, w: 138, h: 118 };

        // Input
        this.keys = {};
        this.keyHandler = e => {
            const cap = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyW','KeyS','KeyD'];
            if (cap.includes(e.code)) e.preventDefault();
            this.keys[e.code] = (e.type === 'keydown');
        };
        document.addEventListener('keydown', this.keyHandler);
        document.addEventListener('keyup',   this.keyHandler);

        this.touchVx = 0; this.touchVy = 0; this.touchOrigin = null;
        this.touchHandler = e => {
            e.preventDefault();
            if (e.type === 'touchstart') this.touchOrigin = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            else if (e.type === 'touchmove' && this.touchOrigin) {
                const dx = e.touches[0].clientX - this.touchOrigin.x;
                const dy = e.touches[0].clientY - this.touchOrigin.y;
                const len = Math.hypot(dx, dy);
                if (len > 0) { this.touchVx = dx/len; this.touchVy = dy/len; }
            } else { this.touchVx = 0; this.touchVy = 0; this.touchOrigin = null; }
        };
        canvas.addEventListener('touchstart', this.touchHandler, { passive: false });
        canvas.addEventListener('touchmove',  this.touchHandler, { passive: false });
        canvas.addEventListener('touchend',   this.touchHandler, { passive: false });

        // Persistent across levels
        this.level = 1;
        this.score = 0;

        // Player persists across levels (position resets each level)
        this.player = { x: 78, y: 285, r: 14, speed: 200, lastDx: 1, lastDy: 0, carryingHay: false, hayTimer: 0 };

        this.running   = false;
        this.animFrame = null;
        this.initLevel();
    }

    // ─── Difficulty scaling ────────────────────────────────────────────────────
    getDifficulty() {
        const L = this.level;
        return {
            cowCount:  Math.min(4 + L, 11),
            treeMin:   Math.min(3 + L * 2, 13),
            treeMax:   Math.min(5 + L * 2, 15),
            rockMin:   Math.max(0, L - 1),
            rockMax:   Math.max(1, L),
            mudCount:  Math.min(Math.max(0, L - 1), 6),
            hayCount:  Math.max(1, 4 - Math.floor(L / 2)),
            streamGap: Math.max(62, 118 - L * 8),
            cowSpeed:  Math.min(108 + L * 5, 155),
            fleeRange: Math.min(80 + L * 3, 105),
            mamaCount: L >= 5 ? Math.min(L - 4, 3) : 0,
        };
    }

    // ─── Level init ───────────────────────────────────────────────────────────
    initLevel() {
        const diff = this.getDifficulty();
        const rand = mkRng(Date.now() & 0xffffff | (this.level * 31337));
        this.diff = diff;

        // Reset player to starting position
        this.player.x = 78; this.player.y = 285;
        this.player.lastDx = 1; this.player.lastDy = 0;
        this.player.carryingHay = false; this.player.hayTimer = 0;

        // Generate world
        this.obstacles  = this.generateObstacles(rand, diff);
        this.cows       = this.placeCows(rand, diff);
        this.hays       = this.placeHays(rand, diff.hayCount);
        this.totalCows  = this.cows.length;

        // Level state
        this.corralled        = 0;
        this.timeLeft         = 120;
        this.hayRespawnTimer  = 0;
        this.levelComplete    = false;
        this.transitioning    = false;
        this.gameOver         = false;
        this.levelBonus       = 0;
        this.ts               = 0;
    }

    // ─── Map generation ───────────────────────────────────────────────────────
    generateObstacles(rand, diff) {
        const obs = [];
        const W = this.W, H = this.H, pen = this.pen;

        const inPen     = (x, y, r) => x+r > pen.x-50 && x-r < pen.x+pen.w+20 && y+r > pen.y-20 && y-r < pen.y+pen.h+50;
        const nearSpawn = (x, y, r) => Math.hypot(x-78, y-285) < 80 + r;
        const oob       = (x, y, r) => x-r < 15 || x+r > W-15 || y-r < 45 || y+r > H-15;
        const safe      = (x, y, r) => !inPen(x, y, r) && !nearSpawn(x, y, r) && !oob(x, y, r);
        const treeOk    = (x, y, r) => !obs.filter(o=>o.type==='tree').some(o => Math.hypot(x-o.x,y-o.y) < r+o.r+18);

        // Trees
        const treeTarget = diff.treeMin + Math.floor(rand() * (diff.treeMax - diff.treeMin + 1));
        for (let a = 0; obs.filter(o=>o.type==='tree').length < treeTarget && a < 300; a++) {
            const x = 60 + rand()*(W-120), y = 55 + rand()*(H-110), r = 17 + rand()*9;
            if (safe(x,y,r) && treeOk(x,y,r)) obs.push({ type:'tree', x, y, r });
        }

        // Rocks
        const rockTarget = diff.rockMin + Math.floor(rand() * (diff.rockMax - diff.rockMin + 1));
        for (let a = 0; obs.filter(o=>o.type==='rock').length < rockTarget && a < 200; a++) {
            const w = 36 + rand()*26, h = 22 + rand()*18;
            const x = 60 + rand()*(W-120-w), y = 55 + rand()*(H-110-h);
            if (safe(x+w/2, y+h/2, Math.max(w,h)/2)) obs.push({ type:'rock', x, y, w, h });
        }

        // Mud puddles (passable, slow)
        for (let a = 0; obs.filter(o=>o.type==='mud').length < diff.mudCount && a < 200; a++) {
            const cx = 70 + rand()*(W-140), cy = 60 + rand()*(H-120);
            const rx = 28 + rand()*22, ry = 18 + rand()*14;
            if (safe(cx, cy, rx) && !obs.filter(o=>o.type==='mud').some(o => Math.hypot(cx-o.x,cy-o.y) < rx+o.rx+20)) {
                obs.push({ type:'mud', x:cx, y:cy, rx, ry });
            }
        }

        // Stream — random orientation, always one crossing gap
        if (rand() < 0.5) {
            // Vertical
            const sx = 240 + rand()*200;
            if (sx < pen.x - 20 || sx > pen.x + pen.w) {
                const gapY = 120 + rand()*200, gapH = diff.streamGap + rand()*20;
                obs.push({ type:'stream', x:sx,   y:0,         w:26, h:gapY });
                obs.push({ type:'stream', x:sx,   y:gapY+gapH, w:26, h:H-gapY-gapH });
            } else {
                this._hstream(rand, obs, W, H, diff);
            }
        } else {
            this._hstream(rand, obs, W, H, diff);
        }

        return obs;
    }

    _hstream(rand, obs, W, H, diff) {
        const sy = 150 + rand()*180;
        const gapX = 160 + rand()*200, gapW = diff.streamGap + rand()*20;
        obs.push({ type:'stream', x:0,        y:sy, w:gapX,           h:26 });
        obs.push({ type:'stream', x:gapX+gapW, y:sy, w:W-gapX-gapW,   h:26 });
    }

    placeCows(rand, diff) {
        const cows = [], pen = this.pen, cowR = 14;
        const bad = (x, y) => {
            if (x < 20 || x > this.W-20 || y < 48 || y > this.H-20) return true;
            if (x+cowR > pen.x-10 && y+cowR > pen.y-10 && x-cowR < pen.x+pen.w+10 && y-cowR < pen.y+pen.h+10) return true;
            if (Math.hypot(x-78, y-285) < 72) return true;
            for (const o of this.obstacles) {
                if (o.type==='tree' && Math.hypot(x-o.x,y-o.y) < o.r+cowR+8) return true;
                if ((o.type==='rock'||o.type==='stream') && x+cowR>o.x-8 && x-cowR<o.x+o.w+8 && y+cowR>o.y-8 && y-cowR<o.y+o.h+8) return true;
            }
            for (const c of cows) { if (Math.hypot(x-c.x,y-c.y) < cowR*2+14) return true; }
            return false;
        };

        // Randomly designate mama cows
        const mamaSlots = new Set();
        while (mamaSlots.size < diff.mamaCount) mamaSlots.add(Math.floor(rand() * diff.cowCount));

        for (let attempt = 0; cows.length < diff.cowCount && attempt < 600; attempt++) {
            const x = 50 + rand()*(this.W-100), y = 55 + rand()*(this.H-110);
            if (!bad(x, y)) {
                const isMama = mamaSlots.has(cows.length);
                cows.push({ x, y, r:cowR, vx:0, vy:0, corralled:false, following:false, isCalf:false, isMama, hasBirthed:false, mama:null, wander:{ angle: rand()*Math.PI*2, changeTimer: rand()*3 } });
            }
        }
        return cows;
    }

    placeHays(rand, count) {
        const hays = [], pen = this.pen;
        const bad = (x, y) => {
            if (x < 30 || x > this.W-30 || y < 50 || y > this.H-30) return true;
            if (x > pen.x-30 && y > pen.y-30 && x < pen.x+pen.w+30 && y < pen.y+pen.h+30) return true;
            if (Math.hypot(x-78, y-285) < 55) return true;
            for (const o of this.obstacles) {
                if (o.type==='tree' && Math.hypot(x-o.x,y-o.y) < o.r+22) return true;
                if ((o.type==='rock'||o.type==='stream') && x>o.x-20 && x<o.x+o.w+20 && y>o.y-20 && y<o.y+o.h+20) return true;
            }
            for (const h of hays) { if (Math.hypot(x-h.x,y-h.y) < 60) return true; }
            return false;
        };
        for (let attempt = 0; hays.length < count && attempt < 300; attempt++) {
            const x = 40 + rand()*(this.W-80), y = 55 + rand()*(this.H-100);
            if (!bad(x, y)) hays.push({ x, y, active:true });
        }
        return hays;
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────
    start() { this.running = true; this.lastTime = performance.now(); this.animFrame = requestAnimationFrame(t => this.loop(t)); }

    destroy() {
        this.running = false;
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        document.removeEventListener('keydown', this.keyHandler);
        document.removeEventListener('keyup',   this.keyHandler);
        this.canvas.removeEventListener('touchstart', this.touchHandler);
        this.canvas.removeEventListener('touchmove',  this.touchHandler);
        this.canvas.removeEventListener('touchend',   this.touchHandler);
    }

    loop(ts) {
        if (!this.running) return;
        const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
        this.lastTime = ts; this.ts = ts;
        if (!this.transitioning && !this.gameOver) this.update(dt);
        this.draw(ts);
        this.animFrame = requestAnimationFrame(t => this.loop(t));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    dist(a, b) { return Math.hypot(a.x-b.x, a.y-b.y); }
    norm(dx, dy) { const d = Math.hypot(dx, dy); return d > 0.001 ? [dx/d, dy/d] : [0,0]; }
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    hitObs(x, y, r) {
        for (const o of this.obstacles) {
            if (o.type==='mud') continue; // mud is passable
            if (o.type==='tree') { if (Math.hypot(x-o.x,y-o.y) < r+o.r) return true; }
            else { if (x+r>o.x && x-r<o.x+o.w && y+r>o.y && y-r<o.y+o.h) return true; }
        }
        return false;
    }

    pushOut(entity, r) {
        for (const o of this.obstacles) {
            if (o.type==='mud') continue;
            if (o.type==='tree') {
                const dx = entity.x-o.x, dy = entity.y-o.y, d = Math.hypot(dx,dy), mn = r+o.r;
                if (d < mn && d > 0.001) { entity.x = o.x+(dx/d)*mn; entity.y = o.y+(dy/d)*mn; }
            } else {
                if (entity.x+r>o.x && entity.x-r<o.x+o.w && entity.y+r>o.y && entity.y-r<o.y+o.h) {
                    const ol=entity.x+r-o.x, or_=o.x+o.w-(entity.x-r), ot=entity.y+r-o.y, ob=o.y+o.h-(entity.y-r);
                    const m = Math.min(ol,or_,ot,ob);
                    if (m===ol) entity.x=o.x-r; else if (m===or_) entity.x=o.x+o.w+r;
                    else if (m===ot) entity.y=o.y-r; else entity.y=o.y+o.h+r;
                }
            }
        }
    }

    // Returns speed multiplier: 0.4 in mud, 1.0 normally
    getMudFactor(x, y) {
        for (const o of this.obstacles) {
            if (o.type!=='mud') continue;
            const dx=(x-o.x)/o.rx, dy=(y-o.y)/o.ry;
            if (dx*dx+dy*dy <= 1) return 0.4;
        }
        return 1.0;
    }

    // ─── Update ───────────────────────────────────────────────────────────────
    update(dt) {
        // Timer
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.endGame(false); return; }

        // Hay respawn if all consumed and cows remain
        if (!this.hays.some(h=>h.active) && this.cows.some(c=>!c.corralled)) {
            this.hayRespawnTimer += dt;
            if (this.hayRespawnTimer >= 18) {
                this.hayRespawnTimer = 0;
                for (let i = 0; i < 60; i++) {
                    const x = 40 + Math.random()*(this.W-80), y = 55 + Math.random()*(this.H-100);
                    const p = this.pen;
                    if (x>p.x-40 && y>p.y-40 && x<p.x+p.w+40 && y<p.y+p.h+40) continue;
                    if (Math.hypot(x-this.player.x, y-this.player.y) < 60) continue;
                    this.hays.push({ x, y, active:true });
                    break;
                }
            }
        } else this.hayRespawnTimer = 0;

        this.updatePlayer(dt);
        this.checkHayPickup();
        this.updateCows(dt);
    }

    updatePlayer(dt) {
        let pdx = 0, pdy = 0;
        if (this.keys['ArrowLeft']  || this.keys['KeyA']) pdx -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) pdx += 1;
        if (this.keys['ArrowUp']    || this.keys['KeyW']) pdy -= 1;
        if (this.keys['ArrowDown']  || this.keys['KeyS']) pdy += 1;
        pdx += this.touchVx; pdy += this.touchVy;

        if (pdx !== 0 || pdy !== 0) {
            const [nx, ny] = this.norm(pdx, pdy);
            this.player.lastDx = nx; this.player.lastDy = ny;

            const mud = this.getMudFactor(this.player.x + nx*2, this.player.y + ny*2);
            const sp  = this.player.speed * mud;
            const tx  = this.clamp(this.player.x + nx*sp*dt, this.player.r, this.W-this.player.r);
            const ty  = this.clamp(this.player.y + ny*sp*dt, this.player.r, this.H-this.player.r);
            const ox  = this.player.x, oy = this.player.y;

            this.player.x = tx; this.player.y = ty;
            if (this.hitObs(tx, ty, this.player.r)) {
                this.player.x = tx; this.player.y = oy;
                if (this.hitObs(tx, oy, this.player.r)) {
                    this.player.x = ox; this.player.y = ty;
                    if (this.hitObs(ox, ty, this.player.r)) { this.player.x = ox; this.player.y = oy; }
                }
            }
        }
    }

    checkHayPickup() {
        if (!this.player.carryingHay) {
            for (const h of this.hays) {
                if (!h.active) continue;
                if (Math.hypot(this.player.x-h.x, this.player.y-h.y) < 22) {
                    h.active = false;
                    this.player.carryingHay = true;
                    this.player.hayTimer = 8; // ← 8-second lure window

                    // Tag nearby cows as following; mama cows birth calves (level 5+)
                    for (const cow of [...this.cows]) { // spread because calves may be pushed in
                        if (!cow.corralled && !cow.isCalf && this.dist(cow, this.player) < 160) {
                            cow.following = true;
                            this.spawnCalf(cow);
                        }
                    }
                    break;
                }
            }
        }
        // Hay timer is ticked accurately in tickHay(dt) via updateCows
    }

    // Tick hay timer properly (called from updateCows too)
    tickHay(dt) {
        if (!this.player.carryingHay) return;
        this.player.hayTimer -= dt;
        if (this.player.hayTimer <= 0) {
            this.player.carryingHay = false;
            for (const cow of this.cows) cow.following = false;
        } else {
            // Cows that drift into lure range join
            for (const cow of this.cows) {
                if (!cow.corralled && !cow.following && !cow.isCalf && this.dist(cow, this.player) < 130) {
                    cow.following = true;
                    this.spawnCalf(cow);
                }
            }
        }
    }

    spawnCalf(mama) {
        if (!mama.isMama || mama.hasBirthed) return;
        mama.hasBirthed = true;
        const angle = Math.random() * Math.PI * 2;
        const calf = {
            x: mama.x + Math.cos(angle)*24, y: mama.y + Math.sin(angle)*24,
            r: 9, vx: 0, vy: 0,
            corralled: false, following: true,
            isCalf: true, isMama: false, hasBirthed: false, mama,
            wander: { angle: Math.random()*Math.PI*2, changeTimer: Math.random()*2 }
        };
        calf.x = this.clamp(calf.x, 20, this.W-20);
        calf.y = this.clamp(calf.y, 50, this.H-20);
        this.cows.push(calf);
        this.totalCows++;
    }

    updateCows(dt) {
        this.tickHay(dt); // tick hay timer here so dt is accurate

        const diff       = this.diff;
        const COH_R      = 56, SEP_R = 22, WANDER_F = 0.32;

        for (const cow of this.cows) {
            if (cow.corralled) continue;

            let fx = 0, fy = 0;

            // 1. Wander — always a soft background drift
            cow.wander.changeTimer -= dt;
            if (cow.wander.changeTimer <= 0) {
                cow.wander.angle += (Math.random()-0.5) * Math.PI * 1.3;
                cow.wander.changeTimer = 2 + Math.random()*4;
            }
            fx += Math.cos(cow.wander.angle) * WANDER_F;
            fy += Math.sin(cow.wander.angle) * WANDER_F;

            // 2. Calf: follow mama; regular: follow player OR flee
            if (cow.isCalf) {
                const target = cow.mama && !cow.mama.corralled ? cow.mama : this.player;
                const d = this.dist(cow, target);
                if (d > 18) {
                    const [nx, ny] = this.norm(target.x-cow.x, target.y-cow.y);
                    fx += nx * Math.min(d/35, 2.5) * 2.6;
                    fy += ny * Math.min(d/35, 2.5) * 2.6;
                }
            } else if (cow.following && this.player.carryingHay) {
                // Follow player with hay
                const d = this.dist(cow, this.player);
                if (d > 22) {
                    const [nx, ny] = this.norm(this.player.x-cow.x, this.player.y-cow.y);
                    fx += nx * Math.min(d/45, 2.2) * 2.5;
                    fy += ny * Math.min(d/45, 2.2) * 2.5;
                }
            } else {
                // Flee horse
                const dp = this.dist(cow, this.player);
                if (dp < diff.fleeRange) {
                    const [nx, ny] = this.norm(cow.x-this.player.x, cow.y-this.player.y);
                    fx += nx * ((diff.fleeRange-dp)/diff.fleeRange) * 2.7;
                    fy += ny * ((diff.fleeRange-dp)/diff.fleeRange) * 2.7;
                }
            }

            // 3. Flocking
            for (const other of this.cows) {
                if (other===cow || other.corralled) continue;
                const d = this.dist(cow, other);
                if (d < SEP_R && d > 0.5) {
                    const [nx,ny] = this.norm(cow.x-other.x, cow.y-other.y);
                    fx += nx*1.4; fy += ny*1.4;
                } else if (d < COH_R) {
                    const [nx,ny] = this.norm(other.x-cow.x, other.y-cow.y);
                    fx += nx*0.34; fy += ny*0.34;
                }
            }

            // 4. Soft boundary
            const mg = 22;
            if (cow.x < mg)          fx += (mg-cow.x)/mg*2.2;
            if (cow.x > this.W-mg)   fx -= (cow.x-(this.W-mg))/mg*2.2;
            if (cow.y < mg+28)       fy += (mg+28-cow.y)/mg*2.2;
            if (cow.y > this.H-mg)   fy -= (cow.y-(this.H-mg))/mg*2.2;

            // 5. Apply velocity with mud slowdown
            const mud   = this.getMudFactor(cow.x, cow.y);
            const spd   = Math.min(Math.hypot(fx,fy)/2.8, 1) * diff.cowSpeed * mud;
            const fmag  = Math.hypot(fx, fy);
            if (fmag > 0.1) {
                const [nx,ny] = this.norm(fx, fy);
                cow.vx = nx*spd; cow.vy = ny*spd;
            } else { cow.vx *= 0.80; cow.vy *= 0.80; }

            cow.x = this.clamp(cow.x + cow.vx*dt, cow.r, this.W-cow.r);
            cow.y = this.clamp(cow.y + cow.vy*dt, cow.r+28, this.H-cow.r);
            this.pushOut(cow, cow.r);

            // Corral check
            const p = this.pen;
            if (cow.x > p.x+cow.r && cow.x < p.x+p.w-cow.r && cow.y > p.y+cow.r && cow.y < p.y+p.h-cow.r) {
                cow.corralled = true; cow.vx = 0; cow.vy = 0;
                this.corralled++;
                this.score += cow.isCalf ? 50 : 100;

                // Auto-corral this cow's calves if mama just entered
                if (!cow.isCalf) {
                    for (const calf of this.cows) {
                        if (calf.isCalf && calf.mama===cow && !calf.corralled) {
                            calf.corralled = true; calf.vx = 0; calf.vy = 0;
                            this.corralled++; this.score += 50;
                        }
                    }
                }

                if (this.corralled >= this.totalCows) {
                    this.levelBonus = Math.floor(this.timeLeft) * 3;
                    this.score += this.levelBonus;
                    this.endGame(true);
                    return;
                }
            }
        }
    }

    endGame(won) {
        if (won) {
            this.levelComplete  = true;
            this.transitioning  = true;
            setTimeout(() => { this.level++; this.initLevel(); }, 2400);
        } else {
            this.gameOver = true;
            setTimeout(() => this.dotNetRef.invokeMethodAsync('OnGameOver', this.score), 1600);
        }
    }

    // ─── Draw ─────────────────────────────────────────────────────────────────
    draw(ts) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);

        // Grass
        ctx.fillStyle = '#2a6618'; ctx.fillRect(0,0,this.W,this.H);
        ctx.fillStyle = 'rgba(50,110,25,0.4)';
        for (let gx=20; gx<this.W; gx+=40) for (let gy=48; gy<this.H; gy+=40) { ctx.beginPath(); ctx.arc(gx,gy,1.5,0,Math.PI*2); ctx.fill(); }

        this.drawMud(ctx);        // mud first (under everything)
        this.drawStreams(ctx, ts);
        this.drawRocks(ctx);
        this.drawTrees(ctx);
        this.drawPen(ctx);

        for (const h of this.hays) if (h.active) this.drawHay(ctx, h.x, h.y, ts);

        // Lure ring
        if (this.player.carryingHay) {
            const alpha = 0.12 + 0.06*Math.sin(ts*0.005);
            ctx.strokeStyle = `rgba(255,220,50,${alpha+0.15})`;
            ctx.lineWidth = 2; ctx.setLineDash([6,4]);
            ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 130, 0, Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
        }

        for (const cow of this.cows) if (!cow.corralled) this.drawCow(ctx, cow.x, cow.y, cow.isCalf?0.55:1, cow.following, cow.isCalf, cow.isMama);
        this.drawHorse(ctx, this.player.x, this.player.y, this.player.lastDx, this.player.lastDy, this.player.carryingHay, ts);
        this.drawHUD(ctx, ts);

        if (this.levelComplete) this.drawLevelComplete(ctx);
        if (this.gameOver)      this.drawGameOver(ctx);
    }

    drawMud(ctx) {
        for (const o of this.obstacles) {
            if (o.type!=='mud') continue;
            // Dark brown oval
            ctx.fillStyle = 'rgba(78,52,18,0.80)';
            ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx, o.ry, 0, 0, Math.PI*2); ctx.fill();
            // Lighter inner
            ctx.fillStyle = 'rgba(110,76,30,0.55)';
            ctx.beginPath(); ctx.ellipse(o.x-o.rx*0.15, o.y-o.ry*0.2, o.rx*0.6, o.ry*0.55, 0.3, 0, Math.PI*2); ctx.fill();
            // Glossy sheen
            ctx.fillStyle = 'rgba(145,105,50,0.38)';
            ctx.beginPath(); ctx.ellipse(o.x-o.rx*0.25, o.y-o.ry*0.32, o.rx*0.26, o.ry*0.16, -0.2, 0, Math.PI*2); ctx.fill();
            // Splatter dots
            ctx.fillStyle = 'rgba(88,58,18,0.65)';
            for (let i=0; i<6; i++) {
                const sx = o.x + ((i*19)%(o.rx|1)) - o.rx*0.45;
                const sy = o.y + ((i*13)%(o.ry|1)) - o.ry*0.35;
                ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI*2); ctx.fill();
            }
            // Label
            ctx.fillStyle = 'rgba(200,160,80,0.5)';
            ctx.font = '7px monospace'; ctx.textAlign = 'center';
            ctx.fillText('MUD', o.x, o.y + o.ry + 10);
        }
    }

    drawStreams(ctx, ts) {
        for (const o of this.obstacles) {
            if (o.type!=='stream') continue;
            ctx.fillStyle = '#1a6aaa'; ctx.fillRect(o.x,o.y,o.w,o.h);
            ctx.fillStyle = 'rgba(80,160,255,0.3)'; ctx.fillRect(o.x+3,o.y+2,o.w-6,5);
            ctx.strokeStyle = 'rgba(100,190,255,0.5)'; ctx.lineWidth = 1.5;
            const isV = o.h > o.w;
            if (isV) {
                for (let wy=o.y+10; wy<o.y+o.h-4; wy+=14) {
                    ctx.beginPath();
                    for (let wx=o.x+2; wx<=o.x+o.w-2; wx+=5) { const py=wy+Math.sin(wx*0.6+ts*0.002)*2; wx===o.x+2?ctx.moveTo(wx,py):ctx.lineTo(wx,py); }
                    ctx.stroke();
                }
            } else {
                for (let wx=o.x+10; wx<o.x+o.w-4; wx+=14) {
                    ctx.beginPath();
                    for (let wy=o.y+2; wy<=o.y+o.h-2; wy+=5) { const px=wx+Math.sin(wy*0.6+ts*0.002)*2; wy===o.y+2?ctx.moveTo(px,wy):ctx.lineTo(px,wy); }
                    ctx.stroke();
                }
            }
        }
    }

    drawRocks(ctx) {
        for (const o of this.obstacles) {
            if (o.type!=='rock') continue;
            ctx.fillStyle='#7a7a7a'; this.rrect(ctx,o.x,o.y,o.w,o.h,8); ctx.fill();
            ctx.fillStyle='#9e9e9e'; this.rrect(ctx,o.x+4,o.y+3,o.w-10,(o.h>>1)-2,5); ctx.fill();
            ctx.strokeStyle='#555'; ctx.lineWidth=1.5; this.rrect(ctx,o.x,o.y,o.w,o.h,8); ctx.stroke();
        }
    }

    drawTrees(ctx) {
        for (const o of this.obstacles) {
            if (o.type!=='tree') continue;
            ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(o.x+5,o.y+6,o.r*.88,o.r*.44,0,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#6b3a1f'; ctx.fillRect(o.x-4,o.y-2,8,12);
            ctx.fillStyle='#1a5c0a'; ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#2d8c14'; ctx.beginPath(); ctx.arc(o.x-4,o.y-5,o.r*.55,0,Math.PI*2); ctx.fill();
        }
    }

    drawPen(ctx) {
        const p = this.pen;
        ctx.fillStyle='#c8a560'; ctx.fillRect(p.x,p.y,p.w,p.h);
        ctx.fillStyle='#a88040';
        for (let i=0;i<20;i++) { ctx.beginPath(); ctx.arc(p.x+(i*41%p.w)+4,p.y+(i*29%p.h)+4,2,0,Math.PI*2); ctx.fill(); }
        const inside = this.cows.filter(c=>c.corralled);
        for (let i=0;i<inside.length;i++) {
            const c = inside[i];
            this.drawCow(ctx, p.x+18+(i%3)*40, p.y+36+Math.floor(i/3)*34, c.isCalf?0.42:0.68, false, c.isCalf, false);
        }
        // Posts
        ctx.strokeStyle='#8b5e3c'; ctx.lineWidth=5;
        for (const px of [p.x, p.x+p.w*.33, p.x+p.w*.67, p.x+p.w]) { ctx.beginPath(); ctx.moveTo(px,p.y-5); ctx.lineTo(px,p.y+p.h+5); ctx.stroke(); }
        // Rails
        ctx.lineWidth=4;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);       ctx.lineTo(p.x+p.w,p.y);
        ctx.moveTo(p.x,p.y);       ctx.lineTo(p.x,p.y+p.h);
        ctx.moveTo(p.x+p.w,p.y);   ctx.lineTo(p.x+p.w,p.y+p.h);
        ctx.moveTo(p.x,p.y+p.h);   ctx.lineTo(p.x+p.w*.33,p.y+p.h);
        ctx.moveTo(p.x+p.w*.67,p.y+p.h); ctx.lineTo(p.x+p.w,p.y+p.h);
        ctx.stroke();
        ctx.strokeStyle='#7a4e2d'; ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y+p.h*.38); ctx.lineTo(p.x+p.w,p.y+p.h*.38);
        ctx.moveTo(p.x,p.y+p.h*.68); ctx.lineTo(p.x+p.w,p.y+p.h*.68);
        ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='9px "Press Start 2P",monospace'; ctx.textAlign='center';
        ctx.fillText('PEN', p.x+p.w/2, p.y+14);
        ctx.fillStyle='#ffd700'; ctx.font='15px monospace';
        ctx.fillText('▼', p.x+p.w/2, p.y+p.h+18);
    }

    drawHay(ctx, x, y, ts) {
        const pulse = 0.14+0.07*Math.sin(ts*.004);
        ctx.fillStyle=`rgba(255,220,50,${pulse})`; ctx.beginPath(); ctx.arc(x,y,22,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#d4aa20'; this.rrect(ctx,x-13,y-11,26,22,5); ctx.fill();
        ctx.strokeStyle='#a07a00'; ctx.lineWidth=1.5; this.rrect(ctx,x-13,y-11,26,22,5); ctx.stroke();
        ctx.strokeStyle='#f0cc40'; ctx.lineWidth=1; ctx.beginPath();
        for (const lx of [-6,0,6]) { ctx.moveTo(x+lx,y-9); ctx.lineTo(x+lx,y+9); }
        ctx.stroke();
    }

    drawCow(ctx, x, y, scale, following, isCalf, isMama) {
        const s = scale;
        ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
        if (following) { ctx.fillStyle='rgba(255,220,50,0.25)'; ctx.beginPath(); ctx.arc(0,0,22,0,Math.PI*2); ctx.fill(); }
        // Mama glow (pink)
        if (isMama && !isCalf) { ctx.fillStyle='rgba(255,160,200,0.2)'; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.fill(); }
        // Shadow
        ctx.fillStyle='rgba(0,0,0,0.17)'; ctx.beginPath(); ctx.ellipse(2,12,13,5,0,0,Math.PI*2); ctx.fill();
        // Body — calves are lighter/creamier
        ctx.fillStyle = isCalf ? '#fff0d8' : '#f5f5f0';
        ctx.beginPath(); ctx.ellipse(0,0,14,10,0,0,Math.PI*2); ctx.fill();
        // Spots — none on calves
        if (!isCalf) {
            ctx.fillStyle='#1a1a1a';
            ctx.beginPath(); ctx.ellipse(-4,-3,5,4,.5,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(6,2,4,3,-.3,0,Math.PI*2); ctx.fill();
        } else {
            // Small spot on calf
            ctx.fillStyle='rgba(180,140,90,0.5)';
            ctx.beginPath(); ctx.ellipse(-3,-2,4,3,.4,0,Math.PI*2); ctx.fill();
        }
        // Head
        ctx.fillStyle= isCalf ? '#ffe8c0' : '#f0ece0';
        ctx.beginPath(); ctx.ellipse(14,-1, isCalf?5:6, isCalf?5:5, .2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(16,-2.5,1.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(16.6,-3,.6,0,Math.PI*2); ctx.fill();
        // Horns — only on adult non-calf cows
        if (!isCalf) {
            ctx.strokeStyle='#c8a060'; ctx.lineWidth=1.5;
            ctx.beginPath(); ctx.moveTo(13,-5); ctx.lineTo(11,-9); ctx.moveTo(16,-5); ctx.lineTo(18,-9); ctx.stroke();
        }
        // Legs
        ctx.strokeStyle=isCalf?'#e8d0a0':'#ccc'; ctx.lineWidth=2.5; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(-8,8); ctx.lineTo(-8,16); ctx.moveTo(-2,9); ctx.lineTo(-2,16);
        ctx.moveTo(4,9);  ctx.lineTo(4,16);  ctx.moveTo(9,8);  ctx.lineTo(9,15);
        ctx.stroke(); ctx.lineCap='butt';
        // Outline
        ctx.strokeStyle='rgba(100,100,100,0.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.ellipse(0,0,14,10,0,0,Math.PI*2); ctx.stroke();
        // Mama star indicator
        if (isMama && !isCalf) {
            ctx.fillStyle='rgba(255,180,220,0.9)'; ctx.font='8px monospace'; ctx.textAlign='center';
            ctx.fillText('♥', 0, -14);
        }
        ctx.restore();
    }

    drawHorse(ctx, x, y, dx, dy, carryingHay, ts) {
        const moving = Math.abs(dx)>.05 || Math.abs(dy)>.05;
        // Mud tint if in mud
        const inMud = this.getMudFactor(x, y) < 1;
        ctx.save(); ctx.translate(x,y);
        if (inMud) { ctx.globalAlpha=1; } // no alpha change, just visual hint via mud label

        ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(3,12,15,6,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle= inMud ? '#7a5030' : '#8b5e3c';
        ctx.beginPath(); ctx.ellipse(0,0,16,11,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#a07040'; ctx.beginPath(); ctx.ellipse(-3,-4,9,5,-.3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#7a5030';
        ctx.beginPath(); ctx.moveTo(10,-4); ctx.quadraticCurveTo(16,-8,20,-4); ctx.quadraticCurveTo(22,0,18,3); ctx.quadraticCurveTo(12,4,10,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#a07060'; ctx.beginPath(); ctx.ellipse(21,1,4,3,.2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#5a3020'; ctx.beginPath(); ctx.arc(22,0,1.1,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(22,2.5,1.1,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(18,-4,2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(18.7,-4.5,.8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#3a2010'; ctx.beginPath(); ctx.ellipse(2,-8,5,3,-.2,0,Math.PI*2); ctx.fill();
        const t=ts*.001, lo=moving?[Math.sin(t*8)*4,Math.sin(t*8+Math.PI)*4,Math.sin(t*8+Math.PI*.5)*4,Math.sin(t*8+Math.PI*1.5)*4]:[0,0,0,0];
        ctx.strokeStyle='#6b4020'; ctx.lineWidth=3; ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(-9,9); ctx.lineTo(-9,17+lo[0]); ctx.moveTo(-3,10); ctx.lineTo(-3,17+lo[1]);
        ctx.moveTo(4,10); ctx.lineTo(4,17+lo[2]);  ctx.moveTo(10,9); ctx.lineTo(10,17+lo[3]);
        ctx.stroke(); ctx.lineCap='butt';
        ctx.strokeStyle='#c09060'; ctx.lineWidth=3;
        ctx.beginPath(); const tw=Math.sin(t*(moving?6:2))*(moving?6:3); ctx.moveTo(-15,0); ctx.quadraticCurveTo(-22,6+tw,-19,16+tw); ctx.stroke();
        ctx.fillStyle='#e8c880'; ctx.beginPath(); ctx.arc(0,-16,5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#a05010'; ctx.fillRect(-8,-24,16,3); ctx.fillRect(-5,-30,10,7);
        ctx.fillStyle='#4060c0'; ctx.fillRect(-4,-12,8,8);
        if (carryingHay) {
            ctx.fillStyle='#d4aa20'; this.rrect(ctx,-18,-14,16,12,3); ctx.fill();
            ctx.strokeStyle='#a07a00'; ctx.lineWidth=1; this.rrect(ctx,-18,-14,16,12,3); ctx.stroke();
            ctx.strokeStyle='#f0cc40'; ctx.lineWidth=.8; ctx.beginPath();
            ctx.moveTo(-14,-13); ctx.lineTo(-14,-3); ctx.moveTo(-10,-13); ctx.lineTo(-10,-3); ctx.stroke();
        }
        if (inMud) {
            ctx.fillStyle='rgba(100,70,30,0.55)'; ctx.beginPath(); ctx.ellipse(0,10,10,5,0,0,Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }

    drawHUD(ctx, ts) {
        ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,this.W,40);

        // Level badge
        ctx.fillStyle='#00e5ff'; ctx.font='9px "Press Start 2P",monospace'; ctx.textAlign='left';
        ctx.fillText(`LVL ${this.level}`, 12, 26);

        // Score
        ctx.fillStyle='#ffd700'; ctx.font='10px "Press Start 2P",monospace';
        ctx.fillText(`${this.score}`, 85, 26);

        // Cows
        ctx.fillStyle='#00ff41'; ctx.textAlign='center';
        ctx.fillText(`\uD83D\uDC04 ${this.corralled}/${this.totalCows}`, this.W/2, 26);

        // Hay timer bar
        if (this.player.carryingHay) {
            const ratio = this.player.hayTimer / 8;
            ctx.fillStyle='#222'; ctx.fillRect(this.W/2+60, 12, 78, 14);
            ctx.fillStyle = ratio > 0.5 ? '#ffd700' : ratio > 0.25 ? '#ff9900' : '#ff3366';
            ctx.fillRect(this.W/2+60, 12, 78*ratio, 14);
            ctx.strokeStyle='#888'; ctx.lineWidth=1; ctx.strokeRect(this.W/2+60, 12, 78, 14);
            ctx.fillStyle='#fff'; ctx.font='7px "Press Start 2P",monospace'; ctx.textAlign='left';
            ctx.fillText('HAY', this.W/2+64, 23);
        }

        // Timer bar
        const ratio = this.timeLeft/120;
        const bw=160, bx=this.W-bw-12;
        ctx.fillStyle='#222'; ctx.fillRect(bx,11,bw,17);
        ctx.fillStyle = ratio>.5?'#00ff41':ratio>.25?'#ffd700':'#ff3366';
        ctx.fillRect(bx,11,bw*ratio,17);
        ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.strokeRect(bx,11,bw,17);
        ctx.fillStyle='#fff'; ctx.font='8px "Press Start 2P",monospace'; ctx.textAlign='right';
        ctx.fillText(`${Math.ceil(this.timeLeft)}s`, this.W-12, 25);
    }

    drawLevelComplete(ctx) {
        ctx.fillStyle='rgba(0,0,0,0.70)'; ctx.fillRect(0,0,this.W,this.H);
        ctx.textAlign='center';
        ctx.fillStyle='#ffd700'; ctx.font='bold 18px "Press Start 2P",monospace';
        ctx.fillText(`LEVEL ${this.level} CLEAR!`, this.W/2, this.H/2-38);
        ctx.fillStyle='#00ff41'; ctx.font='11px "Press Start 2P",monospace';
        ctx.fillText(`+${this.levelBonus} TIME BONUS`, this.W/2, this.H/2-4);
        ctx.fillStyle='#fff'; ctx.font='12px "Press Start 2P",monospace';
        ctx.fillText(`SCORE: ${this.score}`, this.W/2, this.H/2+28);
        ctx.fillStyle='#aaa'; ctx.font='8px "Press Start 2P",monospace';
        ctx.fillText(`LEVEL ${this.level+1} INCOMING...`, this.W/2, this.H/2+58);
    }

    drawGameOver(ctx) {
        ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.fillRect(0,0,this.W,this.H);
        ctx.textAlign='center';
        ctx.fillStyle='#ff3366'; ctx.font='bold 22px "Press Start 2P",monospace';
        ctx.fillText("TIME'S UP!", this.W/2, this.H/2-28);
        ctx.fillStyle='#fff'; ctx.font='13px "Press Start 2P",monospace';
        ctx.fillText(`SCORE: ${this.score}`, this.W/2, this.H/2+12);
        ctx.fillText(`REACHED LEVEL ${this.level}`, this.W/2, this.H/2+40);
    }

    rrect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
        ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
        ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
        ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
        ctx.closePath();
    }
}
