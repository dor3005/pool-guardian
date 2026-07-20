function setSimulationState(lowFloat, highFloat) {
    poolData.lowFloat = lowFloat;
    poolData.highFloat = highFloat;

    poolData.lastUpdate = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    updateDashboard();
}

document.addEventListener("DOMContentLoaded", () => {
    initWaterLevel();
    initDashboard();
    updateDashboard();
    initSupabase();
    
    if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("./service-worker.js")
        .then(() => {
            console.log("Service Worker registered");
        })
        .catch((error) => {
            console.error("Service Worker registration failed:", error);
        });
}

    document
        .getElementById("simulateLow")
        .addEventListener("click", () => {
            setSimulationState(false, false);
        });

    document
        .getElementById("simulateNormal")
        .addEventListener("click", () => {
            setSimulationState(true, false);
        });

    document
        .getElementById("simulateHigh")
        .addEventListener("click", () => {
            setSimulationState(true, true);
        });

    document
        .getElementById("simulateError")
        .addEventListener("click", () => {
            setSimulationState(false, true);
        });
});