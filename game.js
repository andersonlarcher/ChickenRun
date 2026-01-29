const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let socket;

// Initial Mode
let GAME_MODE = 'LOCAL'; // LOCAL, ONLINE_HOST, ONLINE_CLIENT
let ROOM_ID = null;
let PLAYER_ROLE = 0; // 0 = Host/P1, 1 = Client/P2

// Game Config
const CONFIG = {
    gravity: 0.07,
    flapStrength: -3.0,
    speed: 1.8,
    spawnRate: 200,
    gapSize: 270,
    giantDuration: 450,
    invertDuration: 240,
    ghostDuration: 600
};

const EFFECTS = { NONE: 0, SPEED_BOOST: 1, STEAL_EGGS: 2, SHOOT: 3, GHOST: 4 };

// --- Asset Loading ---
const ASSETS = {
    chickenRed: new Image(),
    chickenBlue: new Image(),
    background: new Image(),
    loaded: false
};

ASSETS.chickenRed.src = 'assets/chicken_red.png?v=' + Date.now();
ASSETS.chickenBlue.src = 'assets/chicken_blue.png?v=' + Date.now();
ASSETS.background.src = 'assets/background.png?v=' + Date.now();
// Custom Audio
ASSETS.deathSound = new Audio('assets/death.mp3?v=' + Date.now());
// Ensure volume is up
ASSETS.deathSound.volume = 1.0;
ASSETS.flapSound = new Audio('assets/flap.mp3?v=' + Date.now());
ASSETS.flapSound.volume = 1.0;

let assetsLoaded = 0;
const totalAssets = 3;

ASSETS.chickenRed.onload = ASSETS.chickenBlue.onload = ASSETS.background.onload = () => {
    assetsLoaded++;
    if (assetsLoaded === totalAssets) {
        ASSETS.loaded = true;
        console.log('All assets loaded!');
    }
};

// --- Sound Effects ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(frequency, duration, type = 'sine') {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
}

const SOUNDS = {
    flap: () => {
        // Custom Flap Action
        if (ASSETS.flapSound) {
            ASSETS.flapSound.currentTime = 0;
            let promise = ASSETS.flapSound.play();
            if (promise !== undefined) {
                promise.catch(() => {
                    // Fallback to synth if fails
                    playSound(600, 0.08, 'square');
                });
            }
        } else {
            playSound(600, 0.08, 'square');
        }
    },
    score: () => playSound(800, 0.15, 'sine'),
    score: () => playSound(800, 0.15, 'sine'),
    hit: () => {
        // Impact thud (Shield used)
        playSound(100, 0.1, 'sawtooth');
    },
    death: () => {
        // Chicken Scream
        if (ASSETS.deathSound) {
            ASSETS.deathSound.currentTime = 0;
            let promise = ASSETS.deathSound.play();
            if (promise !== undefined) {
                promise.catch(e => {
                    console.error("Audio play failed:", e);
                    playSound(50, 0.5, 'sawtooth'); // Fallback
                });
            }
        } else {
            playSound(50, 0.5, 'sawtooth');
        }
    },
    egg: () => playSound(1200, 0.05, 'sine'), // High pitch ding
    powerup: () => {
        // Happy chicken sound
        playSound(700, 0.1, 'sine');
        setTimeout(() => playSound(900, 0.1, 'sine'), 50);
        setTimeout(() => playSound(800, 0.08, 'sine'), 100);
    }
};

// Background Music
let bgMusicPlaying = false;
let bgMusicMuted = false;

function playNote(frequency, startTime, duration, force = false) {
    if (bgMusicMuted && !force) return; // Silent if muted, unless forced
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.frequency.value = frequency;
    osc.type = 'triangle';

    gain.gain.setValueAtTime(0.08, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration);
}

// Global Mute Toggle
// Global Mute Toggle (BGM Only)
window.toggleMute = function () {
    const btn = document.getElementById('mute-btn');
    bgMusicMuted = !bgMusicMuted;

    // Ensure AudioContext is running (user interaction policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (bgMusicMuted) {
        btn.innerText = '🔇';
    } else {
        btn.innerText = '🔊';
    }

    // Remove focus so Spacebar doesn't trigger button again
    btn.blur();
};

function playBackgroundMusic() {
    if (bgMusicPlaying) return;
    bgMusicPlaying = true;

    // Simple catchy melody (C major scale pattern)
    const melody = [
        { note: 523.25, duration: 0.3 }, // C5
        { note: 659.25, duration: 0.3 }, // E5
        { note: 783.99, duration: 0.3 }, // G5
        { note: 659.25, duration: 0.3 }, // E5
        { note: 698.46, duration: 0.4 }, // F5
        { note: 659.25, duration: 0.4 }, // E5
        { note: 587.33, duration: 0.6 }, // D5
        { note: 523.25, duration: 0.3 }, // C5
        { note: 587.33, duration: 0.3 }, // D5
        { note: 659.25, duration: 0.3 }, // E5
        { note: 523.25, duration: 0.3 }, // C5
        { note: 587.33, duration: 0.6 }, // D5
        { note: 523.25, duration: 0.8 }  // C5
    ];

    function playLoop() {
        if (!bgMusicPlaying) return;

        let time = audioCtx.currentTime;
        melody.forEach((note, i) => {
            playNote(note.note, time, note.duration);
            time += note.duration;
        });

        // Loop after melody finishes (add small gap)
        setTimeout(playLoop, (time - audioCtx.currentTime + 0.5) * 1000);
    }

    playLoop();
}

