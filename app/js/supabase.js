async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Notifications are not supported");
        return;
    }

    if (Notification.permission === "default") {
        await Notification.requestPermission();
    }
}

function showWaterAlert(status) {
    console.log(
    "Alert received:",
    status,
    "Permission:",
    Notification.permission
);
    if (Notification.permission !== "granted") {
        return;
    }

    const normalizedStatus = String(status).toUpperCase();

    if (normalizedStatus === "LOW") {
        new Notification("Pool Guardian", {
            body: "⚠️ Pool water level is LOW"
        });
    }

    if (normalizedStatus === "HIGH") {
        new Notification("Pool Guardian", {
            body: "⚠️ Pool water level is HIGH"
        });
    }
}

const SUPABASE_URL = "https://ebmqcflmmbwnkuvdlzfp.supabase.co";
const SUPABASE_KEY = "sb_publishable_Mse4V2hKkL-KoOfiuuYJZQ_iG5h2-TR";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

function applyPoolStatus(status) {
    const normalizedStatus = String(status).toUpperCase();

    if (normalizedStatus === "LOW") {
        poolData.lowFloat = false;
        poolData.highFloat = false;
    } else if (normalizedStatus === "NORMAL") {
        poolData.lowFloat = true;
        poolData.highFloat = false;
    } else if (normalizedStatus === "HIGH") {
        poolData.lowFloat = true;
        poolData.highFloat = true;
    } else {
        poolData.lowFloat = false;
        poolData.highFloat = true;
    }
}
let lastNotificationStatus = null;

async function loadLatestPoolStatus() {
    const { data, error } = await supabaseClient
        .from("pool_status")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error("Failed to load pool status:", error);
        return;
    }
    
    applyPoolStatus(data.status);

    const latestStatus =
    String(data.status).toUpperCase();

if (lastNotificationStatus === null) {
    lastNotificationStatus = latestStatus;
} else if (latestStatus !== lastNotificationStatus) {
    showWaterAlert(latestStatus);
    lastNotificationStatus = latestStatus;
}
    poolData.device =
        data.device_online === true ? "ONLINE" : "OFFLINE";

    if (data.temperature !== null) {
        poolData.temperature = Number(data.temperature);
    }
    if (data.fertilizer_available !== null) {
    poolData.fertilizerFloat =
        data.fertilizer_available === true ||
        data.fertilizer_available === "true";

    console.log(
        "poolData fertilizerFloat:",
        poolData.fertilizerFloat
    );
}

if (data.wifi_signal !== null) {
    poolData.wifiSignal =
        Number(data.wifi_signal);
}

    poolData.lastUpdate = new Date(
        data.created_at
    ).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    updateDashboard();
}

function subscribeToPoolStatus() {
    supabaseClient
        .channel("pool-status-live")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "pool_status"
            },
            (payload) => {
                const data = payload.new;
                console.log("Realtime fertilizer value:", data.fertilizer_available);
                if (data.fertilizer_available !== null) {
    poolData.fertilizerFloat =
        data.fertilizer_available === true ||
        data.fertilizer_available === "true";

    console.log(
        "Realtime poolData fertilizerFloat:",
        poolData.fertilizerFloat
    );
}

                applyPoolStatus(data.status);
                const newStatus =
    String(data.status).toUpperCase();

if (newStatus !== lastNotificationStatus) {
    showWaterAlert(newStatus);
    lastNotificationStatus = newStatus;
}
                
                poolData.device =
                    data.device_online === true
                        ? "ONLINE"
                        : "OFFLINE";

                if (data.temperature !== null) {
                    poolData.temperature =
                        Number(data.temperature);
                }

                if (data.wifi_signal !== null) {
                poolData.wifiSignal =
                 Number(data.wifi_signal);
                }

                poolData.lastUpdate =
                    new Date(
                        data.created_at
                    ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit"
                    });

                updateDashboard();
            }
        )
        .subscribe((status) => {
            console.log(
                "Supabase realtime status:",
                status
            );
        });
}

async function initSupabase() {
    await requestNotificationPermission();
    await loadLatestPoolStatus();
    subscribeToPoolStatus();

    setInterval(() => {
        loadLatestPoolStatus();
    }, 10000);
}