(() => {
    if (typeof initStatistics === "function") {
        initStatistics();
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
            .register("./service-worker.js?v=24")
            .catch((error) => {
                console.error("Service Worker registration failed:", error);
            });
    }
})();
