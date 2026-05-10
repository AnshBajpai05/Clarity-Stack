<!-- PAGE_0 -->
## **Software Requirements Specification (SRS)**

# **Dristi – AI-Based Assistance System for Visually Impaired People**

### **1. Introduction**

#### **1.1 Purpose**

The purpose of this Software Requirements Specification (SRS) document is to define the functional and non-functional requirements of the **Dristi Project**, an AI-powered assistance system designed to help visually impaired individuals navigate safely, communicate efficiently, and share live location information with caregivers.

This document is intended for developers, project guides, testers, researchers, and future contributors involved in the development and maintenance of the system.

#### **1.2 Scope**

Dristi is an intelligent assistive platform that combines Artificial Intelligence, Computer Vision, IoT, GPS tracking, and voice-based interaction to support visually impaired users.

The system provides:

- Real-time obstacle detection •
- Voice guidance and audio feedback •
- Location sharing through Telegram bot integration •
- Emergency alert support •
- Caregiver monitoring support •
- Navigation assistance •
- Object recognition capabilities •
- Raspberry Pi based deployment for portability •

The project aims to increase independence, mobility, and safety for visually impaired individuals.

#### **1.3 Definitions, Acronyms, and Abbreviations**

| Term | Description               |
| AI   | Artificial Intelligence   |
| CV   | Computer Vision           |
| GPS  | Global Positioning System |
| IoT  | Internet of Things        |

<!-- PAGE_1 -->
| Term         | Description                               |
| SRS          | Software Requirements Specification       |
| API          | Application Programming Interface         |
| Raspberry Pi | Single-board computer used for deployment |
| TTS          | Text-to-Speech                            |
| STT          | Speech-to-Text                            |
| YOLO         | You Only Look Once object detection model |

## **1.4 References**

- IEEE SRS Documentation Standards •
- Raspberry Pi Documentation •
- OpenCV Documentation •
- Telegram Bot API Documentation •
- Python Official Documentation •
- YOLO Object Detection Research Papers •

## **2. Overall Description**

## **2.1 Product Perspective**

Dristi is a standalone assistive system developed using embedded hardware and AI software modules. The system captures visual input through a camera connected to the Raspberry Pi, processes the information using Computer Vision models, and provides voice-based responses to the user.

The caregiver support system is integrated through Telegram APIs to provide real-time location tracking and emergency notifications.

## **2.2 Product Functions**

The major functions of the Dristi system include:

- Obstacle detection 1.
- Object recognition 2.
- Audio feedback generation 3.
- GPS-based live location sharing 4.
- Emergency SOS alert system 5.
- Telegram caregiver integration 6.
- Voice command support 7.
- Real-time environment analysis 8.
- Navigation assistance 9.
- User authentication and system monitoring 10.

<!-- PAGE_2 -->
# **2.3 User Classes and Characteristics**

| User Type              | Characteristics                                  |
| Visually Impaired User | Primary user requiring navigation and assistance |
| Caregiver              | Receives alerts and location updates             |
| Administrator          | Maintains system configurations                  |
| Developer              | Updates and improves AI modules                  |

## **2.4 Operating Environment**

#### **Hardware Requirements**

- Raspberry Pi 4 •
- Camera Module / USB Camera •
- GPS Module •
- Speaker / Earphones •
- Internet Connectivity •
- Power Supply / Battery •

#### **Software Requirements**

- Python 3.x •
- OpenCV •
- TensorFlow / PyTorch •
- Telegram Bot API •
- Flask / FastAPI (optional backend) •
- Linux (Ubuntu/Raspberry Pi OS) •

### **2.5 Design and Implementation Constraints**

- Limited Raspberry Pi computational power •
- Dependence on internet for Telegram communication •
- Real-time processing constraints •
- Battery limitations for portable usage •
- Environmental lighting variations affecting detection accuracy •

#### **2.6 Assumptions and Dependencies**

- Stable internet connection is available. •
- GPS services are enabled. •
- Camera hardware is functioning properly. •
- AI models are pre-trained and optimized. •
- Telegram services are accessible. •

<!-- PAGE_3 -->
# **3. System Features and Functional Requirements**

# **3.1 Obstacle Detection Module**

## **Description**

The system detects obstacles in front of the user using camera input and Computer Vision algorithms.

## **Functional Requirements**

- The system shall continuously capture frames from the camera. •
- The system shall identify nearby obstacles. •
- The system shall estimate obstacle distance. •
- The system shall generate audio warnings. •
- The system shall operate in real time. •

# **3.2 Object Recognition Module**

# **Description**

The module identifies common objects in the environment.

### **Functional Requirements**

- The system shall recognize objects using AI models. •
- The system shall announce object names through audio. •
- The system shall support multiple object classes. •
- The system shall update recognition results dynamically. •

# **3.3 Voice Assistance Module**

#### **Description**

Provides audio interaction between the system and the user.

## **Functional Requirements**

- The system shall convert text to speech. •
- The system shall support voice-based commands. •
- The system shall provide navigation instructions. •
- The system shall notify users about detected objects. •

<!-- PAGE_4 -->
### **3.4 GPS Tracking and Location Sharing**

#### **Description**

Allows live location tracking and sharing with caregivers.

#### **Functional Requirements**

- The system shall obtain GPS coordinates. •
- The system shall send location updates periodically. •
- The system shall integrate with Telegram bot APIs. •
- The caregiver shall receive real-time location information. •

