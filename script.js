
// Import MediaPipe Tasks Vision from CDN
import {
    HandLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

// --- CONFIGURATION ---
const PIXELS_PER_UNIT = 60;
const QUESTIONS_SOURCE = [
    { area: 15, perimeter: 16 }, { area: 12, perimeter: 14 },
    { area: 16, perimeter: 16 }, { area: 8, perimeter: 12 },
    { area: 20, perimeter: 18 }, { area: 9, perimeter: 12 },
    { area: 10, perimeter: 14 }, { area: 6, perimeter: 10 },
];

// --- STATE ---
let handLandmarker = undefined;
let webcamRunning = false;
let lastVideoTime = -1;
let results = undefined;
let qIndex = 0;
let questions = [];
let isSuccess = false;
let successTimer = null;
let frozenShape = null;

// Hold Logic State
let holdStartTime = null;
const HOLD_DURATION = 1000; // 1 second (Faster)
let prevUnitW = 0;
let prevUnitH = 0;
let failFeedbackTimer = null;

// Random Praise Messages
const PRAISE_MESSAGES = [
    "HARİKA!",
    "MÜKEMMEL!",
    "DOĞRU YAPTIN!",
    "SÜPERSİN!",
    "TEBRİKLER!",
    "BRAVO!"
];

// DOM Elements
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const loadingScreen = document.getElementById("loading-screen");
const handUiOverlay = document.getElementById("hand-ui-overlay");
const successOverlay = document.getElementById("success-overlay");
const successTitle = successOverlay.querySelector("h1");
const timerValEl = document.getElementById("timer-val");

// UI Update Elements
const elTargetArea = document.getElementById("target-area");
const elTargetPerim = document.getElementById("target-perimeter");
const elLevel = document.getElementById("level-indicator");
const elCurrentArea = document.getElementById("current-area");
const elCurrentPerim = document.getElementById("current-perimeter");
const boxUserArea = document.getElementById("user-area-box");
const boxUserPerim = document.getElementById("user-perimeter-box");
const progressLine = document.querySelector(".progress-line");

function shuffleQuestions() {
    questions = [...QUESTIONS_SOURCE];
    // Fisher-Yates shuffle for true randomness
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }
}

// --- INITIALIZATION ---
async function createHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
    });

    // Once loaded, start camera
    loadingScreen.style.opacity = 0;
    setTimeout(() => {
        loadingScreen.classList.add("hidden");
        enableCam();
    }, 500);
}

function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function enableCam() {
    if (!handLandmarker) {
        console.log("Wait! handLandmarker not loaded yet.");
        return;
    }

    if (hasGetUserMedia()) {
        const constraints = {
            video: {
                width: 1280,
                height: 720
            }
        };

        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
            webcamRunning = true;
            shuffleQuestions();
            updateUI(questions[0]);
        });
    } else {
        console.warn("getUserMedia() is not supported by your browser");
    }
}

