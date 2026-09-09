async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Notifications are not supported");
        return;
    }

    if (Notification.permission === "default") {
        await Notification.requestPermission();
    }
}


// --------------------------------------------------
// SUPABASE
// --------------------------------------------------

const SUPABASE_URL =
    "https://ebmqcflmmbwnkuvdlzfp.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_Mse4V2hKkL-KoOfiuuYJZQ_iG5h2-TR";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        global: {
            fetch: (url, options = {}) => {
                return fetch(url, {
                    ...options,
                    cache: "no-store"
                });
            }
        }
    }
);


// --------------------------------------------------
// SWIMMING MODE
// --------------------------------------------------

let swimmingModeUntil = null;
let swimmingModeSource = null;


function isSwimmingModeActive() {
    if (!swimmingModeUntil) {
        return false;
    }

    return (
        new Date(swimmingModeUntil).getTime() >
        Date.now()
    );
}


async function loadPoolControl() {

    const { data, error } = await supabaseClient
        .from("pool_control")
        .select("*")
        .eq("id", 1)
        .single();

    if (error) {
        console.error(
            "Failed to load pool control:",
            error
        );
        return;
    }

    swimmingModeUntil =
        data.swimming_mode_until;

    swimmingModeSource =
        data.swimming_mode_source;

    console.log(
        "Swimming mode:",
        isSwimmingModeActive()
            ? "ACTIVE"
            : "OFF",
        swimmingModeUntil,
        swimmingModeSource
    );
}


// הפעלה ידנית לשעה
async function startSwimmingMode() {

    const until =
        new Date(
            Date.now() + 60 * 60 * 1000
        ).toISOString();

    const { error } = await supabaseClient
        .from("pool_control")
        .update({
            swimming_mode_until: until,
            swimming_mode_source: "manual"
        })
        .eq("id", 1);

    if (error) {
        console.error(
            "Failed to start swimming mode:",
            error
        );
        return false;
    }

    swimmingModeUntil = until;
    swimmingModeSource = "manual";

    console.log(
        "Swimming mode started until:",
        until
    );

    return true;
}


// סיום ידני לפני שעברה שעה
async function stopSwimmingMode() {
    let controlSecret =
        sessionStorage.getItem(
            "poolControlSecret"
        );

    if (!controlSecret) {
        controlSecret = window.prompt(
            "Enter the Pool Guardian admin password"
        );

        if (!controlSecret) {
            return false;
        }

        sessionStorage.setItem(
            "poolControlSecret",
            controlSecret
        );
    }

    const { data, error } =
        await supabaseClient.functions.invoke(
            "end-swimming-mode",
            {
                body: {},
                headers: {
                    "x-pool-control-secret":
                        controlSecret
                }
            }
        );

    if (error) {
        console.error(
            "Failed to stop Swimming Mode:",
            error
        );

        sessionStorage.removeItem(
            "poolControlSecret"
        );

        alert(
            "Could not end Swimming Mode. Check the admin password."
        );

        return false;
    }

    swimmingModeUntil = null;
    swimmingModeSource = null;

    await loadPoolControl();

    console.log(
        data?.already_ended
            ? "Swimming Mode was already off"
            : "Swimming Mode ended and global Push was sent"
    );

    return true;
}

// עדכון מצב שחייה בזמן אמת לכל המכשירים
function subscribeToPoolControl() {

    supabaseClient
        .channel("pool-control-live")
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "pool_control",
                filter: "id=eq.1"
            },
            (payload) => {

                const data = payload.new;

                const wasActive =
                    isSwimmingModeActive();

                swimmingModeUntil =
                    data.swimming_mode_until;

                swimmingModeSource =
                    data.swimming_mode_source;

                const nowActive =
                    isSwimmingModeActive();

                console.log(
                    "Swimming mode updated:",
                    nowActive
                        ? "ACTIVE"
                        : "OFF"
                );

                // כרגע זה Notification מקומי
                // במכשיר שבו האפליקציה פעילה.
                if (!wasActive && nowActive) {
                    showSwimmingModeNotification(
                        true,
                        swimmingModeSource
                    );
                }

                if (wasActive && !nowActive) {
                    showSwimmingModeNotification(
                        false
                    );
                }

                // כשנוסיף UI למצב שחייה,
                // נוכל לעדכן אותו כאן.
                if (
                    typeof updateSwimmingModeUI ===
                    "function"
                ) {
                    updateSwimmingModeUI();
                }
            }
        )
        .subscribe((status) => {
            console.log(
                "Pool control realtime:",
                status
            );
        });
}


