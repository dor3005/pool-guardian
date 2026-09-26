(() => {
    const SVG_NS = "http://www.w3.org/2000/svg";
    let selectedRange = "24h";

    function formatTemperature(value) {
        const number = Number(value);
        return Number.isFinite(number)
            ? `${number.toFixed(1)} °C`
            : "--";
    }

    function formatDateTime(value) {
        const date = new Date(value);

        if (!Number.isFinite(date.getTime())) {
            return "--";
        }

        return date.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatDuration(value) {
        const totalSeconds = Math.max(0, Number(value) || 0);
        const totalMinutes = Math.floor(totalSeconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        if (totalMinutes > 0) {
            return `${totalMinutes}m`;
        }

        return `${Math.floor(totalSeconds)}s`;
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

    function renderSensorErrors(history) {
        const list = document.getElementById("sensorErrorHistory");
        const empty = document.getElementById("sensorErrorsEmpty");
        const periods = Array.isArray(history?.periods)
            ? [...history.periods].slice(-20).reverse()
            : [];

        setText("sensorErrorCount", `${Number(history?.total_periods ?? 0)} periods`);

        if (!list || !empty) {
            return;
        }

        list.replaceChildren();
        empty.hidden = periods.length > 0;

        periods.forEach((period) => {
            const item = document.createElement("li");
            item.className = "history-item";

            const title = document.createElement("span");
            title.className = "history-title";
            title.textContent = period.active ? "Sensor Error · Ongoing" : "Sensor Error";

            const time = document.createElement("span");
            time.className = "history-time";
            time.textContent = `${formatDateTime(period.started_at)} → ${period.active ? "Now" : formatDateTime(period.ended_at)}`;

            const duration = document.createElement("span");
            duration.className = "history-duration";
            duration.textContent = formatDuration(period.duration_seconds);

            item.append(title, time, duration);
            list.appendChild(item);
        });
    }

    function renderSwimmingModeHistory(history) {
        const list = document.getElementById("swimmingModeHistory");
        const empty = document.getElementById("swimmingHistoryEmpty");
        const sessions = Array.isArray(history?.sessions)
            ? [...history.sessions].slice(-20).reverse()
            : [];

        setText("swimmingSessionCount", `${Number(history?.total_sessions ?? 0)} sessions`);

        if (!list || !empty) {
            return;
        }

        list.replaceChildren();
        empty.hidden = sessions.length > 0;

        sessions.forEach((session) => {
            const item = document.createElement("li");
            item.className = "history-item";

            const title = document.createElement("span");
            title.className = `history-title${session.active ? " active-badge" : ""}`;
            title.textContent = session.active ? "Swimming Mode · Active" : "Swimming Mode";

            const source = document.createElement("span");
            source.className = `source-badge ${session.source === "automatic" ? "automatic" : "manual"}`;
            source.textContent = session.source === "automatic" ? "automatic" : "manual";
            title.appendChild(source);

            const time = document.createElement("span");
            time.className = "history-time";
            time.textContent = `${formatDateTime(session.started_at)} → ${formatDateTime(session.ended_at)}`;

            const duration = document.createElement("span");
            duration.className = "history-duration";
            duration.textContent = formatDuration(session.duration_seconds);

            item.append(title, time, duration);
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
            const [statisticsResult, sensorResult, swimmingResult] = await Promise.all([
                supabaseClient.rpc("get_pool_statistics", { p_range: selectedRange }),
                supabaseClient.rpc("get_sensor_error_history", { p_range: selectedRange }),
                supabaseClient.rpc("get_swimming_mode_history", { p_range: selectedRange })
            ]);

            const error = statisticsResult.error || sensorResult.error || swimmingResult.error;
            if (error) {
                throw error;
            }

            renderStatistics(statisticsResult.data);
            renderSensorErrors(sensorResult.data);
            renderSwimmingModeHistory(swimmingResult.data);
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
