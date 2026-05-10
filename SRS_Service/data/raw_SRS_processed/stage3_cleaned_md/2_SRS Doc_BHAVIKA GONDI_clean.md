<!-- PAGE_0 -->
## Software Requirements Specification

for

## HealthSync – Your AI-Powered Personal Health Companion

Version 1.0 approved

## Prepared by

Bhavika Gondi – AM.EN.U4AIE22013 D.V.S.S Swapnith - AM.EN.U4AIE22016

Group Number: 11

Amrita Vishwa Vidyapeetham

Date: May 14, 2025

<!-- PAGE_1 -->
## Table of Contents

- 1. Introduction
  - 1.1 Purpose
  - 1.2 Document Conventions
  - 1.3 Intended Audience and Reading Suggestions
  - 1.4 Project Scope
  - 1.5 References
- 2. Overall Description
  - 2.1 Product Perspective
  - 2.2 Product Features
  - 2.3 User Classes and Characteristics
  - 2.4 Operating Environment
  - 2.5 Design and Implementation Constraints
  - 2.6 User Documentation
  - 2.7 Assumptions and Dependencies
- 3. System Features
  - 3.1 Medical Report Analysis
  - 3.2 Smart Medicine Reminders
  - 3.3 Personalized Diet Recommendations
  - 3.4 Health Progress Tracking
  - 3.5 Chatbot for General Conversations
- 4. External Interface Requirements
  - 4.1 User Interfaces
  - 4.2 Hardware Interfaces
  - 4.3 Software Interfaces
  - 4.4 Communications Interfaces
- 5. Other Nonfunctional Requirements
  - 5.1 Performance Requirements
  - 5.2 Safety Requirements
  - 5.3 Security Requirements
  - 5.4 Software Quality Attributes
- 6. Other Requirements

Appendix A: Glossary

Appendix B: Analysis Models Appendix C: Issues List

| Revision History                   |              |                                        |         |
| Name                               | Date         | Reason for Changes                     | Version |
| Bhavika Gondi, D.V.S.SSwapnith | May 14, 2025 | Initial draft of SRS forHealthSync | 1.0     |

<!-- PAGE_2 -->
# 1. Introduction

### 1.1 Purpose

HealthSync is an AI-powered mobile application designed to empower users to proactively manage their health by simplifying medical report analysis, providing smart medication reminders, offering personalized diet recommendations, tracking health progress, and facilitating general health-related conversations through a chatbot. The application addresses the challenges faced by individuals in understanding complex medical reports, adhering to medication schedules, and maintaining a healthy lifestyle tailored to their specific health conditions. This Software Requirements Specification (SRS) outlines the functional and nonfunctional requirements for HealthSync, serving as a blueprint for developers, testers, and stakeholders to ensure the successful development and deployment of the application.

## 1.2 Document Conventions

To ensure clarity and consistency, this SRS adheres to the following conventions:

- 1. Prioritization Hierarchy: Requirements are prioritized as High, Medium, or Low, with higher-level requirements indicating priority for associated detailed requirements.
- 2. Formatting for Emphasis: Bold is used for key terms and code for technical references.
- 3. Section Headings and Numbering: A hierarchical structure with numbered sections facilitates navigation.
- 4. Consistent Font and Typeface: A uniform font (e.g., Times New Roman) ensures readability and professionalism.

#### 1.3 Intended Audience and Reading Suggestions

The intended audience for this SRS includes:

- 1. Developers: Focus on Sections 3 (System Features) and 4 (External Interface Requirements) for technical implementation details.
- 2. Project Managers: Review Sections 1 (Introduction) and 2 (Overall Description) for project scope and objectives.
- 3. Testers: Refer to Section 5 (Other Nonfunctional Requirements) for performance and quality metrics.
- 4. Marketing Staff: Read Section 2.2 (Product Features) to understand key selling points.
- 5. Users: Skim Section 2.2 (Product Features) for an overview of the application's capabilities.
- 6. Documentation Writers: Use the entire document to create user guides and technical manuals.

#### 1.4 Project Scope

HealthSync is a user-friendly, AI-powered mobile application designed to simplify health management for individuals, particularly those with chronic illnesses, vitamin deficiencies, or a desire for a healthier lifestyle. It enables users to upload and analyse medical reports (PDFs) to extract and simplify health metrics, receive timely medication reminders via push notifications, obtain personalized diet recommendations based on health conditions using a machine learning model trained on the done\_food\_data.csv dataset, track health progress over time through visualizations, and engage in general health-related conversations via an AI-powered chatbot. The application enhances

<!-- PAGE_3 -->
#### Software Requirements Specification for HealthSync

accessibility, improves medication adherence, and promotes proactive health management, empowering users to take control of their well-being. Designed as a standalone application, HealthSync can integrate with cloud storage and health-related APIs for enhanced functionality.

