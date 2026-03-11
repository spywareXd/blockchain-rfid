#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN 5
#define RST_PIN 22
#define BUZZER_PIN 13
#define MAX_AUTH_CARDS 20

MFRC522 rfid(SS_PIN, RST_PIN);

// Admin UID
byte adminUID[4] = {0x17, 0x63, 0x0D, 0x06};

bool enrollMode = false;

struct CardRecord {
  byte uid[10];
  byte size;
  bool used;
};

CardRecord authorizedCards[MAX_AUTH_CARDS];

void beep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
}

bool uidMatches(byte *uid1, byte *uid2, byte size) {
  for (byte i = 0; i < size; i++) {
    if (uid1[i] != uid2[i]) {
      return false;
    }
  }
  return true;
}

void copyUID(byte *source, byte *destination, byte size) {
  for (byte i = 0; i < size; i++) {
    destination[i] = source[i];
  }
}

void printUID(byte *uid, byte size) {
  for (byte i = 0; i < size; i++) {
    if (uid[i] < 0x10) Serial.print("0");
    Serial.print(uid[i], HEX);
    Serial.print(" ");
  }
}

bool isAdminCard(byte *uid, byte size) {
  if (size != 4) return false;
  return uidMatches(uid, adminUID, 4);
}

bool isAuthorized(byte *uid, byte size) {
  for (int i = 0; i < MAX_AUTH_CARDS; i++) {
    if (authorizedCards[i].used &&
        authorizedCards[i].size == size &&
        uidMatches(uid, authorizedCards[i].uid, size)) {
      return true;
    }
  }
  return false;
}

bool addAuthorizedCard(byte *uid, byte size) {
  // Already exists
  if (isAuthorized(uid, size)) {
    return false;
  }

  // Find empty slot
  for (int i = 0; i < MAX_AUTH_CARDS; i++) {
    if (!authorizedCards[i].used) {
      copyUID(uid, authorizedCards[i].uid, size);
      authorizedCards[i].size = size;
      authorizedCards[i].used = true;
      return true;
    }
  }

  // No free slot
  return false;
}

int getAuthorizedCount() {
  int count = 0;
  for (int i = 0; i < MAX_AUTH_CARDS; i++) {
    if (authorizedCards[i].used) count++;
  }
  return count;
}

void printAuthorizedCards() {
  Serial.println("Authorized cards list:");
  for (int i = 0; i < MAX_AUTH_CARDS; i++) {
    if (authorizedCards[i].used) {
      Serial.print("#");
      Serial.print(i);
      Serial.print(": ");
      printUID(authorizedCards[i].uid, authorizedCards[i].size);
      Serial.println();
    }
  }
}

void setup() {
  Serial.begin(115200);

  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_DumpVersionToSerial();

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize storage
  for (int i = 0; i < MAX_AUTH_CARDS; i++) {
    authorizedCards[i].used = false;
    authorizedCards[i].size = 0;
  }

  Serial.println("Place RFID card near the reader...");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent()) {
    return;
  }

  if (!rfid.PICC_ReadCardSerial()) {
    return;
  }

  Serial.print("Card UID: ");
  printUID(rfid.uid.uidByte, rfid.uid.size);
  Serial.println();

  // Admin card scanned
  if (isAdminCard(rfid.uid.uidByte, rfid.uid.size)) {
    enrollMode = true;
    Serial.println("Admin card detected. Scan next card to authorize.");
    beep(300);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(1000);
    return;
  }

  // Enroll next scanned card
  if (enrollMode) {
    enrollMode = false;

    if (addAuthorizedCard(rfid.uid.uidByte, rfid.uid.size)) {
      Serial.println("Card added successfully.");
      Serial.print("Total authorized cards: ");
      Serial.println(getAuthorizedCount());
      printAuthorizedCards();
      beep(500);
    } else {
      if (isAuthorized(rfid.uid.uidByte, rfid.uid.size)) {
        Serial.println("Card is already authorized.");
      } else {
        Serial.println("Authorization list is full.");
      }
      beep(800);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(1000);
    return;
  }

  // Normal access check
  if (isAuthorized(rfid.uid.uidByte, rfid.uid.size)) {
    Serial.println("Access permitted");
    beep(150);
  } else {
    Serial.println("Access denied");
    beep(600);
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1000);
}