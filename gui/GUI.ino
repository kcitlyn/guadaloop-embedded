#include <Wire.h>
#include <SparkFun_VL6180X.h>

// Ultrasonic Sensor Pins
const int trigPin = 9;
const int echoPin = 10;
// Ultrasonic Sensor Variables
long duration;
int ultrasonicDistance;

// Existing Code Variables
#define VL6180X_ADDRESS 0x29
VL6180x sensor(VL6180X_ADDRESS);
const int ledPin2 = 13;
const int ledPin = 10;
const int buttonPin = 2;
int ledState = LOW;
int buttonState = 0;
int count = 10;
int sendCount = 1;
char c;

void setup()
{
  // Initialize Serial Communication
  Serial.begin(9600);
  Wire.begin();
  delay(100);

  // Initialize Ultrasonic Sensor
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  // Existing Setup Code
  pinMode(ledPin, OUTPUT);
  pinMode(ledPin2, OUTPUT);
  pinMode(buttonPin, INPUT);

  if (sensor.VL6180xInit() != 0)
  {
    Serial.println("Failed to initialize. Freezing...");
    while (1)
      ; // Freeze if sensor init fails
  }
  sensor.VL6180xDefautSettings();
  delay(1000); // Delay for sensor to stabilize
}

void loop()
{
  // Measure Distance with Ultrasonic Sensor
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  duration = pulseIn(echoPin, HIGH);
  ultrasonicDistance = duration * 0.034 / 2;
  Serial.print("Ultrasonic Distance: ");
  Serial.println(ultrasonicDistance);

  // Existing Loop Code
  delay(100);
  read();
  send();
}

void updateCount()
{
  count++;
  if (count > 99)
  {
    count = 10;
  }
}

String createPacket(int identifier)
{
  int num = identifier;
  String s = ",";
  s += String(num);
  num -= 1;
  num *= 6;
  num += 1;

  for (int i = 0; i < 5; i++)
  {
    s += ",";
    s += String(num + i);
    s += String(count);
  }
  s += ",";
  s += String(num + 5);
  s += String((int)((sensor.getDistance() * 99) / 255.0));

  updateCount();
  return s;
}

void read()
{
  if (Serial.available())
  {
    c = Serial.read();
    if (c == '1')
    {
      ledState = HIGH;
      digitalWrite(ledPin2, ledState);
    }
    else if (c == '0')
    {
      ledState = LOW;
      digitalWrite(ledPin2, ledState);
    }
    digitalWrite(ledPin, ledState);
  }
}

void send()
{
  Serial.println(createPacket(sendCount));
  sendCount++;
  if (sendCount > 3)
  {
    sendCount = 1;
  }
}
