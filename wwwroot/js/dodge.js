window.initDodge = function (dotNetRef, character) {
    const canvas = document.getElementById('dodgeCanvas');
    if (!canvas) return;
    if (window.dodgeGame) window.dodgeGame.destroy();
    window.dodgeGame = new DodgeGame(canvas, dotNetRef, character);
    window.dodgeGame.start();
};

window.restartDodge = function (dotNetRef, character) {
    const canvas = document.getElementById('dodgeCanvas');
    if (!canvas) return;
    if (window.dodgeGame) window.dodgeGame.destroy();
    window.dodgeGame = new DodgeGame(canvas, dotNetRef, character);
    window.dodgeGame.start();
};

window.destroyDodge = function () {
    if (window.dodgeGame) {
        window.dodgeGame.destroy();
        window.dodgeGame = null;
    }
};

// Per-character stat profiles
const CHAR_STATS = {
    cat: { maxHealth: 3, laneSpeed: 0.28, hitRadius: 0.28 }, // agile, snappy
    dog: { maxHealth: 5, laneSpeed: 0.12, hitRadius: 0.34 }, // tanky, slower turns
};

class DodgeGame {
    constructor(canvas, dotNetRef, character) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dotNetRef = dotNetRef;
        this.character = character;
        this.W = canvas.width;
        this.H = canvas.height;

        this.HORIZON_Y = this.H * 0.38;
        this.ROAD_HALF_FAR = 42;
        this.ROAD_HALF_NEAR = this.W * 0.46;
        this.MAX_Z = 1000;
        this.MIN_Z = 70;
        this.LANE_NX = [-0.62, 0, 0.62]; // normalized x per lane

        this.reset();