// --- GAME LOOP ---
async function predictWebcam() {
    canvasElement.style.width = video.videoWidth;
    canvasElement.style.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = handLandmarker.detectForVideo(video, startTimeMs);
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (isSuccess && frozenShape) {
        drawShape(frozenShape.left, frozenShape.top, frozenShape.right, frozenShape.bottom, frozenShape.unitW, frozenShape.unitH, frozenShape.snappedRight, frozenShape.snappedBottom, true, false);
    } else if (results.landmarks && !isSuccess) {
        processGameLogic(results.landmarks);
    } else if (failFeedbackTimer && !isSuccess) {
        // Option: Show fail state briefly even if hands lost? Maybe not needed.
    }

    canvasCtx.restore();

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

function processGameLogic(landmarks) {
    handUiOverlay.innerHTML = '';
    const w = canvasElement.width;
    const h = canvasElement.height;

    // Draw fingers
    for (const hand of landmarks) {
        const idxTip = hand[8];
        const cx = idxTip.x * w;
        const cy = idxTip.y * h;
        canvasCtx.beginPath();
        canvasCtx.arc(cx, cy, 8, 0, 2 * Math.PI);
        canvasCtx.fillStyle = "#00d2ff";
        canvasCtx.fill();
    }

    if (landmarks.length === 2) {
        const hand1 = landmarks[0][8];
        const hand2 = landmarks[1][8];

        // Calculate Bounding Box
        let left = Math.min(hand1.x * w, hand2.x * w);
        let right = Math.max(hand1.x * w, hand2.x * w);
        let top = Math.min(hand1.y * h, hand2.y * h);
        let bottom = Math.max(hand1.y * h, hand2.y * h);

        let rawW = right - left;
        let rawH = bottom - top;

        let unitW = Math.max(1, Math.round(rawW / PIXELS_PER_UNIT));
        let unitH = Math.max(1, Math.round(rawH / PIXELS_PER_UNIT));

        let currentArea = unitW * unitH;
        let currentPerim = 2 * (unitW + unitH);

        let snappedRight = left + unitW * PIXELS_PER_UNIT;
        let snappedBottom = top + unitH * PIXELS_PER_UNIT;

        let isFailEffect = (failFeedbackTimer !== null);

        // Draw Live Shape
        drawShape(left, top, right, bottom, unitW, unitH, snappedRight, snappedBottom, false, isFailEffect);

        updateStats(currentArea, currentPerim);

        // --- STABILITY CHECK LOGIC ---
        // If dimensions match previous frame
        if (unitW === prevUnitW && unitH === prevUnitH) {
            if (!holdStartTime) {
                holdStartTime = Date.now();
                failFeedbackTimer = null; // Reset any fail effect
            }

            let elapsed = Date.now() - holdStartTime;
            let progress = Math.min(elapsed / HOLD_DURATION, 1.0);

            // Draw Progress Indicator (Circle filling up)
            // Center of the shape
            drawHoldProgress(left + (snappedRight - left) / 2, top - 40, progress);

            if (progress >= 1.0) {
                // Held long enough, check correctness
                let target = questions[qIndex];
                if (currentArea === target.area && currentPerim === target.perimeter) {
                    triggerSuccess(unitW, unitH, left, top, snappedRight, snappedBottom, right, bottom);
                } else {
                    triggerFail(left, top, snappedRight - left, snappedBottom - top); // Visual feedback for wrong answer
                }
                holdStartTime = null; // Reset hold
            }

        } else {
            // Movement detected (dimensions changed)
            holdStartTime = null;
            failFeedbackTimer = null; // Clear fail feedback if moving
        }

        // Update History
        prevUnitW = unitW;
        prevUnitH = unitH;

    } else {
        updateStats(0, 0);
        holdStartTime = null;
        prevUnitW = 0;
        prevUnitH = 0;
    }
}

function triggerFail(x, y, w, h) {
    // Set a timer to show red effect
    failFeedbackTimer = Date.now();

    // Add Shake Effect to body
    document.body.classList.add("shake-effect");

    // Show "YANLIŞ" Label
    const viewport = document.getElementById("viewport"); // Use viewport which isn't cleared
    const label = document.createElement("div");
    label.className = "fail-label";
    label.innerText = "YANLIŞ";
    label.style.left = (x + w / 2) + "px";
    label.style.top = (y + h / 2) + "px";
    viewport.appendChild(label);

    // Auto clear after 2000ms
    setTimeout(() => {
        failFeedbackTimer = null;
        document.body.classList.remove("shake-effect");
        if (label.parentNode) label.parentNode.removeChild(label);
    }, 2000);
}

function drawHoldProgress(cx, cy, progress) {
    const radius = 20;

    // Background Circle
    canvasCtx.beginPath();
    canvasCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
    canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    canvasCtx.lineWidth = 4;
    canvasCtx.stroke();

    // Progress Arc
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (2 * Math.PI * progress);

    canvasCtx.beginPath();
    canvasCtx.arc(cx, cy, radius, startAngle, endAngle);
    canvasCtx.strokeStyle = "#ffffff"; // Neutral white for holding
    canvasCtx.lineWidth = 4;
    canvasCtx.stroke();

    // Text
    canvasCtx.fillStyle = "#fff";
    canvasCtx.font = "bold 10px sans-serif";
    canvasCtx.textAlign = "center";
    canvasCtx.textBaseline = "middle";
    canvasCtx.fillText("TUT", cx, cy);
}

function drawShape(left, top, right, bottom, unitW, unitH, snappedRight, snappedBottom, isFrozen, isFail) {
    // Colors
    let mainColor = "#32ff32"; // Green (Default/Success)

    if (isFail) {
        mainColor = "#ff3232"; // Red
    } else if (!isFrozen) {
        // While holding/neutral, maybe use Blue or Green? Keeping matched logic
        // But if universal hold, user doesn't know yet.
        // Let's keep it Green for "Valid Shape" look, or Blue.
        mainColor = "#32ff32";
    }

    // B. Grid Lines (White)
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    canvasCtx.lineWidth = 2;

    for (let i = 0; i <= unitW; i++) {
        let gx = left + i * PIXELS_PER_UNIT;
        canvasCtx.moveTo(gx, top);
        canvasCtx.lineTo(gx, snappedBottom);
    }
    for (let i = 0; i <= unitH; i++) {
        let gy = top + i * PIXELS_PER_UNIT;
        canvasCtx.moveTo(left, gy);
        canvasCtx.lineTo(snappedRight, gy);
    }
    canvasCtx.stroke();

    // C. Main Box
    canvasCtx.save(); // Save check for shadow

    if (isFrozen) {
        canvasCtx.lineWidth = 8; // Thicker line for success
        canvasCtx.shadowColor = mainColor;
        canvasCtx.shadowBlur = 20; // Glow effect
    } else {
        canvasCtx.lineWidth = 4;
        canvasCtx.shadowBlur = 0;
    }

    canvasCtx.strokeStyle = mainColor;
    canvasCtx.strokeRect(left, top, snappedRight - left, snappedBottom - top);

    canvasCtx.restore(); // Restore to avoid affecting other draws
}

// ... existing updateStats ...
function updateStats(area, perim) {
    elCurrentArea.innerText = area;
    elCurrentPerim.innerText = perim;

    const target = questions[qIndex];
    if (area === target.area) boxUserArea.classList.add("active-match");
    else boxUserArea.classList.remove("active-match");

    if (perim === target.perimeter) boxUserPerim.classList.add("active-match");
    else boxUserPerim.classList.remove("active-match");
}
// ... existing updateUI ...
function updateUI(q) {
    elLevel.innerText = `GÖREV ${qIndex + 1} / ${questions.length}`;
    elTargetArea.innerText = q.area;
    elTargetPerim.innerText = q.perimeter;

    progressLine.style.width = `${((qIndex) / questions.length) * 100}%`;
    progressLine.style.backgroundColor = (isSuccess) ? "#32ff32" : "#00d2ff";
}

function triggerSuccess(unitW, unitH, left, top, snappedRight, snappedBottom, right, bottom) {
    if (isSuccess) return;
    isSuccess = true;

    frozenShape = {
        left, top, right, bottom, unitW, unitH, snappedRight, snappedBottom
    };

    const randomMsg = PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];
    if (successTitle) successTitle.innerText = randomMsg;

    const label = document.createElement("div");
    label.className = "dimension-label";
    label.innerText = `${unitW} x ${unitH}`;
    label.style.left = (left + (snappedRight - left) / 2) + "px";
    label.style.top = (top + (snappedBottom - top) / 2) + "px";
    handUiOverlay.appendChild(label);

    successOverlay.classList.remove("hidden");
    requestAnimationFrame(() => {
        successOverlay.classList.add("visible");
    });

    progressLine.style.width = `${((qIndex + 1) / questions.length) * 100}%`;
    progressLine.style.backgroundColor = "#32ff32";

    let countdown = 5;
    timerValEl.innerText = countdown;

    successTimer = setInterval(() => {
        countdown--;
        timerValEl.innerText = countdown;
        if (countdown <= 0) {
            clearInterval(successTimer);
            nextLevel();
        }
    }, 1000);
}

function nextLevel() {
    isSuccess = false;
    frozenShape = null;
    successOverlay.classList.remove("visible");
    setTimeout(() => {
        successOverlay.classList.add("hidden");
    }, 300);

    progressLine.style.backgroundColor = "#00d2ff";

    qIndex++;
    if (qIndex >= questions.length) {
        shuffleQuestions();
        qIndex = 0;
    }

    updateUI(questions[qIndex]);
    updateStats(0, 0);
}

// Start
createHandLandmarker();