// --------------------------------------------------
// NOTIFICATIONS
// --------------------------------------------------

async function showSwimmingModeNotification(
    active,
    source = null
) {

    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return;
    }

    let message;

    if (active) {

        if (source === "automatic") {
            message =
                "🏊 Swimming mode detected automatically. Water level alerts are muted for 60 minutes.";
        } else {
            message =
                "🏊 Swimming mode started. Water level alerts are muted for 60 minutes.";
        }

    } else {

        message =
            "🔔 Swimming mode ended. Water level alerts are active again.";
    }

    const options = {
        body: message,
        icon: "./assets/icon-192.png",
        badge: "./assets/icon-192.png",
        tag: "pool-swimming-mode",
        renotify: true
    };

    try {

        if ("serviceWorker" in navigator) {

            const registration =
                await navigator.serviceWorker.ready;

            await registration.showNotification(
                "Pool Guardian",
                options
            );

        } else {

            new Notification(
                "Pool Guardian",
                options
            );
        }

    } catch (error) {

        console.error(
            "Swimming notification error:",
            error
        );
    }
}


async function showWaterAlert(status) {

    // בזמן שחייה:
    // LOW/HIGH עדיין נמדדים,
    // אבל ההתראות לא נשלחות.
    if (isSwimmingModeActive()) {

        console.log(
            "Water alert suppressed because swimming mode is active"
        );

        return;
    }

    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return;
    }

    const normalizedStatus =
        String(status).toUpperCase();

    let message = null;

    if (normalizedStatus === "LOW") {

        message =
            "⚠️ Pool water level is LOW";

    } else if (
        normalizedStatus === "HIGH"
    ) {

        message =
            "⚠️ Pool water level is HIGH";
    }

    if (!message) {
        return;
    }

    const options = {
        body: message,
        icon: "./assets/icon-192.png",
        badge: "./assets/icon-192.png",
        tag: `pool-${normalizedStatus}`,
        renotify: true
    };

    try {

        if ("serviceWorker" in navigator) {

            const registration =
                await navigator.serviceWorker.ready;

            await registration.showNotification(
                "Pool Guardian",
                options
            );

        } else {

            new Notification(
                "Pool Guardian",
                options
            );
        }

    } catch (error) {

        console.error(
            "Failed to show notification:",
            error
        );
    }
}


// --------------------------------------------------
// WATER STATUS
// --------------------------------------------------

function applyPoolStatus(status) {

    const normalizedStatus =
        String(status).toUpperCase();

    if (normalizedStatus === "LOW") {

        poolData.lowFloat = false;
        poolData.highFloat = false;

    } else if (
        normalizedStatus === "NORMAL"
    ) {

        poolData.lowFloat = true;
        poolData.highFloat = false;

    } else if (
        normalizedStatus === "HIGH"
    ) {

        poolData.lowFloat = true;
        poolData.highFloat = true;

    } else {

        poolData.lowFloat = false;
        poolData.highFloat = true;
    }
}


let lastNotificationStatus = null;


// --------------------------------------------------
// LOAD LATEST POOL STATUS
// --------------------------------------------------

