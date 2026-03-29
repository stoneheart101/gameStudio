window.initFlappy = function (dotNetRef) {
    const canvas = document.getElementById('flappyCanvas');
    if (!canvas) return;
    if (window.flappyGame) window.flappyGame.destroy();
    window.flappyGame = new FlappyBird(canvas, dotNetRef);
    window.flappyGame.start();
};

window.restartFlappy = function (dotNetRef) {
    const canvas = document.getElementById('flappyCanvas');
    if (!canvas) return;
    if (window.flappyGame) window.flappyGame.destroy();
    window.flappyGame = new FlappyBird(canvas, dotNetRef);
    window.flappyGame.start();
};

window.destroyFlappy = function () {
    if (window.flappyGame) {
        window.flappyGame.destroy();
        window.flappyGame = null;
    }
};

class FlappyBird {
    constructor(canvas, dotNetRef) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dotNetRef = dotNetRef;
        this.animFrame = null;

        this.W = canvas.width;
        this.H = canvas.height;

        this.PIPE_W = 56;
        this.GAP = 155;
        this.BIRD_R = 18;
        this.PIPE_SPEED = 2.4;
        this.GRAVITY = 0.34;
        this.FLAP = -7.2;
        this.PIPE_INTERVAL = 95;

        this.reset();

