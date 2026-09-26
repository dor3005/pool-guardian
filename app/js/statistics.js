(() => {
    const SVG_NS = "http://www.w3.org/2000/svg";
    let selectedRange = "24h";

    function formatTemperature(value) {
        const number = Number(value);
        return Number.isFinite(number)
            ? `${number.toFixed(1)} °C`
            : "--";
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function createSvgElement(name, attributes = {}) {
        const element = document.createElementNS(SVG_NS, name);

        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
        });

        return element;
    }

    function setLoading(isLoading) {
        document.querySelectorAll(".range-button").forEach((button) => {
            button.disabled = isLoading;
        });

        const meta = document.getElementById("statisticsMeta");
        if (isLoading && meta) {
            meta.textContent = "Loading statistics…";
        }
    }

    function showError(message = "Statistics are temporarily unavailable.") {
        const errorElement = document.getElementById("statisticsError");
        if (!errorElement) {
            return;
        }

        errorElement.textContent = message;
        errorElement.hidden = false;
    }

    function clearError() {
        const errorElement = document.getElementById("statisticsError");
        if (errorElement) {
            errorElement.hidden = true;
        }
    }

    function renderTemperatureChart(series) {
        const svg = document.getElementById("temperatureChart");
        const grid = document.getElementById("temperatureChartGrid");
        const line = document.getElementById("temperatureChartLine");
        const area = document.getElementById("temperatureChartArea");
        const labels = document.getElementById("temperatureChartLabels");
        const empty = document.getElementById("temperatureChartEmpty");

        if (!svg || !grid || !line || !area || !labels || !empty) {
            return;
        }

        grid.replaceChildren();
        labels.replaceChildren();

        const points = (Array.isArray(series) ? series : [])
            .map((item) => ({
                at: new Date(item.at).getTime(),
                value: Number(item.average)
            }))
            .filter((item) => Number.isFinite(item.at) && Number.isFinite(item.value));

        if (points.length === 0) {
            line.setAttribute("d", "");
            area.setAttribute("d", "");
            empty.hidden = false;
            return;
        }

        empty.hidden = true;

        const width = 800;
        const height = 260;
        const padding = { top: 18, right: 18, bottom: 34, left: 48 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const times = points.map((point) => point.at);
        const values = points.map((point) => point.value);
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const rawMin = Math.min(...values);
        const rawMax = Math.max(...values);
        const temperaturePadding = Math.max((rawMax - rawMin) * 0.15, 0.5);
        const minValue = rawMin - temperaturePadding;
        const maxValue = rawMax + temperaturePadding;

        const xFor = (time) => {
            if (maxTime === minTime) {
                return padding.left + chartWidth / 2;
            }
            return padding.left + ((time - minTime) / (maxTime - minTime)) * chartWidth;
        };

        const yFor = (value) =>
            padding.top + ((maxValue - value) / (maxValue - minValue)) * chartHeight;

        for (let index = 0; index <= 3; index++) {
            const ratio = index / 3;
            const y = padding.top + ratio * chartHeight;
            const labelValue = maxValue - ratio * (maxValue - minValue);

            grid.appendChild(createSvgElement("line", {
                x1: padding.left,
                y1: y,
                x2: width - padding.right,
                y2: y,
                class: "chart-grid-line"
            }));

            const label = createSvgElement("text", {
                x: padding.left - 8,
                y: y + 4,
                "text-anchor": "end",
                class: "chart-label"
            });
            label.textContent = `${labelValue.toFixed(1)}°`;
            labels.appendChild(label);
        }

        const path = points
            .map((point, index) =>
                `${index === 0 ? "M" : "L"} ${xFor(point.at).toFixed(2)} ${yFor(point.value).toFixed(2)}`
            )
            .join(" ");

        const firstX = xFor(points[0].at).toFixed(2);
        const lastX = xFor(points[points.length - 1].at).toFixed(2);
        const baseline = (height - padding.bottom).toFixed(2);

        line.setAttribute("d", path);
        area.setAttribute("d", `${path} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`);

        const dateOptions = selectedRange === "24h"
            ? { hour: "2-digit", minute: "2-digit" }
            : { month: "short", day: "numeric" };

        [points[0], points[points.length - 1]].forEach((point, index) => {
            const label = createSvgElement("text", {
                x: xFor(point.at),
                y: height - 8,
                "text-anchor": index === 0 ? "start" : "end",
                class: "chart-label"
            });
            label.textContent = new Date(point.at).toLocaleString([], dateOptions);
            labels.appendChild(label);
        });
    }

    function renderWaterChanges(waterLevel) {
        const current = String(waterLevel?.current ?? "--").toUpperCase();
        const currentElement = document.getElementById("statisticsWaterCurrent");
        const list = document.getElementById("waterChanges");
        const empty = document.getElementById("waterChangesEmpty");
        const changes = Array.isArray(waterLevel?.changes)
            ? [...waterLevel.changes].slice(-12).reverse()
            : [];

        if (currentElement) {
            currentElement.textContent = current;
            currentElement.className = `water-current ${current.toLowerCase()}`;
        }

        setText("waterChangeCount", `${Number(waterLevel?.total_changes ?? 0)} changes`);

        if (!list || !empty) {
            return;
        }

        list.replaceChildren();
        empty.hidden = changes.length > 0;

        changes.forEach((change) => {
            const item = document.createElement("li");
            item.className = "water-change";

            const transition = document.createElement("span");
            transition.textContent = `${change.from} → ${change.to}`;

            const time = document.createElement("time");
            const changedAt = new Date(change.at);
            time.dateTime = change.at;
            time.textContent = changedAt.toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            item.append(transition, time);
            list.appendChild(item);
        });
    }

    function renderStatistics(data) {
        const temperature = data?.temperature ?? {};

        setText("statCurrent", formatTemperature(temperature.current));
        setText("statMin", formatTemperature(temperature.min));
        setText("statMax", formatTemperature(temperature.max));
        setText("statAverage", formatTemperature(temperature.average));
        setText(
            "statisticsMeta",
            `${Number(temperature.readings ?? 0).toLocaleString()} valid readings`
        );

        renderTemperatureChart(temperature.series);
        renderWaterChanges(data?.water_level ?? {});
    }

    async function loadStatistics(range = selectedRange) {
        selectedRange = range;
        clearError();
        setLoading(true);

        document.querySelectorAll(".range-button").forEach((button) => {
            button.classList.toggle("active", button.dataset.range === selectedRange);
        });

        try {
            const { data, error } = await supabaseClient.rpc(
                "get_pool_statistics",
                { p_range: selectedRange }
            );

            if (error) {
                throw error;
            }

            renderStatistics(data);
        } catch (error) {
            console.error("Could not load statistics:", error);
            showError();
            setText("statisticsMeta", "Could not load data");
        } finally {
            setLoading(false);
        }
    }

    function initStatistics() {
        document.querySelectorAll(".range-button").forEach((button) => {
            button.addEventListener("click", () => {
                loadStatistics(button.dataset.range);
            });
        });

        loadStatistics();
    }

    window.initStatistics = initStatistics;
})();
