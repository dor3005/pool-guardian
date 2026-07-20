function updateFertilizerLevel(hasFertilizer) {
    const statusElement =
        document.getElementById("fertilizerStatus");

    const liquidElement =
        document.getElementById("fertilizerLiquid");

    const floatElement =
        document.getElementById("fertilizerFloat");

    if (hasFertilizer) {
        statusElement.textContent = "🟢 AVAILABLE";
        statusElement.style.color = "#22c55e";

        liquidElement.style.height = "65%";
        floatElement.style.bottom = "175px";
    } else {
        statusElement.textContent = "🔴 REFILL REQUIRED";
        statusElement.style.color = "#ef4444";

        liquidElement.style.height = "6%";
        floatElement.style.bottom = "10px";
    }
}