        this.keyHandler = (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                this.flap();
            }
        };
        this.clickHandler = () => this.flap();
        this.touchHandler = (e) => { e.preventDefault(); this.flap(); };

        document.addEventListener('keydown', this.keyHandler);
        canvas.addEventListener('click', this.clickHandler);
        canvas.addEventListener('touchstart', this.touchHandler, { passive: false });

        // Stars (fixed positions)
        this.stars = Array.from({ length: 40 }, () => ({
            x: Math.random() * this.W,
            y: Math.random() * (this.H * 0.7),
            r: Math.random() < 0.3 ? 2 : 1
        }));
    }

    reset() {
        this.birdY = this.H / 2;
        this.birdVel = 0;
        this.pipes = [];
        this.score = 0;
        this.gameOver = false;
        this.started = false;
        this.frame = 0;
        this.birdAngle = 0;
        this.flashAlpha = 0;
    }

    start() {
        this.animFrame = requestAnimationFrame(() => this.loop());
    }

    loop() {
        this.update();
        this.draw();
        if (!this.gameOver) {
            this.animFrame = requestAnimationFrame(() => this.loop());
        } else {
            this.flashAlpha = 1;
            this.drawFlash();
            setTimeout(() => {
                if (this.dotNetRef) {
                    this.dotNetRef.invokeMethodAsync('OnGameOver', this.score);
                }
            }, 400);
        }
    }

    flap() {
        if (this.gameOver) return;
        this.started = true;
        this.birdVel = this.FLAP;
    }

    update() {
        if (!this.started) return;
        this.frame++;

        this.birdVel += this.GRAVITY;
        this.birdVel = Math.min(this.birdVel, 10);
        this.birdY += this.birdVel;
        this.birdAngle = Math.max(-0.45, Math.min(Math.PI / 2.2, this.birdVel * 0.09));

        // Spawn pipes
        if (this.frame % this.PIPE_INTERVAL === 0) {
            const minGapY = 80;
            const maxGapY = this.H - 80 - this.GAP - 30; // 30 = ground height
            const gapY = minGapY + Math.random() * (maxGapY - minGapY);
            this.pipes.push({ x: this.W + 10, gapY, scored: false });
        }

        // Move pipes + score
        for (const p of this.pipes) {
            p.x -= this.PIPE_SPEED;
            if (!p.scored && p.x + this.PIPE_W < 80) {
                p.scored = true;
                this.score++;
            }
        }
        this.pipes = this.pipes.filter(p => p.x + this.PIPE_W > 0);

        // Ground/ceiling collision
        if (this.birdY + this.BIRD_R >= this.H - 30 || this.birdY - this.BIRD_R <= 0) {
            this.gameOver = true;
            return;
        }

        // Pipe collision
        const bx = 80;
        for (const p of this.pipes) {
            if (bx + this.BIRD_R - 4 > p.x && bx - this.BIRD_R + 4 < p.x + this.PIPE_W) {
                if (this.birdY - this.BIRD_R + 4 < p.gapY || this.birdY + this.BIRD_R - 4 > p.gapY + this.GAP) {
                    this.gameOver = true;
                    return;
                }
            }
        }
    }

    drawFlash() {
        const ctx = this.ctx;
        ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
        ctx.fillRect(0, 0, this.W, this.H);
    }

    draw() {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;

        // Sky gradient
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#0a0a2e');
        sky.addColorStop(0.7, '#0d1a40');
        sky.addColorStop(1, '#1a0a2e');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.fillStyle = '#ffffff';
        for (const s of this.stars) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.frame * 0.03 + s.x);
            ctx.fillRect(s.x, s.y, s.r, s.r);
        }
        ctx.globalAlpha = 1;

        // Pipes
        for (const p of this.pipes) {
            this.drawPipe(p);
        }

        // Ground
        ctx.fillStyle = '#1a4a1a';
        ctx.fillRect(0, H - 30, W, 30);
        ctx.fillStyle = '#2d6e2d';
        ctx.fillRect(0, H - 30, W, 5);
        // Ground pixel pattern
        ctx.fillStyle = '#3a8a3a';
        for (let x = 0; x < W; x += 16) {
            ctx.fillRect(x, H - 30, 8, 3);
        }

        // Bird
        this.drawBird();

        // Score
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor = '#ff8800';
        ctx.shadowBlur = 8;
        ctx.fillText(String(this.score), W / 2, 16);
        ctx.shadowBlur = 0;

        // Start prompt
        if (!this.started) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, H / 2 - 45, W, 90);
            ctx.fillStyle = '#00ff41';
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 12;
            ctx.fillText('PRESS SPACE OR CLICK', W / 2, H / 2 - 12);
            ctx.fillText('TO START', W / 2, H / 2 + 12);
            ctx.shadowBlur = 0;
        }
    }

    drawPipe(p) {
        const ctx = this.ctx;
        const H = this.H;
        const PW = this.PIPE_W;
        const CAP_H = 18;
        const CAP_EXTRA = 6;

        // Top pipe body
        const topGrad = ctx.createLinearGradient(p.x, 0, p.x + PW, 0);
        topGrad.addColorStop(0, '#1a7a1a');
        topGrad.addColorStop(0.3, '#2aaa2a');
        topGrad.addColorStop(1, '#155515');
        ctx.fillStyle = topGrad;
        ctx.fillRect(p.x, 0, PW, p.gapY - CAP_H);

        // Top pipe cap
        ctx.fillStyle = '#2aaa2a';
        ctx.fillRect(p.x - CAP_EXTRA, p.gapY - CAP_H, PW + CAP_EXTRA * 2, CAP_H);
        ctx.fillStyle = '#3acc3a';
        ctx.fillRect(p.x - CAP_EXTRA, p.gapY - CAP_H, PW + CAP_EXTRA * 2, 4);

        // Bottom pipe body
        const bottomY = p.gapY + this.GAP;
        ctx.fillStyle = topGrad;
        ctx.fillRect(p.x, bottomY + CAP_H, PW, H - bottomY - CAP_H - 30);

        // Bottom pipe cap
        ctx.fillStyle = '#2aaa2a';
        ctx.fillRect(p.x - CAP_EXTRA, bottomY, PW + CAP_EXTRA * 2, CAP_H);
        ctx.fillStyle = '#3acc3a';
        ctx.fillRect(p.x - CAP_EXTRA, bottomY, PW + CAP_EXTRA * 2, 4);

        // Shine on pipe body
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(p.x + 4, 0, 8, p.gapY - CAP_H);
        ctx.fillRect(p.x + 4, bottomY + CAP_H, 8, H - bottomY - CAP_H - 30);
    }

    drawBird() {
        const ctx = this.ctx;
        const bx = 80;
        const by = this.birdY;
        const R = this.BIRD_R;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(this.birdAngle);

        // Body
        const bodyGrad = ctx.createRadialGradient(-2, -3, 2, 0, 0, R);
        bodyGrad.addColorStop(0, '#ffe566');
        bodyGrad.addColorStop(0.6, '#ffcc00');
        bodyGrad.addColorStop(1, '#cc8800');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();

        // Wing (flap animation)
        const wingY = this.started ? Math.sin(this.frame * 0.4) * 4 : 0;
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.ellipse(-4, 4 + wingY, 10, 6, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(7, -4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(9, -4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(10, -5, 1, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.moveTo(14, -2);
        ctx.lineTo(22, 1);
        ctx.lineTo(14, 4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    destroy() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        document.removeEventListener('keydown', this.keyHandler);
        if (this.canvas) {
            this.canvas.removeEventListener('click', this.clickHandler);
            this.canvas.removeEventListener('touchstart', this.touchHandler);
        }
    }
}