## **3.5 Emergency SOS Module**

#### **Description**

Enables emergency communication during unsafe situations.

#### **Functional Requirements**

- The system shall trigger SOS alerts. •
- The system shall send emergency messages to caregivers. •
- The system shall include live location in alerts. •
- The system shall support manual and automatic emergency triggering. •

## **3.6 Caregiver Monitoring System**

#### **Description**

Provides monitoring capabilities for caregivers.

## **Functional Requirements**

- Caregivers shall receive notifications. •
- Caregivers shall track user location. •
- Caregivers shall receive emergency alerts. •
- Caregivers shall communicate through Telegram integration. •

# **4. External Interface Requirements**

#### **4.1 User Interface**

The system provides:

- Voice-based interaction •
- Telegram-based caregiver interface •

<!-- PAGE_5 -->
Command-line monitoring interface for administrators •

### **4.2 Hardware Interfaces**

| Hardware     | Purpose              |
| Camera       | Image capture        |
| GPS Module   | Location tracking    |
| Speaker      | Audio feedback       |
| Raspberry Pi | Main processing unit |

## **4.3 Software Interfaces**

| Software           | Purpose                  |
| OpenCV             | Image processing         |
| TensorFlow/PyTorch | AI model execution       |
| Telegram API       | Communication and alerts |
| Python Libraries   | Backend processing       |

## **4.4 Communication Interfaces**

- Wi-Fi •
- Internet APIs •
- Telegram cloud communication •
- GPS satellite communication •

# **5. Non-Functional Requirements**

### **5.1 Performance Requirements**

- Response time should be less than 2 seconds. •
- Obstacle detection should operate in real time. •
- GPS updates should occur periodically. •
- System should support continuous execution. •

### **5.2 Reliability Requirements**

- System should maintain stable performance. •
- Emergency alerts should be highly reliable. •
- Failure recovery mechanisms should be included. •

<!-- PAGE_6 -->
#### **5.3 Security Requirements**

- User location data should be protected. •
- Authentication should be implemented for caregivers. •
- API keys and tokens should be secured. •

## **5.4 Usability Requirements**

- Interface should be simple and voice friendly. •
- Audio feedback should be clear and understandable. •
- Navigation instructions should be concise. •

## **5.5 Maintainability Requirements**

- Modular architecture should be used. •
- AI models should support future updates. •
- Code should follow proper documentation standards. •

## **5.6 Scalability Requirements**

- Additional sensors can be integrated in the future. •
- Cloud support can be added later. •
- Multi-user caregiver support should be possible. •

# **6. System Architecture**

#### **6.1 High-Level Architecture**

The Dristi system consists of:

- Input Layer 1.
- Camera 2.
- GPS 3.
- Voice Input 4.
- Processing Layer 5.
- Raspberry Pi 6.
- AI Models 7.
- Computer Vision Engine 8.

<!-- PAGE_7 -->
- Communication Layer 9.
- Telegram Bot API 10.
- Internet Services 11.
- Output Layer 12.
- Audio Feedback 13.
- Caregiver Notifications 14.

## **7. Use Case Descriptions**

## **Use Case 1: Obstacle Detection**

| Item      | Description                                                           |  |
| Actor     | Visually Impaired User                                                |  |
| Trigger   | User starts navigation                                                |  |
| Main Flow | Camera captures image  THEN  AI detects obstacle  THEN  Audio warning generated |  |
| Output    | User receives spoken alert                                            |  |

## **Use Case 2: Emergency SOS**

| Item      | Description                               |
| Actor     | User                                      |
| Trigger   | Emergency button pressed                  |
| Main Flow | System obtains GPS  THEN  Sends Telegram alert |
| Output    | Caregiver receives SOS notification       |

## **Use Case 3: Live Location Sharing**

| Item      | Description                                  |
| Actor     | Caregiver                                    |
| Trigger   | Location request                             |
| Main Flow | GPS fetched  THEN  Telegram bot sends coordinates |
| Output    | Live location displayed                      |

<!-- PAGE_8 -->
### **8. Database Requirements**

The system may store:

- User information •
- Emergency contacts •
- GPS history •
- Activity logs •
- System events •

### Possible databases:

- SQLite •
- Firebase •
- MongoDB •

## **9. Future Enhancements**

Potential future improvements include:

- Smart glasses integration •
- Cloud-based analytics •
- Indoor navigation support •
- Face recognition •
- Multi-language voice assistance •
- Advanced deep learning models •
- Mobile application integration •
- Health monitoring sensors •

# **10. Testing Requirements**

### **10.1 Unit Testing**

- Camera module testing •
- GPS module testing •
- Telegram bot testing •
- Audio system testing •

### **10.2 Integration Testing**

- AI model integration •
- Raspberry Pi integration •
- End-to-end communication testing •

### **10.3 Performance Testing**

Real-time detection latency •

<!-- PAGE_9 -->
- GPS response timing •
- CPU and memory utilization •

## **10.4 User Acceptance Testing**

- Navigation accuracy •
- Voice response clarity •
- Caregiver communication effectiveness •

## **11. Conclusion**

Dristi is an AI-enabled assistive system aimed at improving the independence, mobility, and safety of visually impaired individuals. By integrating Computer Vision, IoT, GPS tracking, and voice interaction technologies, the system provides real-time assistance and caregiver connectivity.

The project has strong potential for future scalability, research contribution, and real-world social impact.