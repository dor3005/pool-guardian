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
    const notificationButton =
    document.getElementById("enableNotifications");

notificationButton.addEventListener("click", async () => {
    notificationButton.textContent =
        "⏳ Requesting permission...";

    if (!("Notification" in window)) {
        notificationButton.textContent =
            "❌ Notifications not supported";
        return;
    }

    try {
        const permission =
            await Notification.requestPermission();

        if (permission === "granted") {
            notificationButton.textContent =
                "✅ Notifications Enabled";
            notificationButton.disabled = true;
        } else if (permission === "denied") {
            notificationButton.textContent =
                "🔕 Notifications Blocked";
        } else {
            notificationButton.textContent =
                "🔔 Permission not selected";
        }
    } catch (error) {
        console.error(error);
        notificationButton.textContent =
            "❌ Notification error";
    }
});
    if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("./service-worker.js?v=8")
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