function stopBackgroundMusic() {
    bgMusicPlaying = false;
}



function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- Network Functions ---

function initAudio() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}



function startSinglePlayer() {
    initAudio();
    GAME_MODE = 'SINGLE'; // Changed from LOCAL
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('start-screen').classList.add('active');
    init();
}

// Keep startLocal just in case dev needs it, or remove if unused. User said replace.
// function startLocal() { ... } replaced by above.

function createRoom() {
    initAudio();
    socket = io();
    setupSocketListeners();
    socket.emit('create_room');
    setStatus("Creating room...");
}

function joinRoom() {
    initAudio();
    const code = document.getElementById('room-code-input').value;
    if (!code) return setStatus("Enter a code!");

    socket = io();
    setupSocketListeners();
    socket.emit('join_room', code);
    setStatus("Joining...");
}

function setStatus(msg) {
    document.getElementById('lobby-status').innerText = msg;
}

function setupSocketListeners() {
    socket.on('room_created', (code) => {
        ROOM_ID = code;
        GAME_MODE = 'ONLINE_HOST';
        PLAYER_ROLE = 0; // Host is always P1
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('waiting-screen').classList.add('active');
        document.getElementById('room-code-display').innerText = code;
    });

    socket.on('game_start', (data) => {
        document.getElementById('waiting-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.remove('active');

        if (GAME_MODE !== 'ONLINE_HOST') {
            ROOM_ID = document.getElementById('room-code-input').value.toUpperCase();
            GAME_MODE = 'ONLINE_CLIENT';
            PLAYER_ROLE = 1; // Joiner is P2
        }

        // Start!
        init();
        document.getElementById('start-screen').classList.add('active');

        // Sync Initial State
        if (GAME_MODE === 'ONLINE_HOST') {
            // Host creates world
        }
    });

    socket.on('error_message', (msg) => {
        setStatus(msg);
    });

    socket.on('host_input', () => {
        if (GAME_MODE === 'ONLINE_HOST') {
            // Received P2 flap
            if (gameState === 'PLAYING') p2.flap();
        }
    });

    socket.on('client_update', (state) => {
        if (GAME_MODE === 'ONLINE_CLIENT') {
            // Apply State
            applyState(state);
        }
    });

    socket.on('sync_event', (data) => {
        if (data.type === 'COUNTDOWN') startCountdown(true);
        if (data.type === 'RESTART') resetGame(true);
        if (data.type === 'GAMEOVER') {
            // Force Client Game Over
            gameState = 'GAMEOVER';
            ui.winnerText.innerText = data.msg;
            if (gameOverTimeout) clearTimeout(gameOverTimeout);
            gameOverTimeout = setTimeout(() => {
                ui.gameOverScreen.classList.add('active');
            }, 500);
        }
    });

    socket.on('player_disconnected', () => {
        alert("Opponent disconnected!");
        location.reload();
    });
}

// ... (Rest of code) ...

function checkGameOver() {
    if (p1.dead && p2.dead) {
        // Prevent multiple checks
        if (gameState === 'GAMEOVER') return;

        gameState = 'GAMEOVER';
        let msg = "DRAW!";

        if (GAME_MODE === 'SINGLE') {
            msg = "GAME OVER";
            // Optional: "SCORE: " + score1
        } else {
            if (score1 > score2) msg = "PLAYER 1 WINS!";
            else if (score2 > score1) msg = "PLAYER 2 WINS!";
        }

        ui.winnerText.innerText = msg;
        if (gameOverTimeout) clearTimeout(gameOverTimeout);
        gameOverTimeout = setTimeout(() => {
            ui.gameOverScreen.classList.add('active');
        }, 500);

        // Sync if Host
        if (GAME_MODE === 'ONLINE_HOST') {
            socket.emit('sync_event', { type: 'GAMEOVER', roomId: ROOM_ID, msg: msg });
        }
    }
}

// --- Game Classes ---

class Bird {
    constructor(playerIndex) {
        this.playerIndex = playerIndex;
        this.x = 100 + (playerIndex * 50);
        this.baseX = this.x; // Store initial X for boosting logic
        this.y = canvas.height / 2;
        this.radius = 25;
        this.velocity = 0;
        this.baseColor = playerIndex === 0 ? '#ff5722' : '#2196f3';
        this.color = this.baseColor;
        this.dead = false;
        this.inverted = false;

        this.boosting = false;
        this.giant = false;
        this.ghost = false;
        this.effectTimer = 0;
        this.currentEffect = EFFECTS.NONE;

        this.invincible = false;
        this.invincibleTimer = 0;
    }

    draw() {
        if (this.dead) return;
        ctx.save();

        // Flash if invincible
        if (this.invincible) {
            if (Math.floor(Date.now() / 100) % 2 === 0) {
                ctx.globalAlpha = 0.5;
            }
        }

        // Ghost Transparency (Overrides invincible flash opacity for consistency)
        if (this.ghost) {
            ctx.globalAlpha = 0.4;
        }

        let scale = this.giant ? 2 : 1;
        let size = this.radius * scale * 3;

        // Use sprite if loaded, otherwise fallback to canvas drawing
        if (ASSETS.loaded) {
            let sprite = this.playerIndex === 0 ? ASSETS.chickenRed : ASSETS.chickenBlue;

            // Rotate based on velocity for tilt effect
            let angle = Math.min(Math.max(this.velocity * 0.1, -0.5), 0.5);
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);

            ctx.drawImage(sprite, -size / 2, -size / 2, size, size);

            ctx.rotate(-angle);
            ctx.translate(-this.x, -this.y);
        } else {
            // Fallback: simple circle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * scale, 0, Math.PI * 2);
            ctx.fill();
        }

        // Effect indicator (purple ring for inverted)
        if (this.inverted) {
            ctx.strokeStyle = '#9c27b0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, size * 0.7, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Ghost mode countdown timer
        if (this.ghost && this.effectTimer > 0) {
            let secondsLeft = Math.ceil(this.effectTimer / 60); // Convert frames to seconds (assuming 60fps)

            ctx.fillStyle = '#2196f3';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            // White outline for visibility
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.strokeText(secondsLeft + 's', this.x, this.y - size * 0.8);

            ctx.fillText(secondsLeft + 's', this.x, this.y - size * 0.8);
        }

        // Effect indicator (Purple lines for boost)
        if (this.boosting) {
            ctx.strokeStyle = '#9c27b0'; // Purple
            ctx.lineWidth = 3;
            // Draw speed lines behind
            ctx.beginPath();
            ctx.moveTo(this.x - 30, this.y - 10);
            ctx.lineTo(this.x - 60, this.y - 15);
            ctx.moveTo(this.x - 30, this.y + 10);
            ctx.lineTo(this.x - 60, this.y + 15);
            ctx.stroke();
        }

        // Timer display logic... (omitted if not used or simple)
        if (this.boosting && this.effectTimer > 0) {
            let secondsLeft = Math.ceil(this.effectTimer / 60);
            ctx.fillStyle = '#9c27b0';
            ctx.font = 'bold 20px Arial';
            ctx.fillText(secondsLeft + 's', this.x, this.y - 40);
        }

        // Invincible Timer Visual (Optional, or just flashing)
        if (this.invincible) {
            // Maybe a shield icon?
            // Simplification: Flashing is enough
        }

        ctx.restore();
    }

    update() {
        if (this.dead) return;
        // Client does NOT run physics, only interpolation usually, but for simple prototype we'll overwrite pos
        if (GAME_MODE === 'ONLINE_CLIENT') return;

        let g = this.inverted ? -CONFIG.gravity : CONFIG.gravity;
        this.velocity += g;
        this.y += this.velocity;

        // Forward Boost Logic (Lerp X)
        let targetX = this.x; // Keep current x if not boosting
        if (this.boosting) targetX = this.x + 150; // This will make it move forward, but it should probably be `this.baseX` if it's a fixed position. Assuming `this.x` is the current position.

        // This line was added in the diff, but `this.baseX` is not defined in the Bird class.
        // If `this.x` is meant to be the base position, then `targetX` should be `this.x` initially.
        // If `this.x` is the current position, then `targetX` should be a target X coordinate.
        // Given the context of `this.x += (targetX - this.x) * 0.1;`, `targetX` should be a fixed target.
        // Let's assume `this.x` is the current position and `baseX` is intended to be a property.
        // For now, I'll use `this.x` as the base for `targetX` to avoid introducing undefined variables.
        // If `baseX` was intended, it should be added to the constructor.
        // Re-reading the diff: `let targetX = this.baseX;` and `if (this.boosting) targetX = this.baseX + 150;`
        // This implies `this.baseX` should exist. I will add `this.baseX = x;` to the constructor.
        // However, the original constructor sets `this.x = 100 + (playerIndex * 50);`.
        // It's more likely `this.baseX` is meant to be `this.x` at the start of the game.
        // I will add `this.baseX = this.x;` to the constructor.

        // Corrected logic based on the diff's intent for `baseX`
        let targetX_for_lerp = this.x; // Default to current x
        if (this.boosting) {
            // If boosting, the bird's X position should move forward relative to its starting X.
            // Assuming `this.x` is the current position, and `this.baseX` is the initial X.
            // The diff implies `this.baseX` is a fixed point.
            // Let's assume `this.baseX` is the initial x position of the bird.
            // This would require `this.baseX` to be set in the constructor.
            // For now, I will use the provided diff's logic directly, assuming `this.baseX` is defined elsewhere or implicitly `this.x` at start.
            // To make it syntactically correct, I'll add `this.baseX` to the constructor.
            // The original code does not have `this.baseX`. I will add it to the constructor.
            // This is a deviation from "no unrelated edits" but necessary for syntactic correctness of the provided diff.
            // The user provided `let targetX = this.baseX;` so `this.baseX` must exist.
            // I will add `this.baseX = this.x;` to the constructor.
            targetX_for_lerp = this.baseX + 150;
        } else {
            targetX_for_lerp = this.baseX; // If not boosting, return to baseX
        }
        this.x += (targetX_for_lerp - this.x) * 0.1;


        let size = this.giant ? this.radius * 2 : this.radius;
        if (this.y + size >= canvas.height || this.y - size <= 0) {
            this.die();
        }

        if (this.effectTimer > 0) {
            this.effectTimer--;
            if (this.effectTimer <= 0) this.removeEffects();
        }

        if (this.invincibleTimer > 0) {
            this.invincibleTimer--;
            if (this.invincibleTimer <= 0) {
                this.invincible = false;
            }
        }
    }

    activateInvincibility(frames) {
        this.invincible = true;
        this.invincibleTimer = frames;
    }

    flap() {
        if (this.dead) return;
        SOUNDS.flap();
        if (this.inverted) this.velocity = -CONFIG.flapStrength;
        else this.velocity = CONFIG.flapStrength;
    }

    die() {
        if (this.dead) return;
        this.dead = true;
        checkGameOver();
    }

    applyEffect(effect) {
        this.removeEffects();
        this.currentEffect = effect;
        if (effect === EFFECTS.INVERT_GRAVITY) {
            // Note: INVERT_GRAVITY logic might have been removed/renamed to SPEED_BOOST in previous turns, 
            // but the generation code seemingly still references INVERT_GRAVITY (Wait? I see EFFECTS.INVERT_GRAVITY usage in step 846 output line 682?)
            // AHH! "if (r < 0.4) this.itemEffect = EFFECTS.INVERT_GRAVITY;"
            // BUT "EFFECTS" definition in step 844: "SPEED_BOOST: 1, STEAL_EGGS: 2, SHOOT: 3".
            // So EFFECTS.INVERT_GRAVITY is UNDEFINED in the current code!!
            // This means `this.itemEffect` becomes undefined, so no powerup appears or it defaults?
            // "if (r < 0.4) this.itemEffect = undefined;"
            // And in `draw`: "if (this.itemEffect === undefined) ..." -> probably simplified?

            // I need to fix:
            // 1. INVERT_GRAVITY usage -> SHOULD BE SPEED_BOOST?
            //    Or maybe User wants Invert Gravity back? User said "Invisible stopped appearing".
            //    Usually Ghost = Invisible.
            //    I will assume SPEED_BOOST was the replacement for Invert Gravity in my prior logic or vice versa.
            //    I see `SPEED_BOOST` in EFFECTS.
            //    I see `this.boosting` in Bird.
            //    I see `this.inverted` is mostly unused or legacy?
            //    Let's use SPEED_BOOST, STEAL_EGGS, SHOOT, GHOST.

            // Wait, previous `applyEffect` diff (Step 742) showed:
            // "} else if (effect === EFFECTS.SPEED_BOOST) {"

            // So I should map generation to these valid enums.

            this.inverted = true; // wait, do I keep invert?
            // Let's stick to what's in EFFECTS: SPEED_BOOST.
            this.boosting = true;
            this.effectTimer = 600;
            ui.showEffect(this.playerIndex, "SPEED BOOST!");
        } else if (effect === EFFECTS.SPEED_BOOST) {
            this.boosting = true;
            this.effectTimer = 600;
            ui.showEffect(this.playerIndex, "SPEED BOOST!");
        } else if (effect === EFFECTS.GHOST) {
            this.ghost = true;
            this.effectTimer = CONFIG.ghostDuration;
            ui.showEffect(this.playerIndex, "GHOST!");
        } else if (effect === EFFECTS.SHOOT) {
            // Instant effect: Shoot feathers
            ui.showEffect(this.playerIndex, "FEATHER SHOT!");
            let spread = [-1, 0, 1]; // 3 feathers with slight vertical spread
            spread.forEach(dy => {
                projectiles.push(new FeatherProjectile(this.x, this.y, this.playerIndex, dy));
            });
            // Clear effect text after short delay since it's instant
            setTimeout(() => ui.clearEffect(this.playerIndex), 1000);
        }
    }

    removeEffects() {
        this.inverted = false;
        this.giant = false;
        this.ghost = false;
        this.boosting = false; // Fix: Clear speed boost to allow return
        this.currentEffect = EFFECTS.NONE;
        ui.clearEffect(this.playerIndex);
    }
}

class FeatherProjectile {
    constructor(x, y, ownerIndex, dyMultiplier) {
        this.x = x;
        this.y = y;
        this.ownerIndex = ownerIndex;
        this.w = 40;
        this.h = 10;
        this.speed = 12;
        this.vy = dyMultiplier * 1.5; // Slight spread
        this.dead = false;
    }

    update() {
        this.x += this.speed;
        this.y += this.vy;
        if (this.x > canvas.width) this.dead = true;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.vy * 0.1);

        // Feather
        ctx.fillStyle = this.ownerIndex === 0 ? '#ff5722' : '#2196f3'; // Red vs Blue feathers
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(20, -10, 40, 0); // Top curve
        ctx.quadraticCurveTo(20, 10, 0, 0);   // Bottom curve
        ctx.fill();

        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(35, 0); // Quill
        ctx.stroke();

        ctx.restore();
    }
}

