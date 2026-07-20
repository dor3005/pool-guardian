function initDashboard() {
    console.log("Dashboard initialized");
}

function updateDashboard() {
    const waterLevel = getWaterLevel(
        poolData.lowFloat,
        poolData.highFloat
    );

    document.getElementById("temperature").textContent =
        `${poolData.temperature.toFixed(1)} °C`;

   const wifiElement = document.getElementById("wifiSignal");

wifiElement.textContent = `${poolData.wifiSignal} dBm`;

if (poolData.wifiSignal >= -60) {
    wifiElement.style.color = "#22c55e";
} else if (poolData.wifiSignal >= -75) {
    wifiElement.style.color = "#f59e0b";
} else {
    wifiElement.style.color = "#ef4444";
}

    const deviceElement = document.getElementById("deviceStatus");

deviceElement.textContent = poolData.device;

if (poolData.device === "ONLINE") {
    deviceElement.style.color = "#22c55e";
} else {
    deviceElement.style.color = "#ef4444";
}

    document.getElementById("lastUpdate").textContent =
        `Last Update: ${poolData.lastUpdate}`;

    updateWaterLevel(waterLevel);
    updateFertilizerLevel(poolData.fertilizerFloat);
}