# pool-guardian
Smart pool monitoring system

## Statistics v1

The PWA includes water-temperature statistics and water-level transitions for
24-hour, 7-day, and 30-day ranges. Apply the Supabase migration before
deploying the updated `app` directory:

```sh
supabase link --project-ref ebmqcflmmbwnkuvdlzfp
supabase db push
```

The migration reads the existing `pool_status` history. It does not change the
ESP32 payload, Push notifications, Swimming Mode, or device-offline monitoring.