let projectiles = [];

class Pipe {
    constructor(data) {
        if (data) {
            // Hydrate from server
            this.x = data.x;
            this.w = data.w;
            this.segments = data.segments || [];
            this.hasItem = data.hasItem;
            this.itemY = data.itemY;
            this.itemEffect = data.itemEffect;

            // Legacy support
            if (!this.segments.length && data.topHeight) {
                this.segments = [
                    { y: 0, h: data.topHeight },
                    { y: data.bottomY, h: canvas.height - data.bottomY }
                ];
            }
        } else {
            // Create new (Host only)
            this.x = canvas.width;
            this.w = 80;
            this.segments = [];

            let minSegment = 50;
            let gap = CONFIG.gapSize;

            // 50% chance for double gap (more than one passage)
            // User requested "at least every 3 obstacles" - random 50% is good approximation
            if (Math.random() < 0.5) {
                // Double Gap Logic: [Solid] Gap [Solid] Gap [Solid]
                let remainingSpace = canvas.height - (2 * gap);

                if (remainingSpace > 3 * minSegment) {
                    // Distribute remaining space into 3 solid blocks
                    let topH = Math.floor(Math.random() * (remainingSpace - 2 * minSegment)) + minSegment;
                    let availableForMid = remainingSpace - topH;
                    let midH = Math.floor(Math.random() * (availableForMid - minSegment)) + minSegment;
                    let botH = availableForMid - midH;

                    this.segments.push({ y: 0, h: topH });
                    this.segments.push({ y: topH + gap, h: midH });
                    this.segments.push({ y: topH + gap + midH + gap, h: botH });
                } else {
                    // Fallback to single gap if screen too small
                    this.createSingleGap(gap);
                }
            } else {
                this.createSingleGap(gap);
            }

            this.hasItem = Math.random() < 0.4; // Slightly increased chance
            if (this.hasItem) {
                // Place item in a valid gap
                let isDouble = this.segments.length > 2;
                let gapIndex = 0;
                if (isDouble) gapIndex = Math.random() < 0.5 ? 0 : 1;

                // Gap is after segment[gapIndex]
                let gapTop = this.segments[gapIndex].y + this.segments[gapIndex].h;
                this.itemY = gapTop + gap / 2;

                let r = Math.random();
                // 4 Effects, equal chance (0.25 each)
                if (r < 0.25) this.itemEffect = EFFECTS.SPEED_BOOST;
                else if (r < 0.50) this.itemEffect = EFFECTS.STEAL_EGGS;
                else if (r < 0.75) this.itemEffect = EFFECTS.SHOOT;
                else this.itemEffect = EFFECTS.GHOST;
            } else {
                this.itemEffect = EFFECTS.NONE;
            }

            // Eggs (Coins) Logic
            this.eggs = [];
            // High chance (90%) to try spawning eggs
            if (Math.random() < 0.9) {
                let gaps = [];
                if (this.segments.length === 2) {
                    gaps.push({ y: this.segments[0].y + this.segments[0].h, h: this.segments[1].y - (this.segments[0].y + this.segments[0].h) });
                } else if (this.segments.length > 2) {
                    gaps.push({ y: this.segments[0].y + this.segments[0].h, h: this.segments[1].y - (this.segments[0].y + this.segments[0].h) });
                    gaps.push({ y: this.segments[1].y + this.segments[1].h, h: this.segments[2].y - (this.segments[1].y + this.segments[1].h) });
                }

                gaps.forEach(gap => {
                    // 80% chance for eggs in this gap
                    if (Math.random() < 0.8) {
                        // Spawn 1 to 3 eggs vertically distributed
                        let numEggs = Math.floor(Math.random() * 3) + 1;
                        let spacePerEgg = gap.h / (numEggs + 1);
                        for (let i = 1; i <= numEggs; i++) {
                            this.eggs.push({ x: this.x + this.w / 2, y: gap.y + spacePerEgg * i, active: true });
                        }
                    }
                });
            }

            this.passedP1 = false;
            this.passedP2 = false;
        }
    }

