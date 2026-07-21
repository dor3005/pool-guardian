const VAPID_PUBLIC_KEY =
    "BLdKZsgyp28OPM2XgAbt1kWuz_Q0mxyllwqmvWfI87TDu5Vhhp5kC0GeAAmOU9BtizBlG_5KBkyiwAI_V64qex8";

function urlBase64ToUint8Array(base64String) {
    const padding =
        "=".repeat((4 - base64String.length % 4) % 4);

    const base64 =
        (base64String + padding)
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    const rawData = window.atob(base64);

    return Uint8Array.from(
        [...rawData].map(
            (character) =>
                character.charCodeAt(0)
        )
    );
}

async function enablePushNotifications() {
    if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {
        throw new Error(
            "Push notifications are not supported"
        );
    }

    const permission =
        await Notification.requestPermission();

    if (permission !== "granted") {
        throw new Error(
            "Notification permission was not granted"
        );
    }

    const registration =
        await navigator.serviceWorker.ready;

    let subscription =
        await registration.pushManager
            .getSubscription();

    if (!subscription) {
        subscription =
            await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey:
                    urlBase64ToUint8Array(
                        VAPID_PUBLIC_KEY
                    )
            });
    }

    const { data, error } =
        await supabaseClient.functions.invoke(
            "register-push",
            {
                body: {
                    subscription:
                        subscription.toJSON()
                }
            }
        );

    if (error) {
        console.error(
            "Push registration failed:",
            error
        );

        throw new Error(
            "Could not save push subscription"
        );
    }

    console.log(
        "Push subscription saved:",
        data
    );

    return subscription;
}