## 1.5 References

Flutter(Dart)

pytesseract

Node.js

Figma

done\_food\_data.csv (dataset for diet recommendations)

# 2. Overall Description

# 2.1 Product Perspective

HealthSync is a novel, standalone mobile application developed to address the growing need for personalized health management. It is not a replacement for existing health apps but a pioneering solution that leverages AI, NLP, and cloud-based processing to provide a comprehensive health companion. HealthSync can integrate with external systems, such as cloud storage for report backups or health APIs for enhanced data analysis, making it versatile and adaptable to various user workflows.

### Context and Origin:

HealthSync was conceived to address the challenges of interpreting medical reports, adhering to medication schedules, and maintaining a healthy diet in today's fast-paced world. It combines AIdriven insights with an intuitive interface to empower users.

# System Overview Diagram:



<!-- PAGE_4 -->
# 2.2 Product Features

HealthSync offers the following key features:

- 1. Medical Report Analysis: Extracts and simplifies health metrics from uploaded PDF reports, classifying parameters (e.g., blood sugar, cholesterol) as low, normal, or high.
- 2. Smart Medicine Reminders: Sends push notifications to ensure users adhere to medication schedules.
- 3. Personalized Diet Recommendations: Suggests tailored diets based on users' health conditions or deficiencies, such as diabetes or low iron, to support healthier eating habits.
- 4. Health Progress Tracking: Visualizes trends in health parameters over time for informed decision-making.
- 5. Chatbot for General Conversations: Provides an AI-powered chatbot for health-related queries and general conversations.
- 6. Push Notifications: Offers an intuitive and responsive design, ensuring easy navigation and seamless interaction across devices.

# 2.3 User Classes and Characteristics

## 1. Regular Users:

- Characteristics: Individuals who use HealthSync sporadically for general health management tasks, such as uploading medical reports or setting medication reminders. These users typically have minimal health monitoring needs and seek simple, straightforward tools.
- Requirements: Intuitive interface, basic features, and ease of use.

#### 2. Power Users:

- Characteristics: Individuals with chronic health conditions (e.g., diabetes, hypertension) or those who actively monitor their health regularly. They rely on HealthSync for consistent tracking, personalized recommendations, and in-depth health insights.
- Requirements: Advanced analytics, customizable reminders, and detailed diet plans.

### 3. Healthcare Professionals:

- Characteristics: Doctors, nutritionists, or other medical practitioners who use HealthSync to review patient health data, track progress, or provide guidance based on the app's insights.
- Requirements: Data export options, integration with health systems, and detailed reports.

## 4. Administrators:

- Characteristics: Technical personnel responsible for overseeing HealthSync's operations, including managing user accounts, ensuring system performance, and maintaining security protocols.
- Requirements: User management, access controls, and security features.

Favored User Classes: Regular Users and Power Users are the primary focus, representing the majority of the user base.

<!-- PAGE_5 -->
### 2.4 Operating Environment

HealthSync is a cross-platform mobile application accessible on Android and iOS devices via Flutter. It operates on standard smartphones and tablets, requiring a stable internet connection for backend communication and push notifications. The app integrates with Firebase Cloud Messaging for notifications and MySQL for data storage. It is compatible with common security software and adheres to mobile app standards for performance and accessibility.

# 2.5 Design and Implementation Constraints

- 1. Technology Stack: Flutter (Dart) for frontend, Node.js for backend, MySQL for database, TensorFlow.js/brain.js for AI, and pdf-parse for PDF processing.
- 2. Dataset: The diet recommendation system relies on the done\_food\_data.csv file for training the machine learning model.
- 3. Cross-Platform Compatibility: The app must function seamlessly on both Android and iOS.
- 4. Regulatory Compliance: Must adhere to data protection regulations (e.g., GDPR, HIPAA).

## 2.6 User Documentation

HealthSync is designed for ease of use, requiring minimal user intervention. Users upload medical reports, set medication schedules, and receive recommendations via an intuitive interface. A user guide and in-app tooltips will assist users, with detailed technical documentation provided for developers and administrators.

## 2.7 Assumptions and Dependencies

HealthSync's development is based on a few key assumptions and dependencies. We assume users have stable internet access to use features like report uploads and notifications, and that they know basic smartphone operations to navigate the app easily. The app depends on third-party APIs, such as Firebase for notifications and spaCy for language processing, to work properly. It also relies on ongoing support for Flutter, Node.js, and MySQL to ensure smooth performance. Additionally, HealthSync must comply with changing data protection laws, like GDPR and HIPAA, to protect user privacy. Monitoring these factors is crucial to avoid disruptions to the app's functionality or timeline.

# 3. System Features

