# Pool Guardian ESP32 Firmware

## Setup

1. Copy `secrets.example.h` to `secrets.h`.
2. Replace the placeholder values in `secrets.h`.
3. Keep `secrets.h` private. It is excluded by `.gitignore`.
4. Open `pool_guardian_secure.ino` in Arduino IDE.
5. Select the correct ESP32 board and port.
6. Compile and upload.

## Required libraries

- WiFi
- HTTPClient
- WiFiClientSecure
- OneWire
- DallasTemperature

## Pins

- Lower pool float: GPIO 27
- Upper pool float: GPIO 26
- Temperature sensor: GPIO 25
- Fertilizer float: GPIO 33