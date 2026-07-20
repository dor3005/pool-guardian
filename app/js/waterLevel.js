function initWaterLevel() {
    console.log("Water Level initialized");
}

function getWaterLevel(lowFloat, highFloat) {
    if (!lowFloat && !highFloat) {
        return "LOW";
    }

    if (lowFloat && !highFloat) {
        return "NORMAL";
    }

    if (lowFloat && highFloat) {
        return "HIGH";
    }

    return "ERROR";
}
function updateWaterLevel(level) {
    const waterStatus = document.getElementById("waterStatus");
    const waterLine = document.querySelector(".water-line");
    const statusDot = document.querySelector(".status-dot");
    const lowBall = document.querySelector(".float.low .float-ball");
    const highBall = document.querySelector(".float.high .float-ball");

    const states = {
        LOW: {
            text: "🔴 LOW",
            color: "#ef4444",
            height: "25%",
            lowOn: false,
            highOn: false
        },
        NORMAL: {
            text: "🟢 NORMAL",
            color: "#22c55e",
            height: "55%",
            lowOn: true,
            highOn: false
        },
        HIGH: {
            text: "🟠 HIGH",
            color: "#f97316",
            height: "85%",
            lowOn: true,
            highOn: true
        },
        ERROR: {
            text: "⚠️ SENSOR ERROR",
            color: "#ef4444",
            height: "55%",
            lowOn: false,
            highOn: true
        }
    };

    const state = states[level] || states.ERROR;

    waterStatus.textContent = state.text;
    statusDot.style.backgroundColor = state.color;
    waterLine.style.height = state.height;

    lowBall.classList.toggle("on", state.lowOn);
    lowBall.classList.toggle("off", !state.lowOn);

    highBall.classList.toggle("on", state.highOn);
    highBall.classList.toggle("off", !state.highOn);
}