### 3.1 Medical Report Analysis

## 3.1.1 Description and Priority

- Description: Enables users to upload PDF medical reports, extract key health metrics, and simplify them into non-medical language, classifying parameters as low, normal, or high.
- Priority: High

#### 3.1.2 Stimulus/Response Sequences

- Stimulus: User uploads a PDF medical report.
- Response: HealthSync processes the PDF, extracts metrics, simplifies them, and displays the results with classifications.

<!-- PAGE_6 -->
#### 3.1.3 Functional Requirements

- REQ-1: The system must support PDF file uploads via a user-friendly interface.
- REQ-2: The system must use NLP to extract and simplify health metrics.
- REQ-3: Parameters (e.g., blood sugar, cholesterol) must be classified as low, normal, or high based on standard medical thresholds.
- REQ-4: The system must provide real-time feedback on processing progress.

# 3.2 Smart Medicine Reminders

## 3.2.1 Description and Priority

- Description: Allows users to set medication schedules and receive push notifications to ensure adherence.
- Priority: High.

# 3.2.2 Stimulus/Response Sequences

- Stimulus: User sets a medication schedule.
- Response: HealthSync sends push notifications via Firebase Cloud Messaging at the scheduled times.

## 3.2.3 Functional Requirements

- REQ-1: The system must allow users to input medication names, dosages, and schedules.
- REQ-2: Push notifications must be delivered within 5 seconds of the scheduled time.
- REQ-3: The system must store schedules locally using Hive/Shared Preferences for offline access.
- REQ-4: Users must receive confirmation of successful schedule creation.

# 3.3 Personalized Diet Recommendations

### 3.3.1 Description and Priority

- Description: Generates tailored diet plans based on health conditions or deficiencies using a machine learning model trained on done\_food\_data.csv.
- Priority: High.

#### 3.3.2 Stimulus/Response Sequences

- Stimulus: User's health metrics (e.g., low iron, diabetes) are analysed.
- Response: HealthSync generates and displays a personalized diet plan.

#### 3.3.3 Functional Requirements

- REQ-1: The system must use python to train a model on done\_food\_data.csv.
- REQ-2: Diet plans must be generated based on health conditions or deficiencies.
- REQ-3: The system must provide a preview of the diet plan for user verification.

<!-- PAGE_7 -->
#### 3.4 Health Progress Tracking

## 3.4.1 Description and Priority

- Description: Visualizes trends in health parameters over time to help users monitor their progress.
- Priority: Medium.

# 3.4.2 Stimulus/Response Sequences

- Stimulus: User requests health progress data.
- Response: HealthSync displays graphs or charts of health metrics over time.

# 3.4.3 Functional Requirements

- REQ-1: The system must store historical health metrics in MySQL.
- REQ-2: The system must generate visualizations (e.g., line graphs) using Flutter widgets..

# 3.5 Chatbot for General Conversations

## 3.5.1 Description and Priority

- Description: Provides an AI-powered chatbot for health-related queries and general conversations.
- Priority: Medium.

# 3.5.2 Stimulus/Response Sequences

- Stimulus: User inputs a health-related or general query.
- Response: The chatbot processes the query using NLP and provides a relevant response.

## 3.5.3 Functional Requirements

- REQ-1: The system must use NLP libraries for query processing.
- REQ-2: The chatbot must support basic health-related questions and general conversations.
- REQ-3: The system must log conversations for user reference.

# 4. External Interface Requirements

## 4.1 User Interfaces

HealthSync incorporates several user interfaces designed to enhance user experience and functionality, all adhering to Flutter's UI standards for responsiveness, clear error messages, and intuitive navigation. The Medical Report Interface allows users to upload and view simplified health reports, while the Medication Reminder Interface enables setting and managing medication schedules. The Diet Recommendation Interface provides a platform for viewing and customizing personalized diet plans, and the Health Progress Interface visualizes health trends over time. Additionally, the Chatbot Interface facilitates interaction with an AI-powered chatbot for health-related queries. Detailed designs for these interfaces are documented in a separate UI Specification created using Figma, ensuring a cohesive and user-friendly experience across the application.

<!-- PAGE_8 -->
### 4.2 Hardware Interfaces

HealthSync operates on standard smartphones and tablets (Android and iOS) with internet connectivity. It uses HTTP/HTTPS for backend communication and Firebase Cloud Messaging for push notifications. The app requires a minimum of 2GB RAM and 100MB storage for optimal performance.

## 4.3 Software Interfaces

HealthSync is designed to operate seamlessly across Android (version 8.0 and above) and iOS (version 12.0 and above), ensuring broad accessibility on mobile devices. It utilizes Node.js REST APIs to power its backend functionality, enabling efficient processing and communication. User data and health metrics are securely stored in a MySQL database. The application integrates third-party API Firebase Cloud Messaging (FCM) for delivering notifications. For communication, HealthSync employs HTTP/HTTPS protocols for secure data exchange and WebSocket's to support real-time updates, ensuring a responsive and dynamic user experience.