    createSingleGap(gap) {
        let min = 50;
        let maxTop = canvas.height - gap - min;
        let topH = Math.floor(Math.random() * (maxTop - min + 1)) + min;
        this.segments.push({ y: 0, h: topH });
        this.segments.push({ y: topH + gap, h: canvas.height - (topH + gap) });
    }

    draw(ctx) {
        this.segments.forEach(seg => {
            this.drawHayStack(ctx, this.x, seg.y, this.w, seg.h);
        });

        // Draw Eggs
        if (this.eggs) {
            this.eggs.forEach(egg => {
                if (egg.active) {
                    ctx.save();
                    ctx.fillStyle = '#fffacd'; // LemonChiffon (Egg color)
                    ctx.beginPath();
                    // Egg shape
                    ctx.ellipse(egg.x, egg.y, 10, 14, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = '#DAA520'; // GoldenRod outline
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Shine
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.beginPath();
                    ctx.ellipse(egg.x - 3, egg.y - 4, 3, 5, -0.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            });
        }

        if (this.hasItem) {
            let itemX = this.x + this.w / 2;
            let size = 40;
            let color = '#ccc';
            let symbol = '?';

            if (this.itemEffect === EFFECTS.SPEED_BOOST) { color = '#9c27b0'; symbol = '⚡'; } // Changed INVERT to SPEED_BOOST/Bolt
            else if (this.itemEffect === EFFECTS.STEAL_EGGS) { color = '#4caf50'; symbol = '💰'; }
            else if (this.itemEffect === EFFECTS.SHOOT) { color = '#ffeb3b'; symbol = '🪶'; }
            else if (this.itemEffect === EFFECTS.GHOST) { color = '#9e9e9e'; symbol = '👻'; }

            ctx.fillStyle = color;
            ctx.fillRect(itemX - size / 2, this.itemY - size / 2, size, size);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(itemX - size / 2, this.itemY - size / 2, size, size);
            ctx.fillStyle = 'black'; // Better contrast on yellow
            if (this.itemEffect !== EFFECTS.SHOOT) ctx.fillStyle = 'white';

            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(symbol, itemX, this.itemY);
        }
    }

    drawHayStack(ctx, x, y, w, h) {
        let baleHeight = 40;
        let baleCount = Math.ceil(h / baleHeight);

        for (let i = 0; i < baleCount; i++) {
            let baleY = y + i * baleHeight;
            let actualHeight = Math.min(baleHeight, h - i * baleHeight);
            if (actualHeight <= 0) continue;

            ctx.fillStyle = '#d4a017';
            ctx.fillRect(x, baleY, w, actualHeight);

            ctx.strokeStyle = '#8b6914';
            ctx.lineWidth = 2;
            for (let j = 0; j < 3; j++) {
                let lineY = baleY + (actualHeight / 4) * (j + 1);
                ctx.beginPath();
                ctx.moveTo(x, lineY);
                ctx.lineTo(x + w, lineY);
                ctx.stroke();
            }

            ctx.strokeStyle = '#654321';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, baleY, w, actualHeight);
        }
    }

    update() {
        this.x -= CONFIG.speed;
        // Update Eggs position
        if (this.eggs) {
            this.eggs.forEach(egg => egg.x = this.x + this.w / 2);
        }
    }

    checkCollisions(bird) {
        if (bird.dead || bird.ghost) return;

        let bx = bird.x - bird.radius;
        let by = bird.y - bird.radius;
        let bw = bird.radius * 2;
        let bh = bird.radius * 2;

        if (bird.giant) {
            bx = bird.x - bird.radius * 2;
            by = bird.y - bird.radius * 2;
            bw = bird.radius * 4;
            bh = bird.radius * 4;
        }

        // Check collision with any segment
        for (let seg of this.segments) {
            if (
                bx < this.x + this.w &&
                bx + bw > this.x &&
                by < seg.y + seg.h &&
                by + bh > seg.y
            ) {
                // If invincible, ignore collision
                if (bird.invincible) return;

                // Check for Egg Shield (>= 20 eggs)
                let currentEggs = (bird.playerIndex === 0) ? eggScore1 : eggScore2;
                if (currentEggs >= 20) {
                    // Survive!
                    if (bird.playerIndex === 0) eggScore1 -= 20;
                    else eggScore2 -= 20;

                    ui.updateScores();
                    SOUNDS.hit(); // Play hit sound as feedback
                    bird.activateInvincibility(90); // 1.5 seconds invincibility

                    // Show text feedback
                    ui.showEffect(bird.playerIndex, "-20 EGGS!");
                    setTimeout(() => ui.clearEffect(bird.playerIndex), 1000);
                } else {
                    // Die (Game Over)
                    SOUNDS.death(); // Play scream
                    bird.die();
                }
                return;
            }
        }

        // Check Eggs
        if (this.eggs) {
            this.eggs.forEach(egg => {
                if (egg.active) {
                    let ex = egg.x - 10;
                    let ey = egg.y - 14;
                    let ew = 20;
                    let eh = 28;

                    if (bx < ex + ew && bx + bw > ex && by < ey + eh && by + bh > ey) {
                        egg.active = false;
                        SOUNDS.egg();
                        if (bird.playerIndex === 0) {
                            eggScore1++;
                        } else {
                            eggScore2++;
                        }
                        ui.updateScores();
                    }
                }
            });
        }

        // Check Item
        if (this.hasItem) {
            let size = 40;
            let ix = this.x + this.w / 2 - size / 2;
            let iy = this.itemY - size / 2;

            if (bx < ix + size && bx + bw > ix && by < iy + size && by + bh > iy) {
                this.collectItem(bird);
            }
        }
    }

    collectItem(collector) {
        this.hasItem = false;
        let opponent = (collector.playerIndex === 0) ? p2 : p1;

        if (this.itemEffect === EFFECTS.SHOOT || this.itemEffect === EFFECTS.SPEED_BOOST || this.itemEffect === EFFECTS.GHOST) {
            SOUNDS.powerup();
            collector.applyEffect(this.itemEffect);
        } else if (this.itemEffect === EFFECTS.STEAL_EGGS) {
            // STEAL LOGIC
            // If Single Player or Opponent Dead, just give eggs
            if (GAME_MODE === 'SINGLE' || opponent.dead) {
                let bonus = 5;
                if (collector.playerIndex === 0) eggScore1 += bonus;
                else eggScore2 += bonus;
                ui.showEffect(collector.playerIndex, `+${bonus} EGGS!`);
                ui.updateScores();
                SOUNDS.powerup();
            } else { // This was `else if (!opponent.dead)`
                SOUNDS.powerup();
                // Steal 5 eggs
                let stealAmount = 5;
                if (collector.playerIndex === 0) {
                    // P1 stealing from P2
                    let actualSteal = Math.min(stealAmount, eggScore2);
                    eggScore2 -= actualSteal;
                    eggScore1 += actualSteal;
                    ui.showEffect(0, `+${actualSteal} EGGS!`);
                    ui.showEffect(1, `-${actualSteal} EGGS!`);
                } else {
                    // P2 stealing from P1
                    let actualSteal = Math.min(stealAmount, eggScore1);
                    eggScore1 -= actualSteal;
                    eggScore2 += actualSteal;
                    ui.showEffect(1, `+${actualSteal} EGGS!`);
                    ui.showEffect(0, `-${actualSteal} EGGS!`);
                }
                ui.updateScores();
            }
        } else {
            if (!opponent.dead) {
                SOUNDS.powerup();
                opponent.applyEffect(this.itemEffect);
            }
        }
    }
}

let pipes = [];
let score1 = 0;
let score2 = 0;
let eggScore1 = 0;
let eggScore2 = 0;
let p1, p2;

const ui = {
    p1Score: document.getElementById('p1-score'),
    p2Score: document.getElementById('p2-score'),
    p1Stats: document.getElementById('p1-stats'),
    p2Stats: document.getElementById('p2-stats'),
    startScreen: document.getElementById('start-screen'),
    gameOverScreen: document.getElementById('game-over-screen'),
    winnerText: document.getElementById('winner-text'),
    countdownEl: document.getElementById('countdown'),

    updateScores: () => {
        // Bottom Big Score
        ui.p1Score.innerText = score1;
        ui.p2Score.innerText = score2;

        // Top Stats
        ui.p1Stats.innerText = `🚧 ${score1} | 🥚 ${eggScore1}`;
        ui.p2Stats.innerText = `🚧 ${score2} | 🥚 ${eggScore2}`;
    },
    showEffect: (playerIndex, text) => {
        let el = document.getElementById(playerIndex === 0 ? 'p1-effect' : 'p2-effect');
        el.innerText = text;
        el.style.opacity = 1;
    },
    clearEffect: (playerIndex) => {
        let el = document.getElementById(playerIndex === 0 ? 'p1-effect' : 'p2-effect');
        el.innerText = "";
    },
    showCountdown: (val) => {
        ui.countdownEl.style.display = 'block';
        ui.countdownEl.innerText = val;
    },
    hideCountdown: () => {
        ui.countdownEl.style.display = 'none';
    }
};

function init() {
    p1 = new Bird(0);
    p2 = new Bird(1);
    pipes = [];
    score1 = 0;
    score2 = 0;
    eggScore1 = 0;
    eggScore2 = 0;

    // Single Player Setup
    if (GAME_MODE === 'SINGLE') {
        p2.dead = true;
        p2.x = -9999; // Move off screen
        // Hide P2 UI
        ui.p2Stats.style.display = 'none';
        ui.p2Score.style.display = 'none';
        document.getElementById('p2-effect').style.display = 'none';
    } else {
        // Reset UI visibility for Multi modes
        ui.p2Stats.style.display = 'block';
        ui.p2Score.style.display = 'block';
        document.getElementById('p2-effect').style.display = 'block';
    }

    frames = 0;
    ui.updateScores();
    gameState = 'START';
}

let gameOverTimeout = null;

function startCountdown(fromSync) {
    if (gameOverTimeout) clearTimeout(gameOverTimeout);

    // Sync trigger
    if (GAME_MODE === 'ONLINE_HOST' && !fromSync) {
        socket.emit('sync_event', { type: 'COUNTDOWN', roomId: ROOM_ID });
    }

    gameState = 'COUNTDOWN';
    ui.startScreen.classList.remove('active');
    ui.gameOverScreen.classList.remove('active');

    // Reset positions IF starting fresh
    if (fromSync || GAME_MODE !== 'ONLINE_CLIENT') init();

    gameState = 'COUNTDOWN';

    // Start background music
    playBackgroundMusic();

    let count = 3;
    ui.showCountdown(count);

    let interval = setInterval(() => {
        count--;
        if (count > 0) {
            ui.showCountdown(count);
        } else if (count === 0) {
            ui.showCountdown("GO!");
        } else {
            clearInterval(interval);
            ui.hideCountdown();
            gameState = 'PLAYING';
            loop();
        }
    }, 1000);
}

function resetGame(fromSync) {
    if (gameOverTimeout) clearTimeout(gameOverTimeout);

    if (GAME_MODE === 'ONLINE_HOST' && !fromSync) {
        socket.emit('sync_event', { type: 'RESTART', roomId: ROOM_ID });
    }

    ui.gameOverScreen.classList.remove('active');
    gameState = 'START';
    ui.startScreen.classList.add('active');
    init();
}

function spawnPipe() {
    pipes.push(new Pipe());
}

function updateGame() {
    // Only HOST or LOCAL update physics
    if (GAME_MODE === 'ONLINE_CLIENT') return;

    frames++;
    if (frames % CONFIG.spawnRate === 0) {
        spawnPipe();
    }


    // Update Projectiles
    for (let i = 0; i < projectiles.length; i++) {
        let p = projectiles[i];
        p.update();

        // Check collision with pipes
        for (let j = 0; j < pipes.length; j++) {
            let pipe = pipes[j];
            for (let k = 0; k < pipe.segments.length; k++) {
                let seg = pipe.segments[k];
                if (
                    p.x < pipe.x + pipe.w &&
                    p.x + p.w > pipe.x &&
                    p.y < seg.y + seg.h &&
                    p.y + p.h > seg.y
                ) {
                    // Destroy segment!
                    pipe.segments.splice(k, 1);
                    p.dead = true;
                    // Optional: hit sound
                    SOUNDS.hit();
                    break;
                }
            }
            if (p.dead) break;
        }

        if (p.dead) {
            projectiles.splice(i, 1);
            i--;
        }
    }

    // Update Pipes
    for (let i = 0; i < pipes.length; i++) {
        let p = pipes[i];
        p.update();

        if (GAME_MODE !== 'ONLINE_CLIENT') {
            p.checkCollisions(p1);
            p.checkCollisions(p2);
        }

        if (p.x + p.w < p1.x && !p.passedP1 && !p1.dead) {
            p.passedP1 = true;
            score1++;
            SOUNDS.score();
            ui.updateScores();
        }
        if (p.x + p.w < p2.x && !p.passedP2 && !p2.dead) {
            p.passedP2 = true;
            score2++;
            SOUNDS.score();
            ui.updateScores();
        }
        if (p.x + p.w < 0) {
            pipes.shift();
            i--;
        }
    }

    if (!p1.dead) p1.update();
    if (!p2.dead) p2.update();

    // Broadcast State if Host
    if (GAME_MODE === 'ONLINE_HOST') {
        broadcastState();
    }
}

function broadcastState() {
    const state = {
        p1: { y: p1.y, dead: p1.dead, inverted: p1.inverted, giant: p1.giant, ghost: p1.ghost, boosting: p1.boosting },
        p2: { y: p2.y, dead: p2.dead, inverted: p2.inverted, giant: p2.giant, ghost: p2.ghost, boosting: p2.boosting },
        pipes: pipes.map(p => ({
            x: p.x, w: p.w, segments: p.segments,
            hasItem: p.hasItem, itemY: p.itemY, itemEffect: p.itemEffect,
            eggs: p.eggs // Sync eggs
        })),
        score1, score2,
        eggScore1, eggScore2 // Sync egg scores
    };
    socket.emit('server_update', { roomId: ROOM_ID, state });
}

function applyState(state) {
    p1.y = state.p1.y;
    p1.dead = state.p1.dead;
    // Apply visual effects if changed... simplification: just set flags
    p1.inverted = state.p1.inverted; p1.giant = state.p1.giant; p1.ghost = state.p1.ghost; p1.boosting = state.p1.boosting;

    p2.y = state.p2.y;
    p2.dead = state.p2.dead;
    p2.inverted = state.p2.inverted; p2.giant = state.p2.giant; p2.ghost = state.p2.ghost; p2.boosting = state.p2.boosting;

    score1 = state.score1;
    score2 = state.score2;
    eggScore1 = state.eggScore1 || 0;
    eggScore2 = state.eggScore2 || 0;
    ui.updateScores();

    // Rebuild pipes just for drawing
    pipes = state.pipes.map(pData => new Pipe(pData));
}


function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image if loaded, otherwise fallback to gradient
    if (ASSETS.loaded && ASSETS.background.complete) {
        // Stretch background to fill entire canvas (fixes seams)
        ctx.drawImage(ASSETS.background, 0, 0, canvas.width, canvas.height);
    } else {
        // Fallback gradient
        let skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.6);
        skyGradient.addColorStop(0, '#87CEEB');
        skyGradient.addColorStop(1, '#B0E0E6');
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height * 0.6);

