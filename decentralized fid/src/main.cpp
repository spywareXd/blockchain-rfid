#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 5
#define RST_PIN 22

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  
  SPI.begin();         // Start SPI bus
  rfid.PCD_Init();       // Initialize RFID module
  rfid.PCD_DumpVersionToSerial();
  Serial.println("Place RFID card near the reader...");
}

void loop() {

  // Check if a new card is present
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  // Read the card
  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  Serial.print("Card UID: ");

  for (byte i = 0; i < rfid.uid.size; i++) {
    Serial.print(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
    Serial.print(rfid.uid.uidByte[i], HEX);
    Serial.print(" ");
  }

  Serial.println();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(1000);
}