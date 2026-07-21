function setSimulationState(lowFloat, highFloat) {
    poolData.lowFloat = lowFloat;
    poolData.highFloat = highFloat;

    poolData.lastUpdate =
        new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

    updateDashboard();
}

(() => {
    initWaterLevel();
    initDashboard();
    updateDashboard();

    const debugElement =
        document.getElementById("debugStatus");

    if (typeof initSupabase !== "function") {
        if (debugElement) {
            debugElement.textContent =
                "Debug error: initSupabase not loaded";
        }
    } else {
        if (debugElement) {
            debugElement.textContent =
                "Debug: starting Supabase…";
        }

        initSupabase().catch((error) => {
            console.error(
                "Supabase startup failed:",
                error
            );

            if (debugElement) {
                debugElement.textContent =
                    `Debug startup error: ${error.message}`;
            }
        });
    }

    const notificationButton =
        document.getElementById(
            "enableNotifications"
        );

if (notificationButton) {
    notificationButton.addEventListener(
        "click",
        async () => {
            notificationButton.textContent =
                "⏳ Enabling Push...";

            try {
                await enablePushNotifications();

                notificationButton.textContent =
                    "✅ Push Notifications Enabled";

                notificationButton.disabled = true;
            } catch (error) {
                console.error(
                    "Could not enable Push:",
                    error
                );

                if (
                    "Notification" in window &&
                    Notification.permission === "denied"
                ) {
                    notificationButton.textContent =
                        "🔕 Notifications Blocked";
                } else {
                    notificationButton.textContent =
                        "❌ Push Registration Failed";
                }
            }
        }
    );
}

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
            .register("./service-worker.js?v=10")
            .then(() => {
                console.log(
                    "Service Worker registered"
                );
            })
            .catch((error) => {
                console.error(
                    "Service Worker registration failed:",
                    error
                );
            });
    }

    document
        .getElementById("simulateLow")
        ?.addEventListener("click", () => {
            setSimulationState(false, false);
        });

    document
        .getElementById("simulateNormal")
        ?.addEventListener("click", () => {
            setSimulationState(true, false);
        });

    document
        .getElementById("simulateHigh")
        ?.addEventListener("click", () => {
            setSimulationState(true, true);
        });

    document
        .getElementById("simulateError")
        ?.addEventListener("click", () => {
            setSimulationState(false, true);
        });
})();