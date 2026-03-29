// UMM FOOD - Underwater top-down game
'use strict';

(function () {
    let canvas, ctx, animId, dotNetRef;
    let keys = {};
    let mouseX = 340, mouseY = 260;
    let mouseDown = false;
    let shootFrame = -99;
    let state;

    const W = 680;       // game world width
    const CW = 840;      // total canvas width (W + mastermind panel)
    const H = 520;
    const PANEL_X = W;   // mastermind panel starts here

    const PLAYER_SPEED = 3.5;
    const PLAYER_RADIUS = 18;
    const WHALE_BASE_SPEED = [1.9, 1.75, 1.85, 1.7];
    const WHALE_RADIUS = 34;
    const WHALE_TURN_RATE = 0.09;  // radians per frame (was instant snap)
    const WHALE_MAX_HEARTS = 5;
    const WHALE_SPEED_MULT = [0, 0.28, 0.44, 0.58, 0.76, 1.0];
    const BOAT_BASE_SPEED = 2.8;
    const FISH_RADIUS = 12;
    const CORAL_RADIUS = 28;
    const NUM_CORAL = 9;
    const MAX_FISH = 5;
    const BOAT_INTERVAL = 600;
    const BOAT_INDICATOR_FRAMES = 70;
    const MASTERMIND_INTERVAL = 1500;
    const MASTERMIND_BOOST_DURATION = 180;
    const LASER_SPEED = 13;
    const LASER_MAX_DIST = 420;
    const LASER_COOLDOWN = 60; // 1 shot per second at 60fps
    const PLAYER_SLOW_DURATION = 150;
    const PLAYER_SLOW_MULT = 0.42;
    const DISCO_DURATION = 300;

    // ── STATE ──────────────────────────────────────────────────────────────────

    function initState() {
        const coralPositions = [
            { x: 120, y: 90 }, { x: 560, y: 110 }, { x: 85, y: 310 },
            { x: 600, y: 300 }, { x: 240, y: 160 }, { x: 450, y: 380 },
            { x: 320, y: 80 }, { x: 140, y: 420 }, { x: 540, y: 440 },
        ];
        const corals = coralPositions.map(pos => ({
            x: pos.x, y: pos.y,
            r: CORAL_RADIUS + Math.random() * 12,
            variant: Math.floor(Math.random() * 3),
            hue: 340 + Math.floor(Math.random() * 40),
        }));

        const whaleStarts = [
            { x: 60, y: 60 }, { x: W - 60, y: 60 },
            { x: 60, y: H - 60 }, { x: W - 60, y: H - 60 },
        ];
        const whales = whaleStarts.map((pos, i) => ({
            x: pos.x, y: pos.y,
            hearts: WHALE_MAX_HEARTS,
            speed: WHALE_BASE_SPEED[i],
            radius: WHALE_RADIUS,
            angle: Math.atan2(H / 2 - pos.y, W / 2 - pos.x) - Math.PI / 2,
            blinkTimer: 0,
            stunTimer: 0,
            boosted: false,
            discoPhase: Math.random() * Math.PI * 2,
        }));

        return {
            player: { x: W / 2, y: H / 2, angle: 0 },
            playerHearts: 3,
            playerIframe: 0,
            playerSlowTimer: 0,
            whales,
            corals,
            boats: [],
            pendingBoats: [],
            fish: [],
            lasers: [],
            bubbles: [],
            particles: [],
            caustics: generateCaustics(),
            lightRays: generateLightRays(),
            score: 0,
            frame: 0,
            boatTimer: BOAT_INTERVAL / 2,
            masterBoostTimer: 0,
            masterBoostActive: false,
            masterAnger: 0,
            gameOver: false,
            wave: 1,
            waveRespawnTimer: 0,
            waveNoticeTimer: 0,
            discoActive: false,
            discoTimer: 0,
            discoScheduledFrame: Math.floor(400 + Math.random() * 1200),
            waveDiscoDone: false,
            whaleMults: Array.from({ length: 4 }, () => ({ speed: 1, size: 1 })),
            discoLights: [],
        };
    }

    function generateCaustics() {
        const c = [];
        for (let i = 0; i < 18; i++) {
            c.push({
                x: Math.random() * W, y: Math.random() * H,
                r: 20 + Math.random() * 40,
                alpha: 0.03 + Math.random() * 0.04,
                speed: 0.003 + Math.random() * 0.004,
                phase: Math.random() * Math.PI * 2,
            });
        }
        return c;
    }

    function generateLightRays() {
        const rays = [];
        for (let i = 0; i < 5; i++) {
            rays.push({
                x: 80 + i * 120,
                width: 30 + Math.random() * 50,
                alpha: 0.04 + Math.random() * 0.04,
                speed: 0.0008 + Math.random() * 0.001,
                phase: Math.random() * Math.PI * 2,
            });
        }
        return rays;
    }

    // ── DRAWING ────────────────────────────────────────────────────────────────

    function drawBackground(s) {
        // Game area
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#001830');
        grad.addColorStop(0.5, '#002845');
        grad.addColorStop(1, '#001020');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Mastermind panel
        const pg = ctx.createLinearGradient(PANEL_X, 0, CW, H);
        pg.addColorStop(0, '#080818');
        pg.addColorStop(1, '#04040e');
        ctx.fillStyle = pg;
        ctx.fillRect(PANEL_X, 0, CW - PANEL_X, H);

        // Panel divider
        ctx.strokeStyle = '#1a2a4a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PANEL_X, 0);
        ctx.lineTo(PANEL_X, H);
        ctx.stroke();

        // Caustics (game area only)
        s.caustics.forEach(c => {
            if (c.x > W + 20) return;
            const alpha = c.alpha * (0.7 + 0.3 * Math.sin(s.frame * c.speed + c.phase));
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#4af';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r * (0.8 + 0.2 * Math.sin(s.frame * c.speed * 1.3 + c.phase)), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });

        // Light rays
        s.lightRays.forEach(ray => {
            if (ray.x > W) return;
            const alpha = ray.alpha * (0.6 + 0.4 * Math.sin(s.frame * ray.speed + ray.phase));
            ctx.save();
            ctx.globalAlpha = alpha;
            const rg = ctx.createLinearGradient(ray.x, 0, ray.x, H);
            rg.addColorStop(0, 'rgba(100,200,255,0.8)');
            rg.addColorStop(1, 'rgba(0,80,160,0)');
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.moveTo(ray.x - ray.width / 2, 0);
            ctx.lineTo(ray.x + ray.width / 2, 0);
            ctx.lineTo(ray.x + ray.width * 0.7, H);
            ctx.lineTo(ray.x - ray.width * 0.7, H);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // Sandy patches
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#c8a870';
        [[100, 480, 80, 25], [300, 510, 120, 20], [560, 495, 90, 22]].forEach(([x, y, w, h]) => {
            ctx.beginPath();
            ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    function drawCoral(coral) {
        // Visible hitbox ring
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#ff6688';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(coral.x, coral.y, coral.r * 0.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        ctx.translate(coral.x, coral.y);
        const hue = coral.hue;

        if (coral.variant === 0) {
            function branch(len, angle, depth) {
                if (depth === 0 || len < 4) return;
                ctx.save();
                ctx.rotate(angle);
                ctx.strokeStyle = `hsl(${hue}, 80%, ${25 + depth * 10}%)`;
                ctx.lineWidth = depth + 1;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -len);
                ctx.stroke();
                ctx.translate(0, -len);
                branch(len * 0.65, 0.45, depth - 1);
                branch(len * 0.65, -0.45, depth - 1);
                if (depth > 2) branch(len * 0.5, 0, depth - 2);
                ctx.restore();
            }
            branch(coral.r * 0.9, 0, 4);
        } else if (coral.variant === 1) {
            ctx.fillStyle = `hsl(${hue}, 60%, 25%)`;
            ctx.beginPath();
            ctx.arc(0, 0, coral.r * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `hsl(${hue}, 70%, 35%)`;
            ctx.lineWidth = 2;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.ellipse(0, 0, coral.r * 0.3 + i * 5, coral.r * 0.5 + i * 4, i * 0.3, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else {
            ctx.strokeStyle = `hsl(${hue}, 75%, 30%)`;
            ctx.lineWidth = 2;
            for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.2) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                const r = coral.r * (0.6 + 0.4 * Math.abs(Math.cos(a * 3)));
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                ctx.stroke();
            }
            for (let d = 8; d <= coral.r * 0.9; d += 8) {
                ctx.beginPath();
                ctx.arc(0, 0, d, -Math.PI / 2, Math.PI / 2);
                ctx.globalAlpha = 0.4;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
        ctx.restore();
    }

    function drawFish(fish, frame) {
        ctx.save();
        ctx.translate(fish.x, fish.y);
        const wag = Math.sin(frame * 0.15 + fish.phase) * 0.3;
        ctx.rotate(fish.angle + wag * 0.1);

        ctx.fillStyle = fish.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, FISH_RADIUS, FISH_RADIUS * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = fish.stripeColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        [-3, 3].forEach(ox => {
            ctx.beginPath();
            ctx.moveTo(ox, -FISH_RADIUS * 0.5);
            ctx.lineTo(ox, FISH_RADIUS * 0.5);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;

        ctx.fillStyle = fish.color;
        ctx.beginPath();
        ctx.moveTo(-FISH_RADIUS * 0.8, 0);
        ctx.lineTo(-FISH_RADIUS * 1.4, -FISH_RADIUS * 0.45 - wag * FISH_RADIUS * 0.4);
        ctx.lineTo(-FISH_RADIUS * 1.4, FISH_RADIUS * 0.45 + wag * FISH_RADIUS * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(FISH_RADIUS * 0.45, -FISH_RADIUS * 0.1, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(FISH_RADIUS * 0.47, -FISH_RADIUS * 0.12, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawWhale(whale, s) {
        const frame = s.frame;
        const R = whale.radius;
        const blink = whale.blinkTimer > 0;
        const stun = whale.stunTimer > 0;

        // Dance offset during disco
        const discoOffset = s.discoActive
            ? Math.sin(frame * 0.18 + whale.discoPhase) * 12
            : 0;

        ctx.save();
        ctx.translate(whale.x + discoOffset, whale.y);
        ctx.rotate(whale.angle + Math.PI);

        if (stun && Math.floor(frame / 6) % 2 === 0) ctx.globalAlpha = 0.5;

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.55, R, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath();
        ctx.ellipse(0, R * 0.1, R * 0.28, R * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath();
        ctx.ellipse(-R * 0.35, -R * 0.35, R * 0.18, R * 0.12, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(R * 0.35, -R * 0.35, R * 0.18, R * 0.12, 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = blink ? '#1a1a1a' : '#000';
        ctx.beginPath();
        ctx.arc(-R * 0.35, -R * 0.38, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(R * 0.35, -R * 0.38, 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (!blink) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(-R * 0.33, -R * 0.4, 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(R * 0.37, -R * 0.4, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.ellipse(0, -R * 0.15, R * 0.3, R * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(-R * 0.08, -R * 0.2);
        ctx.lineTo(0, -R * 0.72);
        ctx.lineTo(R * 0.08, -R * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(-R * 0.22, R * 0.82);
        ctx.quadraticCurveTo(-R * 0.6, R * 1.1, -R * 0.55, R * 0.95);
        ctx.lineTo(0, R * 0.78);
        ctx.lineTo(R * 0.55, R * 0.95);
        ctx.quadraticCurveTo(R * 0.6, R * 1.1, R * 0.22, R * 0.82);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        [-1, 1].forEach(side => {
            ctx.beginPath();
            ctx.moveTo(side * R * 0.42, R * 0.05);
            ctx.quadraticCurveTo(side * R * 0.85, R * 0.25, side * R * 0.7, R * 0.5);
            ctx.quadraticCurveTo(side * R * 0.5, R * 0.55, side * R * 0.42, R * 0.4);
            ctx.closePath();
            ctx.fill();
        });

        if (whale.boosted) {
            ctx.globalAlpha = 0.35 + 0.2 * Math.sin(frame * 0.2);
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(0, 0, R * 0.6 + 4, R + 6, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }


        // Dance music notes
        if (s.discoActive) {
            ctx.globalAlpha = 0.8;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffee00';
            const nt = Math.floor(frame / 15) % 2 === 0 ? '♪' : '♩';
            ctx.fillText(nt, 0, -R - 8);
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Hearts above whale
        ctx.save();
        ctx.translate(whale.x + discoOffset, whale.y);
        for (let h = 0; h < WHALE_MAX_HEARTS; h++) {
            const hx = (h - (WHALE_MAX_HEARTS - 1) / 2) * 12;
            const hy = -whale.radius - 16;
            ctx.fillStyle = h < whale.hearts ? '#e44' : '#333';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('♥', hx, hy);
        }
        ctx.restore();
    }

    function drawPlayer(s) {
        const p = s.player;
        const slow = s.playerSlowTimer > 0;

        ctx.save();
        ctx.translate(p.x, p.y);

        if (s.playerIframe > 0 && Math.floor(s.frame / 5) % 2 === 0) ctx.globalAlpha = 0.3;

        // Slow aura
        if (slow) {
            ctx.globalAlpha *= 0.5 + 0.3 * Math.sin(s.frame * 0.12);
            ctx.fillStyle = '#88ccff';
            ctx.beginPath();
            ctx.arc(0, 0, PLAYER_RADIUS + 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = s.playerIframe > 0 && Math.floor(s.frame / 5) % 2 === 0 ? 0.3 : 1;
        }

        ctx.rotate(p.angle);

        const flipper = Math.sin(s.frame * 0.18) * 0.25;
        ctx.fillStyle = '#2a3d2a';
        [-1, 1].forEach(side => {
            ctx.save();
            ctx.rotate(side * (0.35 + flipper * side));
            ctx.beginPath();
            ctx.ellipse(side * PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.5, 7, 16, side * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        ctx.fillStyle = '#1a2e4a';
        ctx.beginPath();
        ctx.ellipse(0, 0, PLAYER_RADIUS * 0.6, PLAYER_RADIUS, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = slow ? '#88ccff' : '#4af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, PLAYER_RADIUS * 0.6, PLAYER_RADIUS, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.roundRect(PLAYER_RADIUS * 0.25, -PLAYER_RADIUS * 0.3, 8, 20, 3);
        ctx.fill();

        ctx.fillStyle = '#f5deb3';
        ctx.beginPath();
        ctx.arc(0, -PLAYER_RADIUS * 0.65, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(100,200,255,0.5)';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-7, -PLAYER_RADIUS * 0.75, 14, 10, 2);
        ctx.fill();
        ctx.stroke();

        // Laser gun barrel (points forward / up in local space)
        ctx.fillStyle = '#888';
        ctx.strokeStyle = '#00ffaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-3, -PLAYER_RADIUS - 10, 6, 12, 2);
        ctx.fill();
        ctx.stroke();
        // Muzzle glow
        ctx.globalAlpha = 0.6 + 0.4 * (1 - Math.min(1, (s.frame - shootFrame) / LASER_COOLDOWN));
        ctx.fillStyle = '#00ffaa';
        ctx.beginPath();
        ctx.arc(0, -PLAYER_RADIUS - 10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Dance during disco
        if (s.discoActive) {
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffee00';
            ctx.fillText('♪', 0, -PLAYER_RADIUS - 22);
        }

        if (s.frame % 20 === 0) {
            s.bubbles.push({
                x: p.x + Math.cos(p.angle + Math.PI / 2) * 12,
                y: p.y + Math.sin(p.angle + Math.PI / 2) * 12,
                r: 2 + Math.random() * 3,
                life: 80 + Math.random() * 40,
                vx: (Math.random() - 0.5) * 0.5,
                vy: -0.7 - Math.random() * 0.4,
            });
        }

        ctx.restore();

        // HUD
        ctx.save();
        for (let h = 0; h < 3; h++) {
            ctx.fillStyle = h < s.playerHearts ? '#e44' : '#333';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('♥', 10 + h * 22, 26);
        }
        if (slow) {
            ctx.fillStyle = '#88ccff';
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('SLOW', 12, 40);
        }
        ctx.fillStyle = '#4af';
        ctx.font = '11px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('SCORE: ' + s.score, W - 10, 26);
        ctx.restore();
    }

    function drawLasers(s) {
        s.lasers.forEach(l => {
            // Trail behind current position
            const trailLen = Math.min(80, l.dist);
            const tx = l.x - (l.vx / LASER_SPEED) * trailLen;
            const ty = l.y - (l.vy / LASER_SPEED) * trailLen;

            ctx.save();
            ctx.shadowColor = '#00ffaa';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = 'rgba(0,255,170,0.5)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(l.x, l.y);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(l.x, l.y);
            ctx.stroke();

            // Bright tip
            ctx.fillStyle = '#aaffee';
            ctx.beginPath();
            ctx.arc(l.x, l.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        });
    }

    function drawBubbles(s) {
        s.bubbles.forEach(b => {
            ctx.save();
            ctx.globalAlpha = (b.life / 120) * 0.6;
            ctx.strokeStyle = 'rgba(150,220,255,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });
    }

    function drawBoatIndicators(s) {
        s.pendingBoats.forEach(pb => {
            const alpha = 0.5 + 0.4 * Math.sin(pb.countdown * 0.25);
            ctx.save();
            ctx.globalAlpha = alpha;

            const ex = pb.fromLeft ? 2 : W - 2;
            const ey = pb.y;
            const dir = pb.fromLeft ? 1 : -1;
            const sz = pb.size;

            // Flashing arrow
            const col = sz > 1.0 ? '#ff6600' : '#ffee00';
            ctx.fillStyle = col;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ex, ey - 14 * sz);
            ctx.lineTo(ex + dir * 24 * sz, ey);
            ctx.lineTo(ex, ey + 14 * sz);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Label
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(7 * sz)}px sans-serif`;
            ctx.textAlign = pb.fromLeft ? 'left' : 'right';
            ctx.fillText(sz > 1.0 ? '⚠BIG' : '⚡FAST', ex + dir * 28 * sz, ey + 4);
            ctx.restore();
        });
    }

    function drawBoat(boat) {
        const sz = boat.size;
        ctx.save();
        ctx.translate(boat.x, boat.y);
        if (boat.dir < 0) ctx.scale(-1, 1);
        ctx.scale(sz, sz);

        ctx.fillStyle = sz > 1.0 ? '#8b2a12' : '#c8522a';
        ctx.beginPath();
        ctx.moveTo(-36, -10);
        ctx.lineTo(40, -10);
        ctx.lineTo(46, 0);
        ctx.lineTo(40, 10);
        ctx.lineTo(-36, 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = sz > 1.0 ? '#d4a050' : '#e8c87a';
        ctx.fillRect(-28, -8, 60, 16);

        ctx.fillStyle = 'rgba(180,220,255,0.6)';
        ctx.fillRect(-10, -8, 18, 8);

        // Big boat gets a cabin
        if (sz > 1.0) {
            ctx.fillStyle = '#a06030';
            ctx.fillRect(-20, -16, 22, 8);
            ctx.fillStyle = 'rgba(180,220,255,0.5)';
            ctx.fillRect(-18, -15, 8, 6);
        }

        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-36, 0);
        ctx.lineTo(-66, -8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-36, 0);
        ctx.lineTo(-66, 8);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawMastermind(s) {
        const px = PANEL_X + (CW - PANEL_X) / 2;
        const py = H / 2;
        const r = 68;
        const anger = s.masterAnger;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#0a1520';
        ctx.fillRect(px - r, py - r, r * 2, r * 2);

        const rLight = Math.floor(80 + anger * 120);
        ctx.fillStyle = `rgb(${rLight},10,10)`;
        ctx.globalAlpha = 0.25 + anger * 0.2;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Mind-blink: psychic brain waves during boost command
        if (s.masterBoostActive) {
            const prog = s.masterBoostTimer / MASTERMIND_BOOST_DURATION;
            const pulse = Math.sin(s.frame * 0.35) * 0.5 + 0.5;
            ctx.save();
            for (let ring = 1; ring <= 4; ring++) {
                ctx.globalAlpha = (0.55 - ring * 0.1) * pulse * prog;
                ctx.strokeStyle = ring % 2 === 0 ? '#dd44ff' : '#ff88ff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(px, py - 12, 18 + ring * 12, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 0.7 * pulse * prog;
            ctx.strokeStyle = '#ff44ff';
            ctx.lineWidth = 1.5;
            for (let b = 0; b < 5; b++) {
                const ba = (b / 5) * Math.PI * 2 + s.frame * 0.07;
                const mid = 30 + 10 * pulse;
                ctx.beginPath();
                ctx.moveTo(px + Math.cos(ba) * 20, (py - 12) + Math.sin(ba) * 20);
                ctx.lineTo(px + Math.cos(ba + 0.25) * mid, (py - 12) + Math.sin(ba + 0.25) * mid);
                ctx.lineTo(px + Math.cos(ba) * 44, (py - 12) + Math.sin(ba) * 44);
                ctx.stroke();
            }
            ctx.globalAlpha = 0.3 * pulse * prog;
            ctx.fillStyle = '#cc44ff';
            ctx.beginPath();
            ctx.arc(px, py - 12, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.fillStyle = `hsl(${anger * 20}, 30%, 12%)`;
        ctx.beginPath();
        ctx.ellipse(px, py + 20, 22, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e1200';
        ctx.beginPath();
        ctx.arc(px, py - 12, 18, 0, Math.PI * 2);
        ctx.fill();

        const eyeGlow = s.masterBoostActive
            ? 0.9 + 0.1 * Math.sin(s.frame * 0.4)
            : 0.7 + 0.3 * Math.sin(s.frame * 0.05);
        ctx.fillStyle = `rgba(255,${Math.floor(20 + anger * 80)},0,${eyeGlow})`;
        ctx.beginPath();
        ctx.ellipse(px - 7, py - 14, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px + 7, py - 14, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#2a1800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 12, py - 5);
        ctx.quadraticCurveTo(px - 8, py - 10, px, py - 6);
        ctx.quadraticCurveTo(px + 8, py - 10, px + 12, py - 5);
        ctx.stroke();

        ctx.fillStyle = `hsl(${anger * 20}, 60%, 15%)`;
        ctx.beginPath();
        ctx.moveTo(px - 22, py);
        ctx.lineTo(px - 28, py + 10);
        ctx.lineTo(px, py + 5);
        ctx.lineTo(px + 28, py + 10);
        ctx.lineTo(px + 22, py);
        ctx.closePath();
        ctx.fill();

        if (s.masterBoostActive) {
            const prog = s.masterBoostTimer / MASTERMIND_BOOST_DURATION;
            ctx.strokeStyle = `rgba(255,50,50,${prog * 0.8})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(px, py, r - 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(255,50,50,${prog * 0.5})`;
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('ATTACK!', px, py + 45);
        }

        ctx.restore();

        // Porthole rim
        ctx.strokeStyle = '#4a3a2a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#6a5a4a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, r - 4, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.fillStyle = '#6a5a4a';
            ctx.beginPath();
            ctx.arc(px + Math.cos(a) * (r + 2), py + Math.sin(a) * (r + 2), 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(200,100,50,0.7)';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MASTERMIND', px, py + r + 14);

        // Anger meter below porthole
        const meterW = r * 1.6;
        const meterX = px - meterW / 2;
        const meterY = py + r + 22;
        ctx.fillStyle = '#1a0a0a';
        ctx.fillRect(meterX, meterY, meterW, 8);
        ctx.fillStyle = `hsl(${(1 - anger) * 60}, 90%, 50%)`;
        ctx.fillRect(meterX, meterY, meterW * anger, 8);
        ctx.strokeStyle = '#4a3a2a';
        ctx.lineWidth = 1;
        ctx.strokeRect(meterX, meterY, meterW, 8);
        ctx.fillStyle = '#aaa';
        ctx.font = '5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RAGE', px, meterY + 16);
    }

    function drawDisco(s) {
        if (!s.discoActive) return;
        const prog = s.discoTimer / DISCO_DURATION;

        // Colored sweeping lights
        s.discoLights.forEach(dl => {
            ctx.save();
            ctx.globalAlpha = dl.alpha * prog;
            const rg = ctx.createRadialGradient(dl.x, dl.y, 0, dl.x, dl.y, dl.r);
            rg.addColorStop(0, dl.color);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(dl.x, dl.y, dl.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Disco ball drop-in
        const dropY = 38 + (1 - Math.min(1, (DISCO_DURATION - s.discoTimer) / 30)) * (-60);
        const bx = W / 2, by = dropY, br = 22;

        // String
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx, by - br);
        ctx.stroke();

        // Ball
        ctx.save();
        const sg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 2, bx, by, br);
        sg.addColorStop(0, '#ffffff');
        sg.addColorStop(0.4, '#aaaaaa');
        sg.addColorStop(1, '#222222');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();

        // Colored facets
        const facetColors = ['#ff0044', '#ff8800', '#ffee00', '#00ff88', '#00aaff', '#aa00ff'];
        for (let fi = 0; fi < 18; fi++) {
            const fa = (fi / 18) * Math.PI * 2 + s.frame * 0.06;
            const fr = br * 0.72;
            const fx = bx + Math.cos(fa) * fr * 0.55;
            const fy = by + Math.sin(fa) * fr * 0.45;
            ctx.fillStyle = facetColors[fi % facetColors.length];
            ctx.globalAlpha = 0.75;
            ctx.fillRect(fx - 3, fy - 3, 6, 6);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Banner
        ctx.save();
        ctx.globalAlpha = Math.min(1, prog * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(W / 2 - 115, H / 2 - 32, 230, 54);
        ctx.fillStyle = '#ffee00';
        ctx.font = '15px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DISCO TIME!', W / 2, H / 2 - 8);
        ctx.fillStyle = '#ff88ff';
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillText('EVERYONE DANCE!', W / 2, H / 2 + 14);
        ctx.restore();
    }

    function drawParticles(s) {
        s.particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    function drawWaveNotice(s) {
        if (s.waveNoticeTimer <= 0) return;
        const alpha = Math.min(1, s.waveNoticeTimer / 30) * Math.min(1, (s.waveNoticeTimer - 10) / 20);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W / 2 - 130, H / 2 - 38, 260, 64);
        ctx.fillStyle = '#ff4444';
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillText('WAVE ' + s.wave, W / 2, H / 2 - 8);
        ctx.fillStyle = '#ff8888';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText('BIGGER & STRONGER!', W / 2, H / 2 + 16);
        ctx.restore();
    }

    function render(s) {
        ctx.clearRect(0, 0, CW, H);
        drawBackground(s);
        drawParticles(s);
        s.corals.forEach(drawCoral);
        drawBubbles(s);
        s.fish.forEach(f => drawFish(f, s.frame));
        drawBoatIndicators(s);
        s.boats.forEach(drawBoat);
        s.whales.forEach(w => drawWhale(w, s));
        drawLasers(s);
        drawPlayer(s);
        drawDisco(s);
        drawMastermind(s);
        drawWaveNotice(s);
    }

    // ── LOGIC ──────────────────────────────────────────────────────────────────

    function getDifficulty(frame) {
        return 1 + Math.min(frame / 8100, 2.0);
    }

    function spawnWave(s) {
        // Each wave: pick one random whale slot and permanently upgrade it
        const pick = Math.floor(Math.random() * 4);
        s.whaleMults[pick].speed *= 1.07;
        s.whaleMults[pick].size  *= 1.15;

        const whaleStarts = [
            { x: 60, y: 60 }, { x: W - 60, y: 60 },
            { x: 60, y: H - 60 }, { x: W - 60, y: H - 60 },
        ];
        s.whales = whaleStarts.map((pos, i) => ({
            x: pos.x, y: pos.y,
            hearts: WHALE_MAX_HEARTS,
            speed: WHALE_BASE_SPEED[i] * s.whaleMults[i].speed,
            radius: Math.round(WHALE_RADIUS * s.whaleMults[i].size),
            angle: Math.atan2(H / 2 - pos.y, W / 2 - pos.x) - Math.PI / 2,
            blinkTimer: 0,
            stunTimer: 0,
            boosted: false,
            discoPhase: Math.random() * Math.PI * 2,
        }));

        // Reset player to center
        s.player.x = W / 2;
        s.player.y = H / 2;
        s.waveNoticeTimer = 180;
        // Schedule new disco for this wave
        s.discoScheduledFrame = s.frame + Math.floor(400 + Math.random() * 1200);
        s.waveDiscoDone = false;
    }

    function spawnFish(s) {
        const colors = ['#ff6040', '#ff9020', '#40aaff', '#60cc80', '#ffcc40'];
        const stripes = ['#cc3020', '#cc6010', '#2080cc', '#408860', '#ccaa20'];
        const ci = Math.floor(Math.random() * colors.length);
        let x, y;
        do {
            x = 40 + Math.random() * (W - 80);
            y = 40 + Math.random() * (H - 80);
        } while (distSq(x, y, W / 2, H / 2) < 80 * 80);
        s.fish.push({
            x, y,
            angle: Math.random() * Math.PI * 2,
            color: colors[ci],
            stripeColor: stripes[ci],
            phase: Math.random() * Math.PI * 2,
            bobTimer: Math.random() * 200,
        });
    }

    function spawnParticles(s, x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2.5;
            s.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: 3 + Math.random() * 4,
                color,
                life: 30 + Math.random() * 20,
                maxLife: 50,
            });
        }
    }

    function distSq(ax, ay, bx, by) { return (ax - bx) ** 2 + (ay - by) ** 2; }
    function circlesOverlap(ax, ay, ar, bx, by, br) { return distSq(ax, ay, bx, by) < (ar + br) ** 2; }

    function updatePassive(s) {
        s.bubbles.forEach(b => { b.x += b.vx; b.y += b.vy; b.life--; });
        s.bubbles = s.bubbles.filter(b => b.life > 0);
        s.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life--; });
        s.particles = s.particles.filter(p => p.life > 0);
        s.caustics.forEach(c => {
            c.x += Math.sin(s.frame * c.speed + c.phase) * 0.3;
            c.y += Math.cos(s.frame * c.speed * 0.7 + c.phase) * 0.2;
            if (c.x < -50) c.x = W + 50;
            if (c.x > W + 50) c.x = -50;
        });
    }

    function update(s) {
        if (s.gameOver) return;

        s.frame++;
        s.score = Math.floor(s.frame / 30);

        if (s.waveNoticeTimer > 0) s.waveNoticeTimer--;

        // Wave respawn pause
        if (s.waveRespawnTimer > 0) {
            s.waveRespawnTimer--;
            if (s.waveRespawnTimer === 0) {
                s.wave++;
                spawnWave(s);
            }
            updatePassive(s);
            return;
        }

        // All whales dead?
        const allDead = s.whales.length > 0 && s.whales.every(w => w.hearts <= 0);
        if (allDead && s.waveRespawnTimer === 0) {
            s.waveRespawnTimer = 180;
        }

        // Disco trigger
        if (!s.waveDiscoDone && !s.discoActive && s.frame >= s.discoScheduledFrame) {
            s.discoActive = true;
            s.discoTimer = DISCO_DURATION;
            s.waveDiscoDone = true;
            s.discoLights = Array.from({ length: 12 }, () => ({
                x: Math.random() * W, y: Math.random() * H,
                r: 60 + Math.random() * 90,
                alpha: 0.14 + Math.random() * 0.2,
                color: ['#ff0044','#ff8800','#00ff88','#00aaff','#aa00ff','#ffee00'][Math.floor(Math.random() * 6)],
                vx: (Math.random() - 0.5) * 2.2, vy: (Math.random() - 0.5) * 1.4,
            }));
        }

        if (s.discoActive) {
            s.discoTimer--;
            s.discoLights.forEach(dl => {
                dl.x += dl.vx; dl.y += dl.vy;
                if (dl.x < 0 || dl.x > W) dl.vx *= -1;
                if (dl.y < 0 || dl.y > H) dl.vy *= -1;
            });
            if (s.discoTimer <= 0) s.discoActive = false;
            updatePassive(s);
            return; // everyone freezes during disco
        }

        const difficulty = getDifficulty(s.frame);

        // Player movement
        let dx = 0, dy = 0;
        if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
        if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
        if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
        if (keys['ArrowDown'] || keys['KeyS']) dy += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
            // Immediately face direction of travel
            s.player.angle = Math.atan2(dy, dx) - Math.PI / 2;
        }

        // Shoot direction tracks mouse regardless of facing
        const aimDx = mouseX - s.player.x;
        const aimDy = mouseY - s.player.y;

        if (s.playerSlowTimer > 0) s.playerSlowTimer--;
        const pSpeed = s.playerSlowTimer > 0 ? PLAYER_SPEED * PLAYER_SLOW_MULT : PLAYER_SPEED;

        let nx = s.player.x + dx * pSpeed;
        let ny = s.player.y + dy * pSpeed;
        nx = Math.max(PLAYER_RADIUS, Math.min(W - PLAYER_RADIUS, nx));
        ny = Math.max(PLAYER_RADIUS, Math.min(H - PLAYER_RADIUS, ny));

        let coralBlock = false;
        s.corals.forEach(c => {
            if (circlesOverlap(nx, ny, PLAYER_RADIUS * 0.7, c.x, c.y, c.r * 0.65)) coralBlock = true;
        });
        if (!coralBlock) { s.player.x = nx; s.player.y = ny; }

        if (s.playerIframe > 0) s.playerIframe--;

        // Shooting
        if (mouseDown && s.frame - shootFrame >= LASER_COOLDOWN) {
            shootFrame = s.frame;
            const dist = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
            const spawnX = s.player.x + (aimDx / dist) * (PLAYER_RADIUS + 2);
            const spawnY = s.player.y + (aimDy / dist) * (PLAYER_RADIUS + 2);
            s.lasers.push({
                x: spawnX, y: spawnY,
                ox: spawnX, oy: spawnY,
                vx: (aimDx / dist) * LASER_SPEED,
                vy: (aimDy / dist) * LASER_SPEED,
                dist: 0, hit: false,
            });
        }

        // Mastermind boost
        s.masterBoostActive = s.masterBoostTimer > 0;
        if (s.masterBoostTimer > 0) s.masterBoostTimer--;

        const boostInterval = Math.max(400, Math.floor(MASTERMIND_INTERVAL / difficulty));
        if (s.frame % boostInterval === 0) {
            s.masterBoostTimer = MASTERMIND_BOOST_DURATION;
            s.whales.forEach(w => { w.boosted = true; });
        }
        if (!s.masterBoostActive) s.whales.forEach(w => { w.boosted = false; });

        // Whale AI
        s.whales.forEach(w => {
            if (w.hearts <= 0) return;
            if (w.blinkTimer > 0) w.blinkTimer--;
            if (w.stunTimer > 0) { w.stunTimer--; return; }

            const hearts = Math.max(1, Math.min(WHALE_MAX_HEARTS, w.hearts));
            let speed = w.speed * WHALE_SPEED_MULT[hearts] * difficulty;
            if (w.boosted) speed *= 1.45;

            const tdx = s.player.x - w.x;
            const tdy = s.player.y - w.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

            // Gradual turning — sharper than before
            const targetAngle = Math.atan2(tdy, tdx) - Math.PI / 2;
            let diff = targetAngle - w.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const turnRate = WHALE_TURN_RATE * (1 + difficulty * 0.25);
            w.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate);

            if (tdist > w.radius + PLAYER_RADIUS * 0.3) {
                // Move in direction whale faces
                const moveDir = w.angle + Math.PI / 2;
                let wx = w.x + Math.cos(moveDir) * speed;
                let wy = w.y + Math.sin(moveDir) * speed;

                s.corals.forEach(c => {
                    if (circlesOverlap(wx, wy, w.radius * 0.6, c.x, c.y, c.r * 0.7)) {
                        const cdx = wx - c.x, cdy = wy - c.y;
                        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                        wx += (cdx / cdist) * 2;
                        wy += (cdy / cdist) * 2;
                    }
                });

                w.x = Math.max(w.radius, Math.min(W - w.radius, wx));
                w.y = Math.max(w.radius, Math.min(H - w.radius, wy));
            }

            // Whale bites player — player slows down
            if (circlesOverlap(w.x, w.y, w.radius, s.player.x, s.player.y, PLAYER_RADIUS * 0.6)) {
                if (s.playerIframe === 0) {
                    s.playerHearts--;
                    s.playerIframe = 55; // short window — continuous contact keeps dealing damage
                    spawnParticles(s, s.player.x, s.player.y, '#ff4444', 8);
                    if (s.playerHearts <= 0) {
                        s.gameOver = true;
                        endGame(s.score);
                    }
                }
            }

            if (Math.random() < 0.002) w.blinkTimer = 6;
        });

        // Laser movement
        s.lasers = s.lasers.filter(l => {
            l.x += l.vx; l.y += l.vy;
            l.dist += LASER_SPEED;
            if (l.dist > LASER_MAX_DIST || l.x < 0 || l.x > W || l.y < 0 || l.y > H) return false;

            s.whales.forEach(w => {
                if (w.hearts > 0 && !l.hit && circlesOverlap(l.x, l.y, 4, w.x, w.y, w.radius * 0.65)) {
                    w.hearts = Math.max(0, w.hearts - 1); // laser = 1 damage
                    w.stunTimer = 25;
                    s.masterAnger = Math.min(1, s.masterAnger + 0.07);
                    spawnParticles(s, l.x, l.y, '#00ffaa', 6);
                    l.hit = true;
                }
            });
            return !l.hit;
        });

        // Boat spawn timer
        s.boatTimer--;
        if (s.boatTimer <= 0) {
            const interval = Math.max(150, Math.floor((BOAT_INTERVAL + Math.random() * 200) / difficulty));
            s.boatTimer = interval;
            const fromLeft = Math.random() < 0.5;
            const y = 30 + Math.random() * (H - 60);
            const size = 0.65 + Math.random() * 0.8; // 0.65=small/fast, 1.45=big/slow
            s.pendingBoats.push({ fromLeft, y, size, countdown: BOAT_INDICATOR_FRAMES });
        }

        // Pending boats → active boats
        s.pendingBoats = s.pendingBoats.filter(pb => {
            pb.countdown--;
            if (pb.countdown <= 0) {
                const boatSpeed = BOAT_BASE_SPEED * (0.7 / Math.max(0.5, pb.size)) * Math.sqrt(difficulty);
                s.boats.push({
                    x: pb.fromLeft ? -70 * pb.size : W + 70 * pb.size,
                    y: pb.y,
                    dir: pb.fromLeft ? 1 : -1,
                    size: pb.size,
                    speed: boatSpeed,
                    damage: pb.size > 1.0 ? 2 : 1, // big boats do 2 damage, small do 1
                });
                return false;
            }
            return true;
        });

        // Boat movement & whale hits
        s.boats = s.boats.filter(boat => {
            boat.x += boat.dir * boat.speed;
            s.whales.forEach(w => {
                if (w.hearts > 0 && circlesOverlap(boat.x, boat.y, 42 * boat.size, w.x, w.y, w.radius * 0.75)) {
                    if (w.stunTimer === 0) {
                        w.hearts = Math.max(0, w.hearts - boat.damage);
                        w.stunTimer = 90;
                        s.masterAnger = Math.min(1, s.masterAnger + 0.15);
                        spawnParticles(s, w.x, w.y, '#ff8800', 10);
                    }
                }
            });
            return boat.x > -150 && boat.x < W + 150;
        });

        // Fish
        if (s.fish.length < MAX_FISH && s.frame % 120 === 0) spawnFish(s);
        s.fish.forEach(f => {
            f.bobTimer++;
            f.x += Math.cos(f.angle) * 0.4;
            f.y += Math.sin(f.angle) * 0.4;
            if (f.bobTimer % 120 === 0) f.angle += (Math.random() - 0.5) * 1.2;
            if (f.x < 0) f.x = W; if (f.x > W) f.x = 0;
            if (f.y < 0) f.y = H; if (f.y > H) f.y = 0;
            if (circlesOverlap(s.player.x, s.player.y, PLAYER_RADIUS, f.x, f.y, FISH_RADIUS)) {
                if (s.playerHearts < 3) {
                    s.playerHearts = Math.min(3, s.playerHearts + 1);
                    spawnParticles(s, f.x, f.y, '#44ff88', 6);
                } else {
                    s.score += 10;
                    spawnParticles(s, f.x, f.y, '#ffdd44', 6);
                }
                f._eaten = true;
            }
        });
        s.fish = s.fish.filter(f => !f._eaten);

        updatePassive(s);
        while (s.fish.length < MAX_FISH) spawnFish(s);
    }

    function endGame(score) {
        if (animId) cancelAnimationFrame(animId);
        if (dotNetRef) dotNetRef.invokeMethodAsync('OnUmmFoodGameOver', score).catch(() => {});
    }

    function loop() {
        update(state);
        render(state);
        if (!state.gameOver) animId = requestAnimationFrame(loop);
    }

    // ── MOUSE ──────────────────────────────────────────────────────────────────

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        mouseX = Math.max(0, Math.min(W, (e.clientX - rect.left) * scaleX));
        mouseY = Math.max(0, Math.min(H, (e.clientY - rect.top) * scaleY));
    }

    function onMouseDown(e) { if (e.button === 0) mouseDown = true; }
    function onMouseUp(e)   { if (e.button === 0) mouseDown = false; }

    // ── KEYS ───────────────────────────────────────────────────────────────────

    function onKeyDown(e) {
        keys[e.code] = true;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    }
    function onKeyUp(e) { keys[e.code] = false; }

    // ── PUBLIC API ─────────────────────────────────────────────────────────────

    function attachListeners() {
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.style.cursor = 'crosshair';
    }

    function detachListeners() {
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
        if (canvas) {
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.style.cursor = '';
        }
    }

    window.initUmmFood = function (dotNet) {
        dotNetRef = dotNet;
        canvas = document.getElementById('ummFoodCanvas');
        if (!canvas) { console.error('ummFoodCanvas not found'); return; }
        ctx = canvas.getContext('2d');
        state = initState();
        mouseDown = false; shootFrame = -99;
        attachListeners();
        animId = requestAnimationFrame(loop);
    };

    window.restartUmmFood = function (dotNet) {
        dotNetRef = dotNet;
        if (animId) cancelAnimationFrame(animId);
        detachListeners();
        keys = {}; mouseDown = false; shootFrame = -99;
        canvas = document.getElementById('ummFoodCanvas');
        if (!canvas) { console.error('ummFoodCanvas not found'); return; }
        ctx = canvas.getContext('2d');
        state = initState();
        attachListeners();
        animId = requestAnimationFrame(loop);
    };

    window.destroyUmmFood = function () {
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        detachListeners();
        keys = {}; mouseDown = false;
        state = null;
    };

})();
