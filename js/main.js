/* ==========================================================
   Light Painting — app logic

   How it works, in short:
   - While the child moves a finger (or the mouse), we leave a trail of
     small points along the path. The trail is a "light thread".
   - Every point then floats on a slow, invisible "current" (like a leaf
     on water), so the thread bends, stretches and spreads out.
   - Every frame we redraw the WHOLE thread with very thin, almost
     transparent lines, on top of what is already there. Because the
     thread moves a little between frames, the lines lie side by side
     and form a silky sheet of light.
   - Each line is drawn like a neon tube: a wider colored glow, with a
     thin, almost white core on top. Lights add up ("lighter" blending),
     so where many lines overlap — on the folds of the silk — the light
     turns bright white, while the edges keep a colored outline.
   - Rotational symmetry of order n: the same thread is drawn n times,
     rotated around the canvas center by 360° / n each time.
   ========================================================== */

(function () {
    "use strict";

    /* ------------------------------------------------------
       1. SETTINGS
       ------------------------------------------------------ */

    // Colors the kids can choose from: a short list of bright light colors
    // (picked from the "Sand Pictures" palette). `name` is shown on screen (Romanian).
    // h = hue (0–360), s = saturation (%), l = lightness (%)
    const COLORS = [
        { name: "Curcubeu",      rainbow: true },
        { name: "Roșu",          h: 0,   s: 85, l: 52 },
        { name: "Portocaliu",    h: 28,  s: 95, l: 55 },
        { name: "Galben",        h: 50,  s: 95, l: 57 },
        { name: "Verde deschis", h: 95,  s: 70, l: 60 },
        { name: "Verde",         h: 125, s: 65, l: 45 },
        { name: "Turcoaz",       h: 175, s: 75, l: 46 },
        { name: "Bleu",          h: 195, s: 85, l: 72 },
        { name: "Albastru",      h: 212, s: 85, l: 55 },
        { name: "Mov",           h: 272, s: 60, l: 52 },
        { name: "Magenta",       h: 310, s: 85, l: 50 },
        { name: "Roz",           h: 330, s: 90, l: 74 },
        { name: "Alb",           h: 40,  s: 15, l: 93 }
    ];

    // Available orders of rotational symmetry.
    // Order 1 means "no symmetry" (the drawing does not repeat).
    const SYMMETRY_ORDERS = [1, 2, 3, 4, 5, 6];

    // Symmetry selected when the app starts
    const START_SYMMETRY = 6;

    // Distance between two trail points, in CSS pixels. Smaller = smoother line.
    const POINT_SPACING = 4;

    // How long a trail point lives, in frames (about 60 frames = one second).
    // Longer = the sheet of light spreads out more.
    const POINT_LIFE = 100;

    // At most this many points in one thread (keeps the app fast on old tablets)
    const MAX_POINTS_PER_THREAD = 450;

    // While the finger is held still, the light keeps drawing curvy loops around it.
    // Step: how far the light moves every frame (CSS pixels).
    // Pull: how strongly it is pulled back toward the finger (bigger = smaller loops).
    // Turn: how much the light turns every frame, in radians (it always curves).
    const HOLD_STEP = 4.5;
    const HOLD_PULL = 0.025;
    const HOLD_TURN = 0.065;

    // How strongly the loops are pushed outward, away from the finger
    const HOLD_BLOOM = 0.25;

    // How many frames a new point takes to reach full brightness
    const FADE_IN_FRAMES = 6;

    // How strongly the current pushes the points. Bigger = wilder curls.
    const CURRENT_STRENGTH = 0.045;

    // How much of its speed a point keeps every frame (1 = keeps all, 0 = stops at once).
    const FRICTION = 0.955;

    // How much of the finger's speed a new point gets. Gives the light a "throw".
    const THROW = 0.12;

    // Size of the current's swirls (smaller number = bigger swirls)
    const CURRENT_SCALE = 0.0035;

    // How fast the current changes over time
    const CURRENT_SPEED = 0.006;

    // Every line is drawn twice, like a glowing neon tube:
    // 1. a wider, colored GLOW (this makes the colored outer edge)
    // 2. a thin, almost white CORE on top of it (this makes the white light)
    // Where many lines overlap, the cores add up to bright white;
    // at the sparse edges of the silk only the colored glow shows.

    // Glow: opacity (0 = invisible, 1 = solid) and width in CSS pixels
    const GLOW_OPACITY = 0.07;
    const GLOW_WIDTH = 1.8;

    // Core: opacity, width in CSS pixels, and how much white is mixed into
    // the color (0 = pure color, 1 = pure white)
    const CORE_OPACITY = 0.13;
    const CORE_WIDTH = 0.6;
    const CORE_WHITE_MIX = 0.55;

    // Lines are grouped into this many brightness levels before drawing
    // (drawing each tiny segment separately would be too slow)
    const BRIGHTNESS_LEVELS = 8;

    // How long clearing takes (in frames): the drawing fades out instead of vanishing
    const CLEAR_FRAMES = 24;

    // Background color (same as the --background variable in css/style.css)
    const BACKGROUND = "#05050c";

    // File name of the saved picture
    const SAVE_FILE_NAME = "pictura-cu-lumina.png";

    /* ------------------------------------------------------
       2. PAGE ELEMENTS
       ------------------------------------------------------ */

    const drawArea = document.getElementById("drawArea");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const guide = document.getElementById("guide");
    const hint = document.getElementById("hint");
    const colorsContainer = document.getElementById("colors");
    const symmetriesContainer = document.getElementById("symmetries");
    const symmetryName = document.getElementById("symmetryName");
    const clearButton = document.getElementById("clearButton");
    const saveButton = document.getElementById("saveButton");
    const confirmDialog = document.getElementById("confirm");
    const yesButton = document.getElementById("yesButton");
    const noButton = document.getElementById("noButton");

    /* ------------------------------------------------------
       3. APP STATE
       ------------------------------------------------------ */

    let width = 0;           // canvas width, in CSS pixels
    let height = 0;          // canvas height, in CSS pixels
    let pixelRatio = 1;      // real pixels per CSS pixel ("retina" screens have 2 or 3)
    let centerX = 0;         // center of the symmetry
    let centerY = 0;

    let selectedColor = COLORS[0];          // rainbow at start
    let symmetryOrder = START_SYMMETRY;
    let rainbowHue = Math.random() * 360;
    let time = 0;                           // increases every frame; moves the current
    let clearFramesLeft = 0;                // > 0 while the drawing is fading out

    // Light threads being drawn right now (including the ones fading out)
    const threads = [];

    // Fingers (or the mouse) currently on the screen: pointerId → thread
    const pointers = new Map();

    /* ------------------------------------------------------
       4. CANVAS SETUP
       ------------------------------------------------------ */

    // Fit the canvas to the drawing area.
    // If there is already a drawing, keep it, centered on the new canvas.
    function setupCanvas() {
        // Make a copy of the old drawing (if any)
        let copy = null;
        if (canvas.width > 0 && canvas.height > 0) {
            copy = document.createElement("canvas");
            copy.width = canvas.width;
            copy.height = canvas.height;
            copy.getContext("2d").drawImage(canvas, 0, 0);
        }

        // Remember the old center, so the living threads can move with the drawing
        const oldCenterX = centerX;
        const oldCenterY = centerY;

        width = drawArea.clientWidth;
        height = drawArea.clientHeight;
        pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        centerX = width / 2;
        centerY = height / 2;

        // Shift the living threads together with the drawing
        for (const thread of threads) {
            for (const p of thread.points) {
                p.x += centerX - oldCenterX;
                p.y += centerY - oldCenterY;
            }
            thread.lastX += centerX - oldCenterX;
            thread.lastY += centerY - oldCenterY;
        }

        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";

        fillBackground();

        // Put the old drawing back, with its center on the new canvas center
        if (copy) {
            ctx.drawImage(
                copy,
                Math.round((canvas.width - copy.width) / 2),
                Math.round((canvas.height - copy.height) / 2)
            );
        }

        drawGuide();
    }

    // Paint the whole canvas with the background color
    function fillBackground() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = BACKGROUND;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    /* ------------------------------------------------------
       5. THE CURRENT: a smooth, swirling flow (like water)
       ------------------------------------------------------ */

    // A table of random numbers, used to build smooth "noise":
    // a value that changes gently from place to place and over time.
    const NOISE_SIZE = 256;
    const noisePerm = new Uint8Array(NOISE_SIZE * 2);
    const noiseValues = new Float32Array(NOISE_SIZE);
    (function initNoise() {
        const order = [];
        for (let i = 0; i < NOISE_SIZE; i++) {
            order.push(i);
            noiseValues[i] = Math.random() * 2 - 1;
        }
        // Shuffle the order (Fisher–Yates)
        for (let i = NOISE_SIZE - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = order[i];
            order[i] = order[j];
            order[j] = tmp;
        }
        for (let i = 0; i < NOISE_SIZE * 2; i++) noisePerm[i] = order[i % NOISE_SIZE];
    })();

    // Smooth step curve: makes the noise soft, without visible corners
    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // Random value stored at a grid corner (x, y, z are whole numbers)
    function cornerValue(x, y, z) {
        return noiseValues[noisePerm[noisePerm[noisePerm[x & 255] + (y & 255)] + (z & 255)]];
    }

    // 3D value noise: a smooth number between −1 and 1 for any (x, y, z)
    function noise3(x, y, z) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const zi = Math.floor(z);
        const u = fade(x - xi);
        const v = fade(y - yi);
        const w = fade(z - zi);
        return lerp(
            lerp(
                lerp(cornerValue(xi, yi, zi), cornerValue(xi + 1, yi, zi), u),
                lerp(cornerValue(xi, yi + 1, zi), cornerValue(xi + 1, yi + 1, zi), u),
                v
            ),
            lerp(
                lerp(cornerValue(xi, yi, zi + 1), cornerValue(xi + 1, yi, zi + 1), u),
                lerp(cornerValue(xi, yi + 1, zi + 1), cornerValue(xi + 1, yi + 1, zi + 1), u),
                v
            ),
            w
        );
    }

    // The current at point (x, y). It is the "curl" of the noise: it always
    // flows around the hills and valleys of the noise, never into them, so
    // it makes swirls like water, without points piling up in one place.
    // The result is written into `out` (to avoid creating new objects).
    const CURL_STEP = 0.5;
    function currentAt(x, y, out) {
        const nx = x * CURRENT_SCALE;
        const ny = y * CURRENT_SCALE;
        const nz = time * CURRENT_SPEED;
        const dx = noise3(nx + CURL_STEP, ny, nz) - noise3(nx - CURL_STEP, ny, nz);
        const dy = noise3(nx, ny + CURL_STEP, nz) - noise3(nx, ny - CURL_STEP, nz);
        out.x = dy / (2 * CURL_STEP);
        out.y = -dx / (2 * CURL_STEP);
    }

    /* ------------------------------------------------------
       6. LIGHT THREADS
       ------------------------------------------------------ */

    // Create a new thread at the touched spot
    function createThread(x, y) {
        const thread = {
            points: [],        // trail points, oldest first
            lastX: x,          // where the last trail point was added
            lastY: y,
            fingerX: x,        // where the finger is now
            fingerY: y,
            active: true,      // true while the finger is on the screen
            grew: false,       // true if the finger added points during this frame
            heading: Math.random() * Math.PI * 2,   // direction of the loops around the finger
            seed: Math.random() * 100               // makes every thread loop differently
        };
        addPoint(thread, x, y, 0, 0);
        return thread;
    }

    // Add one trail point, with a little "throw" in the finger's direction
    function addPoint(thread, x, y, fingerVX, fingerVY) {
        thread.points.push({
            x: x,
            y: y,
            vx: fingerVX * THROW + (Math.random() - 0.5) * 0.02,
            vy: fingerVY * THROW + (Math.random() - 0.5) * 0.02,
            age: 0
        });
        // Too many points: drop the oldest ones
        if (thread.points.length > MAX_POINTS_PER_THREAD) {
            thread.points.splice(0, thread.points.length - MAX_POINTS_PER_THREAD);
        }
        thread.lastX = x;
        thread.lastY = y;
        thread.grew = true;
    }

    // The finger is held still: keep drawing light in curvy loops around it.
    // The light moves forward while always turning a little (so it curves),
    // and is gently pulled back toward the finger (so it stays around it).
    function loopAroundFinger(thread) {
        // The turn changes smoothly over time: sometimes tighter, sometimes wider curls
        const wobble = noise3(time * 0.015, thread.seed, 0) * 0.3;
        thread.heading += HOLD_TURN + wobble;

        const stepX = Math.cos(thread.heading) * HOLD_STEP;
        const stepY = Math.sin(thread.heading) * HOLD_STEP;
        const x = thread.lastX + stepX + (thread.fingerX - thread.lastX) * HOLD_PULL;
        const y = thread.lastY + stepY + (thread.fingerY - thread.lastY) * HOLD_PULL;

        // The new point is thrown along the loop and a little outward from the
        // finger, so the curls open up like the petals of a flower
        const outX = (x - thread.fingerX) * HOLD_BLOOM;
        const outY = (y - thread.fingerY) * HOLD_BLOOM;
        addPoint(thread, x, y, stepX + outX, stepY + outY);
    }

    // The finger moved to (x, y): fill the gap with evenly spaced points
    function extendThread(thread, x, y) {
        const dx = x - thread.lastX;
        const dy = y - thread.lastY;
        const distance = Math.hypot(dx, dy);
        if (distance < POINT_SPACING) return;

        const steps = Math.floor(distance / POINT_SPACING);
        const startX = thread.lastX;
        const startY = thread.lastY;
        for (let i = 1; i <= steps; i++) {
            const t = (i * POINT_SPACING) / distance;
            addPoint(thread, startX + dx * t, startY + dy * t, dx, dy);
        }
    }

    // Move every point of a thread by one step and remove the ones that died
    const flow = { x: 0, y: 0 };
    function moveThread(thread) {
        const points = thread.points;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            currentAt(p.x, p.y, flow);
            p.vx = (p.vx + flow.x * CURRENT_STRENGTH) * FRICTION;
            p.vy = (p.vy + flow.y * CURRENT_STRENGTH) * FRICTION;
            p.x += p.vx;
            p.y += p.vy;
            p.age++;
        }
        // The oldest points are at the start of the list
        let dead = 0;
        while (dead < points.length && points[dead].age >= POINT_LIFE) dead++;
        if (dead > 0) points.splice(0, dead);
    }

    // How bright a point is, from 0 to 1, depending on its age:
    // it lights up quickly, then slowly fades away
    function brightness(age) {
        const fadeIn = Math.min(1, age / FADE_IN_FRAMES);
        const fadeOut = 1 - age / POINT_LIFE;
        return fadeIn * fadeOut * fadeOut;
    }

    // Convert a palette color to red, green, blue (0–255)
    function hslToRgb(h, s, l) {
        s /= 100;
        l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [f(0) * 255, f(8) * 255, f(4) * 255];
    }

    // The color of the light right now, as red, green, blue (0–255)
    function currentLightRgb() {
        return selectedColor.rainbow
            ? hslToRgb(rainbowHue, 100, 60)
            : hslToRgb(selectedColor.h, selectedColor.s, selectedColor.l);
    }

    // Mix a color with white (amount: 0 = unchanged, 1 = white) and return a CSS string
    function mixWithWhite(rgb, amount) {
        const mixed = rgb.map((c) => Math.round(c + (255 - c) * amount));
        return "rgb(" + mixed[0] + ", " + mixed[1] + ", " + mixed[2] + ")";
    }

    // Colors used in the current frame (set once per frame in frame())
    let glowColor = "";
    let coreColor = "";

    // Draw a thread as many times as the symmetry requires, rotated around the center
    function drawThread(thread) {
        const points = thread.points;
        if (points.length < 2) return;

        // Sort the small segments into a few brightness levels, one path per level.
        // Coordinates are relative to the center, so the paths can be rotated.
        const paths = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const level = Math.round(Math.min(brightness(a.age), brightness(b.age)) * BRIGHTNESS_LEVELS);
            if (level === 0) continue;
            if (!paths[level]) paths[level] = new Path2D();
            paths[level].moveTo(a.x - centerX, a.y - centerY);
            paths[level].lineTo(b.x - centerX, b.y - centerY);
        }

        const angleStep = (Math.PI * 2) / symmetryOrder;
        for (let k = 0; k < symmetryOrder; k++) {
            // Rotate the canvas around the center by k · (360° / n)
            const cos = Math.cos(angleStep * k) * pixelRatio;
            const sin = Math.sin(angleStep * k) * pixelRatio;
            ctx.setTransform(cos, sin, -sin, cos, centerX * pixelRatio, centerY * pixelRatio);

            // First the wide colored glow, then the thin white core on top
            strokeLevels(paths, glowColor, GLOW_WIDTH, GLOW_OPACITY);
            strokeLevels(paths, coreColor, CORE_WIDTH, CORE_OPACITY);
        }
    }

    // Stroke every brightness level with the given color, width and opacity
    function strokeLevels(paths, color, lineWidth, opacity) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        for (let level = 1; level <= BRIGHTNESS_LEVELS; level++) {
            if (!paths[level]) continue;
            ctx.globalAlpha = (opacity * level) / BRIGHTNESS_LEVELS;
            ctx.stroke(paths[level]);
        }
    }

    /* ------------------------------------------------------
       7. THE FRAME: what happens ~60 times per second
       ------------------------------------------------------ */

    function frame() {
        time++;

        if (clearFramesLeft > 0) {
            // Clearing: cover the drawing with a veil of "night", thicker each frame
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = BACKGROUND;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            clearFramesLeft--;
            if (clearFramesLeft === 0) fillBackground();   // at the end, the canvas is fully clean
        } else if (threads.length > 0) {
            ctx.globalCompositeOperation = "lighter";   // lights add up, like stage spotlights
            ctx.lineCap = "round";
            const rgb = currentLightRgb();
            glowColor = mixWithWhite(rgb, 0);
            coreColor = mixWithWhite(rgb, CORE_WHITE_MIX);

            for (const thread of threads) {
                // Finger on the screen but not moving: draw loops around it
                if (thread.active && !thread.grew) loopAroundFinger(thread);
                thread.grew = false;

                moveThread(thread);
                drawThread(thread);
            }
            // The rainbow slowly changes color only while something is drawn
            rainbowHue = (rainbowHue + 0.6) % 360;

            // Remove threads whose finger is gone and whose light has faded out
            for (let i = threads.length - 1; i >= 0; i--) {
                if (!threads[i].active && threads[i].points.length === 0) {
                    threads.splice(i, 1);
                }
            }
        }

        requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------
       8. FINGER AND MOUSE INPUT
       ------------------------------------------------------ */

    // Touch position relative to the canvas's top-left corner
    function getPosition(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    canvas.addEventListener("pointerdown", (event) => {
        if (clearFramesLeft > 0) return;   // wait for clearing to finish
        event.preventDefault();
        try {
            canvas.setPointerCapture(event.pointerId);
        } catch (error) {
            // Some browsers refuse capture in rare cases; drawing still works
        }

        // Hide the start hint on the first touch
        hint.classList.add("fade");

        const pos = getPosition(event);
        const thread = createThread(pos.x, pos.y);
        threads.push(thread);
        pointers.set(event.pointerId, thread);
    });

    canvas.addEventListener("pointermove", (event) => {
        const thread = pointers.get(event.pointerId);
        if (!thread) return;
        // Fast moves deliver several positions per event: use all of them
        const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
        for (const e of events.length > 0 ? events : [event]) {
            const pos = getPosition(e);
            thread.fingerX = pos.x;
            thread.fingerY = pos.y;
            extendThread(thread, pos.x, pos.y);
        }
    });

    // The finger was lifted (or left the page): the thread keeps floating and fades out
    function releasePointer(event) {
        const thread = pointers.get(event.pointerId);
        if (!thread) return;
        thread.active = false;
        pointers.delete(event.pointerId);
    }

    canvas.addEventListener("pointerup", releasePointer);
    canvas.addEventListener("pointercancel", releasePointer);
    canvas.addEventListener("lostpointercapture", releasePointer);

    // No right-click / long-press menu on the canvas
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    /* ------------------------------------------------------
       9. COLOR PALETTE (top bar)
       ------------------------------------------------------ */

    // CSS color string for one palette entry
    function hslString(color) {
        return "hsl(" + color.h + ", " + color.s + "%, " + color.l + "%)";
    }

    function buildPalette() {
        COLORS.forEach((color, index) => {
            const button = document.createElement("button");
            button.className = "button color";
            button.type = "button";
            button.setAttribute("role", "radio");
            button.title = color.name;
            button.setAttribute("aria-label", color.name);

            if (color.rainbow) {
                button.classList.add("rainbow");
            } else {
                button.style.background = hslString(color);
                button.style.setProperty("--glow", hslString(color));
            }

            button.addEventListener("click", () => selectColor(index));
            colorsContainer.appendChild(button);
        });
        selectColor(0);
    }

    function selectColor(index) {
        selectedColor = COLORS[index];
        Array.from(colorsContainer.children).forEach((button, i) => {
            const selected = i === index;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-checked", selected ? "true" : "false");
        });
    }

    /* ------------------------------------------------------
       10. ROTATIONAL SYMMETRY (side bar)
       ------------------------------------------------------ */

    // Full, technically correct name shown in tooltips (Romanian, on screen)
    function symmetryFullName(order) {
        return order === 1 ? "Fără simetrie" : "Simetrie de rotație de ordinul " + order;
    }

    // Short text shown under the buttons (Romanian, on screen)
    function symmetryShortName(order) {
        return order === 1 ? "fără" : "de ordinul " + order;
    }

    // Build a button icon: one dot for each repetition, arranged in a circle,
    // with the order number in the middle
    function symmetryIcon(order) {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "-20 -20 40 40");
        svg.setAttribute("class", "symmetry-icon");
        svg.setAttribute("aria-hidden", "true");

        for (let k = 0; k < order; k++) {
            // Start at the top (−90°) and go clockwise
            const angle = -Math.PI / 2 + (Math.PI * 2 * k) / order;
            const x = Math.cos(angle) * 15;
            const y = Math.sin(angle) * 15;

            const spoke = document.createElementNS(ns, "line");
            spoke.setAttribute("class", "spoke");
            spoke.setAttribute("x1", (Math.cos(angle) * 9).toFixed(2));
            spoke.setAttribute("y1", (Math.sin(angle) * 9).toFixed(2));
            spoke.setAttribute("x2", x.toFixed(2));
            spoke.setAttribute("y2", y.toFixed(2));
            svg.appendChild(spoke);

            const dot = document.createElementNS(ns, "circle");
            dot.setAttribute("class", "dot");
            dot.setAttribute("cx", x.toFixed(2));
            dot.setAttribute("cy", y.toFixed(2));
            dot.setAttribute("r", "3.4");
            svg.appendChild(dot);
        }

        // In the middle: the order number, or "fără" (none)
        const text = document.createElementNS(ns, "text");
        text.setAttribute("class", order === 1 ? "number small" : "number");
        text.setAttribute("x", "0");
        text.setAttribute("y", "1");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = order === 1 ? "fără" : String(order);
        svg.appendChild(text);

        return svg;
    }

    function buildSymmetryButtons() {
        SYMMETRY_ORDERS.forEach((order) => {
            const button = document.createElement("button");
            button.className = "button symmetry";
            button.type = "button";
            button.setAttribute("role", "radio");
            button.dataset.order = String(order);
            button.title = symmetryFullName(order);
            button.setAttribute("aria-label", symmetryFullName(order));
            button.appendChild(symmetryIcon(order));
            button.addEventListener("click", () => selectSymmetry(order));
            symmetriesContainer.appendChild(button);
        });
        selectSymmetry(START_SYMMETRY);
    }

    function selectSymmetry(order) {
        symmetryOrder = order;
        Array.from(symmetriesContainer.children).forEach((button) => {
            const selected = Number(button.dataset.order) === order;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-checked", selected ? "true" : "false");
        });
        symmetryName.textContent = symmetryShortName(order);
        drawGuide();
        flashGuide();
    }

    // Faint rays from the center showing how many parts the drawing repeats in
    function drawGuide() {
        const ns = "http://www.w3.org/2000/svg";
        guide.setAttribute("viewBox", "0 0 " + width + " " + height);
        guide.textContent = "";   // remove the old rays

        const length = Math.hypot(width, height);   // long enough to leave the screen
        if (symmetryOrder > 1) {
            for (let k = 0; k < symmetryOrder; k++) {
                const angle = -Math.PI / 2 + (Math.PI * 2 * k) / symmetryOrder;
                const ray = document.createElementNS(ns, "line");
                ray.setAttribute("class", "ray");
                ray.setAttribute("x1", centerX);
                ray.setAttribute("y1", centerY);
                ray.setAttribute("x2", centerX + Math.cos(angle) * length);
                ray.setAttribute("y2", centerY + Math.sin(angle) * length);
                guide.appendChild(ray);
            }
        }

        const center = document.createElementNS(ns, "circle");
        center.setAttribute("class", "center");
        center.setAttribute("cx", centerX);
        center.setAttribute("cy", centerY);
        center.setAttribute("r", "4");
        guide.appendChild(center);
    }

    // Show the rays for a moment, then fade them out
    let guideTimer = null;
    function flashGuide() {
        // Wait one frame so the new rays start hidden and fade in smoothly
        requestAnimationFrame(() => {
            guide.classList.add("visible");
            clearTimeout(guideTimer);
            guideTimer = setTimeout(() => guide.classList.remove("visible"), 1400);
        });
    }

    /* ------------------------------------------------------
       11. CLEAR AND SAVE
       ------------------------------------------------------ */

    // The X button asks first, so the drawing isn't lost by accident
    clearButton.addEventListener("click", () => {
        confirmDialog.classList.remove("hidden");
        noButton.focus();
    });

    function closeConfirm() {
        confirmDialog.classList.add("hidden");
    }

    yesButton.addEventListener("click", () => {
        closeConfirm();
        // Stop the threads being drawn and start fading out the drawing
        threads.length = 0;
        pointers.clear();
        clearFramesLeft = CLEAR_FRAMES;
    });

    noButton.addEventListener("click", closeConfirm);

    // Tapping outside the dialog box closes it (same as "No")
    confirmDialog.addEventListener("click", (event) => {
        if (event.target === confirmDialog) closeConfirm();
    });

    // The Esc key closes it too
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeConfirm();
    });

    // Save the drawing as a PNG image
    saveButton.addEventListener("click", () => {
        // A small "flash" on the button, so it's clear the picture was taken
        saveButton.classList.remove("flash");
        void saveButton.offsetWidth;   // restart the animation
        saveButton.classList.add("flash");

        canvas.toBlob((blob) => {
            if (!blob) return;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = SAVE_FILE_NAME;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        }, "image/png");
    });

    /* ------------------------------------------------------
       12. STARTUP
       ------------------------------------------------------ */

    // When the window is resized (or the tablet rotated), rebuild the
    // canvas — but wait a bit, so we don't rebuild it dozens of times.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(setupCanvas, 150);
    });

    setupCanvas();
    buildPalette();
    buildSymmetryButtons();
    requestAnimationFrame(frame);
})();