        this.keyHandler = e => {
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.moveDir(-1); }
            if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); this.moveDir(1); }
        };
        document.addEventListener('keydown', this.keyHandler);

        this.touchStartX = 0;
        this.touchHandler = e => {
            if (e.type === 'touchstart') { e.preventDefault(); this.touchStartX = e.touches[0].clientX; }
            if (e.type === 'touchend') {
                const dx = e.changedTouches[0].clientX - this.touchStartX;
                if (dx < -30) this.moveDir(-1);
                else if (dx > 30) this.moveDir(1);
            }
        };
        canvas.addEventListener('touchstart', this.touchHandler, { passive: false });
        canvas.addEventListener('touchend', this.touchHandler);
    }

    reset() {
        const stats = CHAR_STATS[this.character] ?? CHAR_STATS.cat;
        this.score = 0;
        this.health = stats.maxHealth;
        this.maxHealth = stats.maxHealth;
        this.lane = 1;
        this.playerNX = this.LANE_NX[1];
        this.targetNX = this.LANE_NX[1];
        this.objects = [];
        this.floats = [];
        this.gameOver = false;
        this.frame = 0;
        this.speed = 3.5;
        this.spawnTimer = 0;
        this.spawnInterval = 90;
        this.invincible = 0;
        this.screenShake = 0;
    }

    start() {
        this.lastTime = performance.now();
        this.animFrame = requestAnimationFrame(t => this.loop(t));
    }

    loop(time) {
        const dt = Math.min(time - this.lastTime, 50);
        this.lastTime = time;
        this.update(dt);
        this.draw();
        if (!this.gameOver) {
            this.animFrame = requestAnimationFrame(t => this.loop(t));
        } else {
            setTimeout(() => {
                if (this.dotNetRef)
                    this.dotNetRef.invokeMethodAsync('OnDodgeGameOver', Math.floor(this.score));
            }, 900);
        }
    }

    moveDir(dir) {
        if (this.gameOver) return;
        const next = this.lane + dir;
        if (next >= 0 && next <= 2) {
            this.lane = next;
            this.targetNX = this.LANE_NX[this.lane];
        }
    }

    update(dt) {
        this.frame++;

        // Smooth lane transition (cat is snappier, dog is heavier)
        const stats = CHAR_STATS[this.character] ?? CHAR_STATS.cat;
        this.playerNX += (this.targetNX - this.playerNX) * stats.laneSpeed;

        // Score = distance traveled
        this.score += this.speed * 0.038;

        // Speed ramp
        this.speed = 3.5 + this.score * 0.007;

        // Spawn
        this.spawnTimer++;
        const interval = Math.max(42, 90 - this.score * 0.09);
        if (this.spawnTimer >= interval) {
            this.spawnTimer = 0;
            this.spawnObjects();
        }

        // Move objects
        for (const obj of this.objects) obj.z -= this.speed;

        // Collisions
        if (this.invincible > 0) this.invincible--;

        for (const obj of this.objects) {
            if (obj.collected || obj.z > this.MIN_Z || obj.z < -30) continue;
            const dist = Math.abs(this.playerNX - obj.nx);
            if (dist > stats.hitRadius) continue;

            obj.collected = true;
            if (obj.type === 'sushi') {
                if (this.health < this.maxHealth) {
                    this.health++;
                    this.pushFloat('+1 ❤️', '#ff6699');
                }
            } else if (this.invincible === 0) {
                this.health--;
                this.invincible = 55;
                this.screenShake = 12;
                this.pushFloat(obj.type === 'tree' ? '🌳 OOF!' : '🪨 OW!', '#ff4444');
                if (this.health <= 0) {
                    this.health = 0;
                    this.gameOver = true;
                }
            }
        }

        this.objects = this.objects.filter(o => o.z > -80);

        // Floating texts
        for (const f of this.floats) { f.y -= 1.2; f.life--; }
        this.floats = this.floats.filter(f => f.life > 0);

        if (this.screenShake > 0) this.screenShake--;
    }

    spawnObjects() {
        const usedLanes = new Set();

        // Primary obstacle
        const lane = Math.floor(Math.random() * 3);
        const roll = Math.random();
        const type = roll < 0.2 ? 'sushi' : (roll < 0.58 ? 'rock' : 'tree');
        this.objects.push({ type, lane, nx: this.LANE_NX[lane], z: this.MAX_Z, collected: false });
        usedLanes.add(lane);

        // Second object at higher scores
        if (this.score > 30 && Math.random() < 0.35) {
            const lanes = [0, 1, 2].filter(l => !usedLanes.has(l));
            const l2 = lanes[Math.floor(Math.random() * lanes.length)];
            const t2 = Math.random() < 0.2 ? 'sushi' : (Math.random() < 0.5 ? 'rock' : 'tree');
            this.objects.push({ type: t2, lane: l2, nx: this.LANE_NX[l2], z: this.MAX_Z - 60, collected: false });
        }
    }

    pushFloat(text, color) {
        this.floats.push({ text, color, x: this.W / 2, y: this.H - 130, life: 70 });
    }

    // ─── Projection ───────────────────────────────────────────

    zToT(z) { return Math.max(0, 1 - z / this.MAX_Z); }

    roadXAt(nx, t) {
        const cx = this.W / 2;
        const hw = this.ROAD_HALF_FAR + (this.ROAD_HALF_NEAR - this.ROAD_HALF_FAR) * t;
        return cx + nx * hw;
    }

    roadYAt(t) { return this.HORIZON_Y + (this.H - this.HORIZON_Y) * t; }

    project(nx, z) {
        const t = this.zToT(z);
        return { x: this.roadXAt(nx, t), y: this.roadYAt(t), scale: Math.max(0.02, t), t };
    }

    // ─── Drawing ──────────────────────────────────────────────

    draw() {
        const ctx = this.ctx;
        ctx.save();

        // Screen shake
        if (this.screenShake > 0) {
            const s = this.screenShake * 0.5;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }

        this.drawSky();
        this.drawGround();
        this.drawRoad();
        this.drawSideTrees();
        this.drawObjects();
        this.drawPlayer();
        this.drawHUD();
        this.drawFloats();

        // Hit flash
        if (this.invincible > 48) {
            ctx.fillStyle = 'rgba(255,50,50,0.22)';
            ctx.fillRect(0, 0, this.W, this.H);
        }

        ctx.restore();
    }

    drawSky() {
        const ctx = this.ctx;
        const W = this.W, hy = this.HORIZON_Y;

        const g = ctx.createLinearGradient(0, 0, 0, hy);
        g.addColorStop(0, '#5bb8f5');
        g.addColorStop(0.6, '#a8d8f0');
        g.addColorStop(1, '#d6eefa');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, hy);

        // Sun
        ctx.fillStyle = '#ffe566';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(this.W * 0.78, hy * 0.28, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Clouds (parallax scroll)
        this.drawCloud(ctx, ((this.frame * 0.18 + 60) % (W + 130)) - 65, hy * 0.28, 0.9);
        this.drawCloud(ctx, ((this.frame * 0.10 + 280) % (W + 130)) - 65, hy * 0.52, 0.6);
        this.drawCloud(ctx, ((this.frame * 0.14 + 480) % (W + 130)) - 65, hy * 0.18, 0.75);
    }

    drawCloud(ctx, x, y, sc) {
        const r = 24 * sc;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.arc(x + r * 1.25, y + r * 0.2, r * 0.85, 0, Math.PI * 2);
        ctx.arc(x - r * 1.1, y + r * 0.25, r * 0.75, 0, Math.PI * 2);
        ctx.arc(x + r * 0.35, y - r * 0.55, r * 0.82, 0, Math.PI * 2);
        ctx.fill();
    }

    drawGround() {
        const ctx = this.ctx;
        const W = this.W, H = this.H, hy = this.HORIZON_Y;

        const g = ctx.createLinearGradient(0, hy, 0, H);
        g.addColorStop(0, '#62c462');
        g.addColorStop(1, '#3a8a3a');
        ctx.fillStyle = g;
        ctx.fillRect(0, hy, W, H - hy);

        // Grass rows
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        for (let i = 1; i < 10; i++) {
            const t = i / 10;
            const y = hy + (H - hy) * t;
            ctx.lineWidth = t * 2;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Flowers on sides (animated position)
        const flowerPositions = [
            { nx: -1.1, z: 300 }, { nx: 1.15, z: 300 },
            { nx: -1.05, z: 550 }, { nx: 1.1, z: 550 },
            { nx: -1.2, z: 150 }, { nx: 1.2, z: 150 },
        ];
        for (const fp of flowerPositions) {
            const fz = (900 - ((fp.z + this.frame * this.speed * 0.5) % 900)) + 50;
            const p = this.project(fp.nx, fz);
            if (p.t > 0.04) this.drawFlower(p.x, p.y, p.scale);
        }
    }

    drawFlower(x, y, sc) {
        const ctx = this.ctx;
        const r = sc * 18;
        // Petals
        const colors = ['#ff88cc', '#ffdd44', '#ff6688', '#aaddff'];
        const color = colors[Math.floor((x + y) * 3) % colors.length];
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, r * 0.55, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#ffee44';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawRoad() {
        const ctx = this.ctx;
        const W = this.W, H = this.H, hy = this.HORIZON_Y;
        const cx = W / 2;
        const hfar = this.ROAD_HALF_FAR, hnear = this.ROAD_HALF_NEAR;

        // Dirt path
        ctx.fillStyle = '#c9a86c';
        ctx.beginPath();
        ctx.moveTo(cx - hfar, hy);
        ctx.lineTo(cx + hfar, hy);
        ctx.lineTo(cx + hnear, H);
        ctx.lineTo(cx - hnear, H);
        ctx.closePath();
        ctx.fill();

        // Depth shading
        const sg = ctx.createLinearGradient(0, hy, 0, H);
        sg.addColorStop(0, 'rgba(0,0,0,0.18)');
        sg.addColorStop(0.5, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(cx - hfar, hy); ctx.lineTo(cx + hfar, hy);
        ctx.lineTo(cx + hnear, H); ctx.lineTo(cx - hnear, H);
        ctx.closePath();
        ctx.fill();

        // Road edges
        ctx.strokeStyle = '#a07840';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - hfar, hy); ctx.lineTo(cx - hnear, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + hfar, hy); ctx.lineTo(cx + hnear, H); ctx.stroke();

        // Lane dividers (animated dashes)
        const DASHES = 9;
        for (let d = 0; d < DASHES; d++) {
            const t1 = ((d / DASHES + this.frame * 0.006) % 1);
            const t2 = (((d + 0.38) / DASHES + this.frame * 0.006) % 1);
            if (t1 >= t2) continue;
            const y1 = this.roadYAt(t1), y2 = this.roadYAt(t2);
            const lw = 1.5 + 5 * t1;
            // Left divider
            ctx.strokeStyle = 'rgba(200,170,100,0.45)';
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(this.roadXAt(-0.33, t1), y1);
            ctx.lineTo(this.roadXAt(-0.33, t2), y2);
            ctx.stroke();
            // Right divider
            ctx.beginPath();
            ctx.moveTo(this.roadXAt(0.33, t1), y1);
            ctx.lineTo(this.roadXAt(0.33, t2), y2);
            ctx.stroke();
        }
    }

    drawSideTrees() {
        const sides = [
            { nx: -1.35, baseZ: 0 }, { nx: 1.35, baseZ: 0 },
            { nx: -1.45, baseZ: 200 }, { nx: 1.45, baseZ: 200 },
            { nx: -1.38, baseZ: 450 }, { nx: 1.38, baseZ: 450 },
            { nx: -1.42, baseZ: 680 }, { nx: 1.42, baseZ: 680 },
        ];
        for (const s of sides) {
            const z = (950 - ((s.baseZ + this.frame * this.speed * 0.4) % 950)) + 30;
            const p = this.project(s.nx, z);
            if (p.t > 0.04) this.drawTree(p.x, p.y, p.scale * 0.75, true);
        }
    }

    drawObjects() {
        const sorted = [...this.objects].sort((a, b) => b.z - a.z);
        for (const obj of sorted) {
            if (obj.z <= 0 || obj.collected) continue;
            const p = this.project(obj.nx, obj.z);
            if (p.t < 0.02) continue;
            if (obj.type === 'tree') this.drawTree(p.x, p.y, p.scale, false);
            else if (obj.type === 'rock') this.drawRock(p.x, p.y, p.scale);
            else if (obj.type === 'sushi') this.drawSushi(p.x, p.y, p.scale);
        }
    }

    drawTree(sx, sy, sc, isDecor) {
        const ctx = this.ctx;
        const s = sc * 115;
        const trunkH = s * 0.46;
        const trunkW = s * 0.15;
        const cr = s * 0.40;
        const canopyY = sy - trunkH - cr * 0.55;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, s * 0.28, s * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();

        // Trunk
        ctx.fillStyle = '#7a4e2d';
        ctx.strokeStyle = '#4a2e12';
        ctx.lineWidth = Math.max(1, sc * 2.5);
        ctx.beginPath();
        ctx.roundRect(sx - trunkW / 2, sy - trunkH, trunkW, trunkH, sc * 4);
        ctx.fill(); ctx.stroke();

        // Back canopy shadow
        ctx.fillStyle = '#2a6b2a';
        ctx.beginPath();
        ctx.arc(sx + s * 0.06, canopyY + s * 0.05, cr, 0, Math.PI * 2);
        ctx.fill();

        // Main canopy
        ctx.fillStyle = '#45c245';
        ctx.beginPath();
        ctx.arc(sx, canopyY, cr, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#6ee86e';
        ctx.beginPath();
        ctx.arc(sx - s * 0.1, canopyY - s * 0.08, cr * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#1c5a1c';
        ctx.lineWidth = Math.max(1.5, sc * 3.5);
        ctx.beginPath();
        ctx.arc(sx, canopyY, cr, 0, Math.PI * 2);
        ctx.stroke();

        if (!isDecor && sc > 0.25) {
            // Side bumps
            for (const [ox, oy] of [[-0.68, 0.15], [0.68, 0.12]]) {
                ctx.fillStyle = '#4dcc4d';
                ctx.beginPath();
                ctx.arc(sx + cr * ox, canopyY + cr * oy, cr * 0.38, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#1c5a1c';
                ctx.lineWidth = Math.max(1, sc * 2);
                ctx.stroke();
            }
        }
    }

    drawRock(sx, sy, sc) {
        const ctx = this.ctx;
        const s = sc * 78;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, s * 0.85, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main body
        ctx.fillStyle = '#8c8c8c';
        ctx.strokeStyle = '#505050';
        ctx.lineWidth = Math.max(1.5, sc * 3);
        ctx.beginPath();
        ctx.moveTo(sx - s * 0.62, sy);
        ctx.quadraticCurveTo(sx - s * 0.72, sy - s * 0.52, sx - s * 0.18, sy - s * 0.72);
        ctx.quadraticCurveTo(sx + s * 0.08, sy - s * 0.88, sx + s * 0.52, sy - s * 0.66);
        ctx.quadraticCurveTo(sx + s * 0.78, sy - s * 0.38, sx + s * 0.65, sy);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Light face
        ctx.fillStyle = '#a8a8a8';
        ctx.beginPath();
        ctx.moveTo(sx - s * 0.1, sy);
        ctx.quadraticCurveTo(sx - s * 0.15, sy - s * 0.42, sx + s * 0.25, sy - s * 0.62);
        ctx.quadraticCurveTo(sx + s * 0.55, sy - s * 0.4, sx + s * 0.65, sy);
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(sx - s * 0.18, sy - s * 0.48, s * 0.22, s * 0.13, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Crack
        if (sc > 0.28) {
            ctx.strokeStyle = 'rgba(70,70,70,0.45)';
            ctx.lineWidth = Math.max(1, sc * 1.5);
            ctx.beginPath();
            ctx.moveTo(sx + s * 0.08, sy - s * 0.18);
            ctx.lineTo(sx + s * 0.28, sy - s * 0.52);
            ctx.lineTo(sx + s * 0.15, sy - s * 0.68);
            ctx.stroke();
        }
    }

    drawSushi(sx, sy, sc) {
        const ctx = this.ctx;
        const s = sc * 62;
        const bobY = Math.sin(this.frame * 0.12) * sc * 8;
        sy += bobY;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, s * 0.88, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rice base
        ctx.fillStyle = '#f5f2e0';
        ctx.strokeStyle = '#ccccaa';
        ctx.lineWidth = Math.max(1, sc * 2);
        ctx.beginPath();
        ctx.ellipse(sx, sy - s * 0.32, s * 0.78, s * 0.38, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Nori band
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.roundRect(sx - s * 0.78, sy - s * 0.52, s * 1.56, s * 0.26, sc * 4);
        ctx.fill();

        // Salmon topping
        ctx.fillStyle = '#ffaaaa';
        ctx.strokeStyle = '#ff8888';
        ctx.lineWidth = Math.max(1, sc * 1.5);
        ctx.beginPath();
        ctx.ellipse(sx, sy - s * 0.68, s * 0.62, s * 0.28, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Topping highlight
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.beginPath();
        ctx.ellipse(sx - s * 0.2, sy - s * 0.75, s * 0.22, s * 0.1, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Sparkles
        if (sc > 0.22) {
            const angle = this.frame * 0.09;
            ctx.fillStyle = '#ffe033';
            for (let i = 0; i < 4; i++) {
                const a = angle + (i / 4) * Math.PI * 2;
                const px = sx + Math.cos(a) * s * 1.08;
                const py = sy - s * 0.35 + Math.sin(a) * s * 0.52;
                ctx.beginPath();
                ctx.arc(px, py, Math.max(2, sc * 4), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawPlayer() {
        const ctx = this.ctx;
        const H = this.H;
        const t = 0.9;
        const px = this.roadXAt(this.playerNX, t);
        const bob = Math.sin(this.frame * 0.24) * 5;
        const emoji = this.character === 'cat' ? '🐱' : '🐶';
        const bgColor = this.character === 'cat' ? '#fff0cc' : '#ffe8cc';

        ctx.save();
        ctx.globalAlpha = 1;

        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(px, H - 12, 48, 13, 0, 0, Math.PI * 2);
        ctx.fill();

        // Opaque background circle so emoji has no see-through areas
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = '#cc8833';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, H - 52 + bob, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Character emoji on top of the solid background
        ctx.font = '72px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, px, H - 50 + bob);

        ctx.restore();
    }

    drawHUD() {
        const ctx = this.ctx;
        const W = this.W;

        // Score panel
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.roundRect(W - 120, 6, 114, 32, 6);
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 14px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(Math.floor(this.score), W - 14, 12);

        // Health bar
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        const hbW = this.maxHealth * 30 + 10;
        ctx.roundRect(8, 6, hbW, 32, 6);
        ctx.fill();
        for (let i = 0; i < this.maxHealth; i++) {
            ctx.font = '22px serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.globalAlpha = i < this.health ? 1 : 0.18;
            ctx.fillText('❤️', 12 + i * 30, 10);
        }
        ctx.globalAlpha = 1;

        // Character top-center
        const emoji = this.character === 'cat' ? '🐱' : '🐶';
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(emoji, W / 2, 10);
    }

    drawFloats() {
        const ctx = this.ctx;
        for (const f of this.floats) {
            ctx.globalAlpha = Math.min(1, f.life / 40);
            ctx.fillStyle = f.color;
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.font = 'bold 13px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        document.removeEventListener('keydown', this.keyHandler);
        if (this.canvas) {
            this.canvas.removeEventListener('touchstart', this.touchHandler);
            this.canvas.removeEventListener('touchend', this.touchHandler);
        }
    }
}
