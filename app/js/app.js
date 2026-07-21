(() => {
    initWaterLevel();
    initDashboard();
    updateDashboard();

    if (typeof initSupabase === "function") {
        initSupabase().catch((error) => {
            console.error(
                "Supabase startup failed:",
                error
            );
        });
    } else {
        console.error(
            "initSupabase is not available"
        );
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
            .register("./service-worker.js?v=21")
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
})();