### 4.4 Communications Interfaces

HealthSync employs a robust set of communication protocols to ensure secure and efficient data exchange. It uses HTTP/HTTPS for secure communication between the app and its backend, safeguarding user data during transfers. WebSocket's enable real-time updates, such as instant chatbot responses, enhancing user interaction. Firebase Cloud Messaging (FCM) powers push notifications, delivering timely alerts for medication reminders and health updates. For email notifications, such as health report summaries, the app utilizes SMTP. All data transmissions are protected with TLS/SSL encryption, ensuring a high level of security and privacy for users across all interactions with the application.

# 5. Other Nonfunctional Requirements

### 5.1 Performance Requirements

- 1. Report Processing: The system must process PDF medical reports, up to 10MB in size, within 60 to 120 seconds to deliver timely analysis of health metrics.
- 2. Notification Delivery: Push notifications for medication reminders and health updates must be delivered within 5 seconds of the scheduled time.
- 3. Diet Recommendation: Personalized diet plans must be generated within 30 seconds, ensuring prompt delivery of tailored recommendations.
- 4. Concurrency: The system must support a minimum of 50 simultaneous users, maintaining performance stability under concurrent access.
- 5. UI Responsiveness: User interface interactions must respond within a maximum of 10 seconds, providing a seamless and responsive experience across all devices.

#### 5.2 Safety Requirements

HealthSync prioritizes user data safety by adhering to GDPR and HIPAA regulations. Secure encryption (TLS/SSL) protects data during transmission and storage. The app includes error-handling mechanisms to prevent crashes and data loss. Regular backups ensure data recovery in case of failures.

<!-- PAGE_9 -->
## 5.3 Security Requirements

- 1. Data Encryption: All data transmissions, including user inputs, medical reports, and notifications, must be encrypted using industry-standard TLS/SSL protocols to safeguard sensitive information during transfer and storage.
- 2. Authentication: Users must authenticate through secure mechanisms, such as username/password combinations or multi-factor authentication, to verify identity and prevent unauthorized access to the application.
- 3. Access Control: Role-based access control must be enforced to restrict system functionalities and data access based on user roles, ensuring that only authorized individuals can perform specific actions or view sensitive information.

## 5.4 Software Quality Attributes

- 1. Usability: The system must achieve a System Usability Scale (SUS) score of at least 80, ensuring an intuitive and user-friendly interface that meets user expectations for ease of use.
- 2. Reliability: The application must maintain a minimum uptime of 99%, minimizing service disruptions and ensuring consistent availability for users.
- 3. Maintainability: The average time to resolve bugs must not exceed 48 hours, facilitating prompt issue resolution and maintaining system integrity.
- 4. Interoperability: The system must be fully compatible with Android (v8.0+), iOS (v12.0+), and major cloud services, ensuring seamless integration across diverse platforms and ecosystems.
- 5. Scalability: The application must support up to 100 concurrent active users with minimal performance degradation, ensuring robust performance under increased demand.

## 6. Other Requirements

HealthSync must support offline functionality, allowing users to access medication reminders and local data without an internet connection, ensuring uninterrupted health management. Additionally, the app should provide multi-language support, starting with English and with plans to expand to other languages in the future, to enhance accessibility for a diverse user base.

## Appendix A: Glossary

- HealthSync: A mobile application designed for personalized health management, enabling users to monitor and optimize their well-being.
- SRS: Software Requirements Specification, a comprehensive document detailing the functional and nonfunctional requirements for HealthSync.
- NLP: Natural Language Processing, utilized for advanced analysis of medical reports and powering the chatbot's conversational capabilities.
- FCM: Firebase Cloud Messaging, a service used to deliver timely push notifications to users.

<!-- PAGE_10 -->
## Software Requirements Specification for HealthSync

- GDPR: General Data Protection Regulation, a framework ensuring robust data privacy and user protection.
- HIPAA: Health Insurance Portability and Accountability Act, a standard for securing sensitive health data.

## Appendix B: Analysis Models

## Appendix C: Issues List

- Open Issues: Potential obstacles include challenges in seamlessly integrating third-party APIs (e.g., Firebase) and ensuring scalability of the machine learning model for diet recommendations to handle increased user demand effectively.
- Resolved Issues: None at this stage, as this is the initial draft of the Software Requirements Specification.
- Future Enhancements: Planned improvements include integration with wearable devices for real-time health monitoring, support for additional languages to enhance global accessibility, and the incorporation of advanced analytics to provide deeper insights into user health trends.