async function loadLatestPoolStatus() {

    const debugElement =
        document.getElementById(
            "debugStatus"
        );

    if (debugElement) {

        debugElement.textContent =
            `Debug: polling at ${new Date().toLocaleTimeString()}`;
    }

    const { data, error } =
        await supabaseClient
            .from("pool_status")
            .select("*")
            .order(
                "created_at",
                { ascending: false }
            )
            .limit(1)
            .single();


    if (error) {

        console.error(
            "Failed to load pool status:",
            error
        );

        if (debugElement) {
            debugElement.textContent =
                `Debug error: ${error.message}`;
        }

        return;
    }


    if (debugElement) {

        debugElement.textContent =
            `Debug: received ${data.status} at ${new Date().toLocaleTimeString()}`;
    }


    applyPoolStatus(data.status);


    const latestStatus =
        String(data.status).toUpperCase();


    try {

        updateWaterLevel(
            latestStatus
        );

        if (debugElement) {

            const displayedStatus =
                document
                    .getElementById(
                        "waterStatus"
                    )
                    ?.textContent;

            debugElement.textContent =
                `Received ${latestStatus} | UI: ${displayedStatus}`;
        }

    } catch (error) {

        console.error(
            "Water display error:",
            error
        );

        if (debugElement) {

            debugElement.textContent =
                `Display error: ${error.message}`;
        }
    }


    if (
        lastNotificationStatus === null
    ) {

        lastNotificationStatus =
            latestStatus;

    } else if (
        latestStatus !==
        lastNotificationStatus
    ) {

        await showWaterAlert(
            latestStatus
        );

        lastNotificationStatus =
            latestStatus;
    }


    poolData.device =
        data.device_online === true
            ? "ONLINE"
            : "OFFLINE";


    if (data.temperature !== null) {

        poolData.temperature =
            Number(data.temperature);
    }


    if (
        data.fertilizer_available !==
        null
    ) {

        poolData.fertilizerFloat =
            data.fertilizer_available ===
                true ||
            data.fertilizer_available ===
                "true";

        console.log(
            "poolData fertilizerFloat:",
            poolData.fertilizerFloat
        );
    }


    if (data.wifi_signal !== null) {

        poolData.wifiSignal =
            Number(data.wifi_signal);
    }


    poolData.lastUpdate =
        new Date(
            data.created_at
        ).toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );


    updateDashboard();
}


// --------------------------------------------------
// REALTIME POOL STATUS
// --------------------------------------------------

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

            async (payload) => {

                const data =
                    payload.new;


                console.log(
                    "Realtime fertilizer value:",
                    data.fertilizer_available
                );


                if (
                    data.fertilizer_available !==
                    null
                ) {

                    poolData.fertilizerFloat =
                        data.fertilizer_available ===
                            true ||
                        data.fertilizer_available ===
                            "true";
                }


                applyPoolStatus(
                    data.status
                );


                const newStatus =
                    String(
                        data.status
                    ).toUpperCase();


                updateWaterLevel(
                    newStatus
                );


                if (
                    newStatus !==
                    lastNotificationStatus
                ) {

                    await showWaterAlert(
                        newStatus
                    );

                    lastNotificationStatus =
                        newStatus;
                }


                poolData.device =
                    data.device_online ===
                    true
                        ? "ONLINE"
                        : "OFFLINE";


                if (
                    data.temperature !== null
                ) {

                    poolData.temperature =
                        Number(
                            data.temperature
                        );
                }


                if (
                    data.wifi_signal !== null
                ) {

                    poolData.wifiSignal =
                        Number(
                            data.wifi_signal
                        );
                }


                poolData.lastUpdate =
                    new Date(
                        data.created_at
                    ).toLocaleTimeString(
                        [],
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    );


                updateDashboard();
            }
        )

        .subscribe(
            (status) => {

                console.log(
                    "Supabase realtime status:",
                    status
                );
            }
        );
}


// --------------------------------------------------
// INITIALIZATION
// --------------------------------------------------

async function initSupabase() {

    // קודם טוענים מצב שחייה
    await loadPoolControl();

    // אחר כך סטטוס בריכה
    await loadLatestPoolStatus();


    // Refresh רגיל
    setInterval(
        () => {

            loadLatestPoolStatus();
            loadPoolControl();

        },
        10000
    );


    try {

        subscribeToPoolStatus();
        subscribeToPoolControl();

    } catch (error) {

        console.error(
            "Realtime connection failed:",
            error
        );
    }
}