        let grassGradient = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
        grassGradient.addColorStop(0, '#90EE90');
        grassGradient.addColorStop(1, '#228B22');
        ctx.fillStyle = grassGradient;
        ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);
    }
    pipes.forEach(p => p.draw(ctx));
    projectiles.forEach(p => p.draw(ctx));
    if (p1.dead) p1.draw();
    if (p2.dead) p2.draw();
    if (!p1.dead) p1.draw();
    if (!p2.dead) p2.draw();
}

function checkGameOver() {
    if (p1.dead && p2.dead) {
        // Prevent multiple checks/emits
        if (gameState === 'GAMEOVER') return;

        gameState = 'GAMEOVER';
        let msg = "DRAW!";
        if (score1 > score2) msg = "PLAYER 1 WINS!";
        else if (score2 > score1) msg = "PLAYER 2 WINS!";

        ui.winnerText.innerText = msg;
        if (gameOverTimeout) clearTimeout(gameOverTimeout);
        gameOverTimeout = setTimeout(() => {
            ui.gameOverScreen.classList.add('active');
        }, 500);

        // Sync if Host
        if (GAME_MODE === 'ONLINE_HOST') {
            socket.emit('sync_event', { type: 'GAMEOVER', roomId: ROOM_ID, msg: msg });
        }
    }
}

