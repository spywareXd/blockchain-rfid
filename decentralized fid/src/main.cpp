#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define SS_PIN 5
#define RST_PIN 22
#define BUZZER_PIN 13
#define GREEN_LED_PIN 12
#define RED_LED_PIN 14

MFRC522 rfid(SS_PIN, RST_PIN);

// --- UPDATE THESE CONSTANTS BEFORE UPLOADING ---
const char* ssid = "Colle$ttye";
const char* password = "bluntonomics";
// Adjust backend IP to point to the computer running the Node server.
const char* backendUrl = "http://10.208.251.182:3000/scan"; 

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

    // Manually constructing json payload
    String requestBody = "{\"uid\":\"" + uidHex + "\"}";
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
  Serial.println("\nPlace RFID card near the reader to relay it to the Browser UI...");
}

void loop() {
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