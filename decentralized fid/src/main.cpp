#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPS++.h>
#include "secrets.h"

#define SS_PIN 5
#define RST_PIN 22
#define BUZZER_PIN 13
#define GREEN_LED_PIN 12
#define RED_LED_PIN 14

MFRC522 rfid(SS_PIN, RST_PIN);

// NEO-6M GPS using HardwareSerial 2
// RX2 = GPIO 16, TX2 = GPIO 17
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* backendUrl = BACKEND_URL;

void beep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
}

void flashGreen(int duration) {
  digitalWrite(GREEN_LED_PIN, HIGH);
  delay(duration);
  digitalWrite(GREEN_LED_PIN, LOW);
}

void flashRed(int duration) {
  digitalWrite(RED_LED_PIN, HIGH);
  delay(duration);
  digitalWrite(RED_LED_PIN, LOW);
}

String getUidHex(byte *uid, byte size) {
  String uidStr = "";
  for (byte i = 0; i < size; i++) {
    if (uid[i] < 0x10) uidStr += "0";
    uidStr += String(uid[i], HEX);
  }
  return uidStr;
}

void sendScanToBackend(String uidHex) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(backendUrl);
    http.addHeader("Content-Type", "application/json");

    String requestBody = "{\"uid\":\"" + uidHex + "\"";
    
    if (gps.location.isValid()) {
      requestBody += ", \"lat\": " + String(gps.location.lat(), 6);
      requestBody += ", \"lng\": " + String(gps.location.lng(), 6);
      Serial.println("Location attached: " + String(gps.location.lat(), 6) + ", " + String(gps.location.lng(), 6));
    } else {
      Serial.println("No valid GPS fix available yet. Sending UID only.");
    }
    
    requestBody += "}";
    
    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode == 200) {
      Serial.print("Broadcasted to frontend successfully! ");
      flashGreen(500);
      beep(150);
    } else {
      Serial.print("Error sending request to backend, HTTP Code: ");
      Serial.println(httpResponseCode);
      flashRed(500);
      beep(800);
    }
    http.end();
  } else {
    Serial.println("WiFi not connected. Cannot send UID.");
    flashRed(500);
    beep(800);
  }
}

void setup() {
  Serial.begin(115200);

  SPI.begin();
  rfid.PCD_Init();
  
  // Begin GPS Serial on UART2 (pins 16=RX, 17=TX), standard NEO-6M baud is 9600
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
  Serial.print("Local IP address: ");
  Serial.println(WiFi.localIP());
  Serial.println("\nWaiting for GPS lock... Place RFID card near the reader to scan.");
}

void loop() {
  // Constantly poll GPS data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Check for RFID cards
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  String uidHex = getUidHex(rfid.uid.uidByte, rfid.uid.size);
  Serial.println("Card Scanned: " + uidHex);
  
  sendScanToBackend(uidHex);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1000);
}