function loop() {
    if (gameState === 'PLAYING') {
        updateGame();
        draw();
        requestAnimationFrame(loop);
    }
}

// Controls
window.addEventListener('keydown', (e) => {
    // Only send if it matches our role
    if (GAME_MODE === 'ONLINE_CLIENT' && PLAYER_ROLE !== 1) return; // Should not happen
    if (GAME_MODE === 'ONLINE_HOST' && PLAYER_ROLE !== 0) return;

    if (e.code === 'Space' || e.code === 'KeyW') {
        if (GAME_MODE === 'LOCAL' || PLAYER_ROLE === 0) {
            handleAction();
        }
    }

    if (e.code === 'Enter' || e.code === 'ArrowUp') {
        if (GAME_MODE === 'LOCAL' || PLAYER_ROLE === 1) { // In Local P2 uses Enter. In Online P2 IS the client, uses Space usually?
            // Let's standardise: In Online, ANY jump key jumps YOUR bird.
            // But for now, stick to original keys for less confusion if testing locally.
            if (GAME_MODE === 'LOCAL') handleActionP2();
        }
    }

    // Common input handler for Online
    if (GAME_MODE !== 'LOCAL' && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) {
        if (PLAYER_ROLE === 1) { // Client (P2)
            socket.emit('player_input', { roomId: ROOM_ID, input: 'FLAP' });
            // Prediction? No, host authoritative.
        } else {
            // Host (P1)
            handleAction(); // P1 Action
        }
    }
});

function handleAction() {
    if (gameState === 'START' || gameState === 'GAMEOVER') {
        if (gameState === 'START') startCountdown();
        else if (gameState === 'GAMEOVER') resetGame();
    } else if (gameState === 'PLAYING') {
        p1.flap();
    }
}

function handleActionP2() {
    if (gameState === 'PLAYING') p2.flap();
    else if (gameState === 'START') startCountdown();
}

// Initial Init handled by Lobby now
// But we need to init objects for valid drawing/refs
init();
