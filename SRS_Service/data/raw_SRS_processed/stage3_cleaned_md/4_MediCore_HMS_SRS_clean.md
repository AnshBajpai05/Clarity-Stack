<!-- PAGE_0 -->
## **Software Requirements Specification**

## **MediCore Hospital Management System**

Document Version: 1.4

Prepared by: Enterprise Healthcare Solutions Team

Status: Final Draft for Review

October 12, 2024

<!-- PAGE_1 -->
## **Table of Contents**

- 1. Introduction
  - 1.1 Purpose
  - 1.2 Document Conventions
  - 1.3 Intended Audience and Reading Suggestions
  - 1.4 Product Scope
  - 1.5 References
- 2. Overall Description
  - 2.1 Product Perspective
  - 2.2 Product Functions
  - 2.3 User Classes and Characteristics
  - 2.4 Operating Environment
  - 2.5 Design and Implementation Constraints
  - 2.6 Assumptions and Dependencies
- 3. System Features
  - 3.1 Patient Registration and Management
  - 3.2 Appointment Scheduling
  - 3.3 Electronic Health Records (EHR)
  - 3.4 Billing and Invoicing
  - 3.5 Pharmacy Inventory Management
- 4. External Interface Requirements
  - 4.1 User Interfaces
  - 4.2 Hardware Interfaces
  - 4.3 Software Interfaces

<!-- PAGE_2 -->
- 4.4 Communications Interfaces
- 5. Non-Functional Requirements
  - 5.1 Performance Requirements
  - 5.2 Security Requirements
  - 5.3 Reliability and Availability
  - 5.4 Software Quality Attributes
- 6. Other Constraints

<!-- PAGE_3 -->
## **1. Introduction**

## **1.1 Purpose**

This Software Requirements Specification (SRS) document comprehensively outlines the functional and non-functional requirements for the MediCore Hospital Management System (HMS). The purpose of this document is to establish a detailed baseline agreement between the healthcare stakeholders, system architects, and the development team regarding the precise capabilities, constraints, and operational frameworks of the system. The MediCore HMS is intended to replace the disparate legacy systems currently utilized across the regional hospital network, consolidating patient demographics, clinical records, billing frameworks, and pharmacological inventories into a singular, unified platform. By delineating these requirements, this document serves as the primary reference manual for all subsequent phases of the software development lifecycle, including architecture design, code implementation, quality assurance testing, and final deployment.

## **1.2 Document Conventions**

The requirements outlined in this document follow a structured numbering schema to facilitate traceability. Functional requirements are denoted using the prefix `REQ-` followed by the subsystem abbreviation and a sequential integer (e.g., `REQ-PAT-01` for Patient Management). Statements containing the word "shall" indicate a mandatory requirement that must be implemented for the system to be accepted. Statements containing the word "should" denote a preferred, though non-mandatory, feature. The font styling conforms to IEEE 830 standards, with bold text utilized strictly for requirement identifiers and critical parameter thresholds.

## **1.3 Intended Audience and Reading Suggestions**

This SRS is intended for a diverse spectrum of project stakeholders. Clinical administrative staff should focus primarily on Sections 2 and 3, which detail the user characteristics and primary functional features that will impact daily hospital workflows. The core development and software engineering teams must review the entire document, with particular emphasis on Section 3 (System Features) and Section 5 (Non-Functional Requirements). Quality Assurance (QA) personnel will utilize all functional and non-functional requirement statements as the foundational basis for formulating integration and system-level test cases. Executive sponsors may restrict their reading to the Executive Summary (Section 1) and the high-level Product Scope to gauge overall project alignment with strategic enterprise goals.

<!-- PAGE_4 -->
## **1.4 Product Scope**

The MediCore HMS is an enterprise-grade, web-based software platform engineered specifically for multi-facility healthcare institutions. The system's primary objective is to streamline the intricate administrative, clinical, and financial workflows inherent in modern hospital environments. Key capabilities include automated patient onboarding and lifecycle management, intelligent appointment scheduling, secure Electronic Health Record (EHR) maintenance, integrated billing and insurance claims processing, and real-time pharmacy inventory tracking. The MediCore platform seeks to reduce patient wait times, minimize charting errors, optimize resource allocation, and enhance the overall quality of care delivered. The system will NOT directly interface with life-support hardware or autonomous surgical robotics; its domain is restricted to data management, workflow orchestration, and informational decision support.

## **1.5 References**

The following external documents and standards have been referenced in the formulation of these requirements:

- Health Insurance Portability and Accountability Act (HIPAA) Security Rule Standards, 2023 Revision. •
- HL7 Fast Healthcare Interoperability Resources (FHIR) Specification, Release 4. •
- IEEE Standard 830-1998, IEEE Recommended Practice for Software Requirements Specifications. •
- MediCore Internal Legacy Data Migration Strategy Document (Doc Ref: MC-MIG-004). •

## **2. Overall Description**

## **2.1 Product Perspective**

The MediCore HMS is a standalone, web-delivered enterprise application that operates within a centralized client-server architecture. While it functions as the primary operational system for the hospital, it exists within a broader healthcare technology ecosystem. It is required to integrate seamlessly with external third-party services, including regional insurance clearinghouses for claims adjudication, state-level syndromic surveillance registries, and external laboratory diagnostic networks. The system replaces the legacy 'CareTrack v2' application entirely. The architecture will leverage a cloud-hosted infrastructure utilizing a microservices design pattern, ensuring that individual modules (such as pharmacy and billing) can scale independently in response to shifting hospital loads.

<!-- PAGE_5 -->
## **2.2 Product Functions**

The core functionalities of the MediCore system are broadly categorized into five distinct operational pillars:

- **Patient Administration:** End-to-end management of demographic data, admission, transfer, and discharge (ADT) workflows, and automated bed allocation. •
- **Clinical Operations:** Creation, modification, and secure storage of physician notes, nursing assessments, diagnostic images, and long-term medical histories. •
- **Resource Scheduling:** Coordination of physician calendars, operating theater availability, out-patient clinic slots, and high-value diagnostic equipment. •
- **Financial Management:** Generation of patient invoices, automated application of insurance coverage rules, copayment processing, and revenue cycle reporting. •
- **Ancillary Services (Pharmacy):** Tracking of medication stock levels, prescription fulfillment workflows, expiry date monitoring, and supplier reordering. •

## **2.3 User Classes and Characteristics**

The system caters to a variety of distinct user roles, each possessing unique interaction patterns and security privileges:

- **Front Desk Receptionists:** Characterized by high-volume, rapid-entry data tasks. They require a user interface that is highly optimized for speed and keyboard navigation to manage queues efficiently. The patient dashboard UI should be very intuitive for older doctors who occasionally fill in for administrative duties. •
- **Physicians and Surgeons:** Focused almost exclusively on clinical modules. Their interaction is often time-sensitive. They require streamlined data entry for charts and immediate access to longitudinal patient histories. •
- **Nursing Staff:** The most frequent users of the system, responsible for continuous bedside charting, medication administration logging, and vital sign tracking. Their interface must support rapid, repetitive entries across multiple patient records within a single shift. •
- **Billing Clerks:** Detail-oriented financial personnel handling complex insurance coding (ICD-10/CPT). They require robust search capabilities and dense, data-rich screen layouts to reconcile complex accounts. •
- **System Administrators:** IT personnel responsible for user provisioning, system configuration, and audit reviews. They possess the highest level of system access and require complex configuration dashboards. •

<!-- PAGE_6 -->
#### **2.4 Operating Environment**

The MediCore HMS backend will be hosted on Linux-based containerized servers (e.g., Kubernetes on AWS or Azure). The backend relational database will run on PostgreSQL 15 or higher, augmented by a Redis caching layer for high-speed data retrieval. End-users will access the system exclusively via modern web browsers (Google Chrome, Mozilla Firefox, Microsoft Edge) running on Windows 10/11 or macOS workstations. Additionally, a specialized lightweight tablet interface must be supported for mobile nursing stations operating on iOS 15+ and Android 12+ devices over the hospital's internal secure Wi-Fi network.

#### **2.5 Design and Implementation Constraints**

The development of the MediCore system is bounded by several critical constraints. To ensure absolute compliance with federal healthcare data regulations, all data at rest must be encrypted using AES-256 standards, and all data in transit must utilize TLS 1.3 protocols. Furthermore, the system must be developed using a technology stack approved by the hospital's internal IT steering committee; specifically, the backend must be written in Java (Spring Boot) and the frontend must utilize React.js. The development timeline is strictly constrained, necessitating a phased rollout where the Patient Management and Billing modules must achieve production readiness by Q3 2025.

## **2.6 Assumptions and Dependencies**

This requirements document assumes that the hospital will complete its planned fiber-optic network upgrade prior to system deployment, ensuring sufficient internal bandwidth. It is also assumed that all legacy patient records from 'CareTrack v2' will be successfully extracted and mapped to the new database schema by a separate, dedicated data migration team. The system's automated insurance verification feature is entirely dependent on the continued availability and API stability of the 'HealthClear' national claims network.

# **3. System Features**

### **3.1 Patient Registration and Management**

This module governs the entire lifecycle of a patient's administrative presence within the facility, from initial intake to final discharge. It is the foundational module upon which all other clinical and financial data is anchored.

<!-- PAGE_7 -->
**REQ-PAT-01:** The system shall provide a centralized digital form to capture comprehensive demographic data, including full legal name, date of birth, biological sex, assigned gender, residential address, primary contact numbers, and emergency contact details.

**REQ-PAT-02:** The registration module must automatically assign a unique, immutable 10 digit Medical Record Number (MRN) to every newly registered patient upon successful form submission.

**REQ-PAT-03:** The system shall verify the uniqueness of a patient record by performing an algorithmic comparison against existing database entries utilizing a combination of Last Name, Date of Birth, and Social Security Number (or equivalent national ID) to prevent duplicate profiles.

**REQ-PAT-04:** Ensure robust data validation on all patient intake forms before saving the record to the main database.

**REQ-PAT-05:** The system shall support capturing and storing a digital photograph of the patient via integrated webcams to aid in visual identification during subsequent visits.

**REQ-PAT-06:** The bed management sub-system shall display a real-time, interactive floor map indicating the occupancy status of all hospital beds (Occupied, Available, Needs Cleaning, Maintenance).

**REQ-PAT-07:** When an admission order is entered by a physician, the system shall automatically recommend an available bed based on the required care level (e.g., ICU, Maternity, General Ward) and patient gender.

**REQ-PAT-08:** The system shall generate and print standardized wristband labels containing a scannable 2D barcode, the patient's full name, MRN, and known severe allergies immediately upon admission.

**REQ-PAT-09:** The patient discharge workflow needs to be fast enough to not disrupt the ward workflow during peak morning hours.

**REQ-PAT-10:** The system shall maintain an immutable history log of all inter-ward patient transfers, including the timestamp, the authorizing physician, and the personnel executing the transfer.

**REQ-PAT-11:** The system shall allow authorized users to merge duplicate patient records. This action must preserve all clinical data from both records, linking them under the older, primary MRN.

**REQ-PAT-12:** The system shall provide a global search bar accessible from all administrative screens allowing staff to locate patients using partial name matches or MRN inputs.

<!-- PAGE_8 -->
## **3.2 Appointment Scheduling**

The scheduling module coordinates the complex calendars of hundreds of providers, specialist equipment, and physical clinical spaces to optimize throughput and minimize patient wait times.

**REQ-SCH-01:** The system shall provide a graphical calendar interface displaying the daily, weekly, and monthly availability of all registered healthcare providers.

**REQ-SCH-02:** Users shall be able to filter the provider calendar by department, specialty, specific physician name, or location.

**REQ-SCH-03:** The system shall automatically calculate and block out required buffer times between appointments based on the specific appointment type (e.g., 15 minutes for followup, 45 minutes for new patient consult).

**REQ-SCH-04:** The system shall allow patients and front-desk administrators to book regular consultation appointments up to 6 months in advance of the current date.

**REQ-SCH-05:** Upon the successful scheduling of an appointment, the system shall automatically dispatch a confirmation notification to the patient via SMS and email, provided contact details are present.

**REQ-SCH-06:** The system shall send automated appointment reminders 48 hours and 12 hours prior to the scheduled encounter time.

**REQ-SCH-07:** The system shall allow administrators to configure complex recurring schedules for providers, accounting for alternating weeks, on-call rotations, and designated administrative days.

**REQ-SCH-08:** The system must support multi-resource scheduling, allowing a single booking to reserve a physician, a specific examination room, and a piece of diagnostic equipment (e.g., Ultrasound machine) simultaneously.

**REQ-SCH-09:** The system shall maintain a digital waitlist for fully booked days, automatically notifying waitlisted patients if a previously scheduled slot becomes available due to a cancellation.

**REQ-SCH-10:** The module must strictly enforce provider-defined maximum daily limits for specific complex procedure types to prevent physician fatigue.

**REQ-SCH-11:** When a provider calls in sick, the system shall provide a bulk-rescheduling utility to rapidly notify affected patients and offer alternative dates with other available providers in the same department.

<!-- PAGE_9 -->
## **3.3 Electronic Health Records (EHR)**

The EHR module is the clinical core of the system, securely housing all longitudinal medical data. It is critical for clinical decision-making and must present dense medical information clearly and accurately.

**REQ-EHR-01:** The system shall provide a comprehensive clinical dashboard for each patient, summarizing active problem lists, current medications, recent vital signs, and pending lab results on a single screen.

**REQ-EHR-02:** Physicians shall be able to create structured clinical notes using pre-defined, customizable templates tailored to specific medical specialties (e.g., Cardiology, Orthopedics).

**REQ-EHR-03:** The system shall support rich-text formatting within clinical notes, allowing for bolding, bullet points, and the embedding of small diagnostic image thumbnails.

**REQ-EHR-04:** All finalized clinical notes must be electronically signed by the authoring provider, utilizing a secure PIN or biometric authentication, after which the note becomes a locked, legally binding document.

**REQ-EHR-05:** If an error is discovered in a signed note, the system shall permit the creation of a formal addendum. The original note must never be deleted or overwritten, maintaining complete clinical provenance.

**REQ-EHR-06:** The system shall include an integrated Computerized Provider Order Entry (CPOE) module for prescribing medications, ordering laboratory tests, and requesting radiological imaging.

**REQ-EHR-07:** The CPOE module shall automatically execute drug-drug interaction (DDI) and drug-allergy interaction checks against the patient's profile, displaying a high-visibility warning to the physician if a conflict is detected.

**REQ-EHR-08:** Records of patients who have been formally discharged shall be archived immediately upon the physician signing the discharge summary to keep the active database lean.

**REQ-EHR-09:** The system shall plot vital signs (temperature, blood pressure, heart rate, oxygen saturation) on interactive graphical flowsheets, allowing clinicians to easily identify physiological trends over time.

**REQ-EHR-10:** The EHR module shall support the ingestion and rendering of external laboratory reports formatted in standard HL7 V2.x messaging standards.

<!-- PAGE_10 -->
**REQ-EHR-11:** The database search function must be quick when doctors are trying to find historical data for a specific patient.

**REQ-EHR-12:** The system shall provide an export utility to package a patient's complete medical history into a standard Continuity of Care Document (CCD) XML format for secure transmission to external healthcare providers.

## **3.4 Billing and Invoicing**

The financial lifeline of the institution. This module translates clinical encounters into billable events, managing insurance claims and patient out-of-pocket expenses.

**REQ-BIL-01:** The system shall automatically aggregate all billable items, including room charges, medication administrations, surgical procedures, and physician consults, into a unified draft invoice upon patient discharge.

**REQ-BIL-02:** The billing module must enforce standard ICD-10 and CPT coding validation to ensure that submitted claims meet baseline structural requirements before transmission to payers.

**REQ-BIL-03:** The system shall support split-billing functionality, accurately dividing a total invoice between a primary insurance payer, a secondary insurance payer, and the patient's out-of-pocket responsibility.

**REQ-BIL-04:** The system shall generate standardized X12 837 claim files for electronic batch submission to the regional insurance clearinghouse.

**REQ-BIL-05:** The system must process incoming X12 835 Electronic Remittance Advice (ERA) files, automatically updating invoice statuses to Paid, Denied, or Partially Paid based on the payer's response.

**REQ-BIL-06:** The system shall maintain an updated, centralized fee schedule, allowing authorized financial administrators to universally update the pricing of specific procedures or consumables.

**REQ-BIL-07:** The system shall generate comprehensive revenue cycle reports, including Aging Accounts Receivable, Daily Cash Collections, and Insurance Denial Rate metrics.

**REQ-BIL-08:** The system shall provide a secure, public-facing portal allowing patients to view their outstanding balances and submit payments via credit card or digital wallets.

**REQ-BIL-09:** The application will try to prevent unauthorized access to the billing module from non-financial staff members.

<!-- PAGE_11 -->
**REQ-BIL-10:** The system shall automatically flag and queue unpaid patient balances exceeding 120 days for review by the internal collections department.

## **3.5 Pharmacy Inventory Management**

This module maintains precise control over the hospital's medication repository, tracking supply levels, expiry dates, and regulatory compliance for controlled substances.

**REQ-PHR-01:** The system shall maintain a master formulary database containing all medications approved for use within the hospital, including generic names, brand names, dosages, and administration routes.

**REQ-PHR-02:** The system shall track the real-time physical inventory levels of all stocked medications across the central pharmacy and distributed ward-level dispensing cabinets.

**REQ-PHR-03:** As medications are electronically administered and logged by nursing staff in the EHR, the system shall automatically deduct the corresponding quantities from the appropriate inventory location.

**REQ-PHR-04:** The system shall monitor medication expiration dates and generate automated alerts to pharmacy staff 30 days, 15 days, and 1 day prior to the expiration of any batch in inventory.

**REQ-PHR-05:** The module must maintain a strict, immutable chain-of-custody log for all Schedule II through V controlled substances, requiring dual-user authentication for dispensing and disposal events.

**REQ-PHR-06:** The system shall utilize predictive algorithms based on historical consumption patterns to generate suggested purchase orders when inventory levels fall below defined safety thresholds.

**REQ-PHR-07:** The system shall support the scanning of GS1 DataMatrix barcodes on incoming pharmaceutical shipments to rapidly ingest lot numbers, expiry dates, and quantities into the database.

## **4. External Interface Requirements**

## **4.1 User Interfaces**

The primary mode of interaction is via standard web browsers. The interface design must prioritize clarity, density of information, and reduced visual fatigue for users working long shifts.

<!-- PAGE_12 -->
**REQ-UI-01:** The application layout must be user-friendly and adhere to standard accessibility guidelines (WCAG 2.1 AA), providing sufficient color contrast and support for screen readers.

**REQ-UI-02:** It is recommended that the user interface is responsive on smaller screens for staff using mobile devices on the go.

**REQ-UI-03:** The system shall employ a consistent navigation paradigm, featuring a persistent global top bar for searching and a collapsible left-hand sidebar for module switching.

**REQ-UI-04:** All critical alert dialogs, such as allergy warnings or severe drug interactions, must employ a high-visibility modal design that requires explicit user acknowledgement to dismiss.

## **4.2 Hardware Interfaces**

The system must interact with several pieces of physical hospital equipment to streamline data entry and improve safety.

**REQ-HW-01:** The system shall interface with standard USB and Bluetooth 2D barcode scanners to facilitate wristband scanning and medication verification.

**REQ-HW-02:** The software must be capable of receiving automated vital sign data streams via RS-232 or network protocols directly from compatible bedside patient monitors in the Intensive Care Unit.

**REQ-HW-03:** The system shall support integration with standard thermal label printers for the generation of patient wristbands and pharmacy specimen labels.

## **4.3 Software Interfaces**

Integration with existing regional infrastructure is critical for the hospital's operational mandate.

**REQ-SW-01:** The system shall expose a secure RESTful API secured by OAuth 2.0 to allow authorized third-party analytics platforms to extract anonymized, aggregated demographic data.

**REQ-SW-02:** The system shall connect to the National Prescription Drug Monitoring Program (PDMP) via a SOAP web service to query a patient's historical narcotic prescriptions before new orders are finalized.

<!-- PAGE_13 -->
## **4.4 Communications Interfaces**

The system relies heavily on both internal networking and external telecommunications for alerts.

**REQ-COM-01:** All network traffic between the client browsers and the backend servers must be encrypted using TLS 1.3 or higher.

**REQ-COM-02:** The system shall integrate with a third-party SMS gateway via HTTPS API to deliver automated appointment reminders and urgent staff broadcast messages.

## **5. Non-Functional Requirements**

## **5.1 Performance Requirements**

System performance is critical in a clinical setting where delays can directly impact patient care and operational throughput.

**REQ-PERF-01:** The system should load patient history pages quickly to avoid frustrating the medical staff during rounds.

**REQ-PERF-02:** Under normal operating conditions, 95% of all standard database queries (e.g., loading a schedule, viewing a demographic profile) shall return results to the UI in under 1.5 seconds.

**REQ-PERF-03:** Emergency ward alerts and critical patient status notifications shall override all other UI elements and be delivered to the client within 2 seconds of the triggering event.

**REQ-PERF-04:** The system shall support a minimum of 2,500 concurrent active users executing standard read/write workflows without degrading application response times beyond the 1.5-second threshold.

**REQ-PERF-05:** The application will handle a large number of concurrent users efficiently during the morning shift changes.

**REQ-PERF-06:** Generating the complex monthly hospital-wide financial summary report shall take no longer than 15 minutes of background processing time.

**REQ-PERF-07:** The backend database should be scalable to accommodate future hospital growth and the acquisition of smaller satellite clinics.

<!-- PAGE_14 -->
**REQ-PERF-08:** System notifications, including emergency codes and broadcast messages, have a maximum allowed latency of 5 seconds under high system load.

## **5.2 Security Requirements**

Healthcare systems are prime targets for cyberattacks. The system must rigorously defend Patient Health Information (PHI) against unauthorized access and exfiltration.

**REQ-SEC-01:** The system shall enforce strict Role-Based Access Control (RBAC), ensuring users can only access modules and data strictly necessary for their defined job functions.

**REQ-SEC-02:** All passwords must conform to a minimum complexity standard: at least 12 characters, containing a mix of uppercase, lowercase, numerical, and special characters.

**REQ-SEC-03:** The system shall automatically terminate an active user session and force a logout after 15 minutes of uninterrupted input inactivity.

**REQ-SEC-04:** Multi-Factor Authentication (MFA) via a mobile authenticator app or SMS token shall be mandatory for any access originating from outside the hospital's internal IP range.

**REQ-SEC-05:** For compliance with internal security policies, all user passwords must be changed every 30 days without exception.

**REQ-SEC-06:** The system shall maintain an immutable, tamper-evident audit log recording every instance of PHI access, modification, or deletion, including the user ID, timestamp, and IP address.

**REQ-SEC-07:** Database backups should be done seamlessly without disturbing users during their daily operations.

**REQ-SEC-08:** All stored PHI data shall be encrypted at rest using AES-256 encryption. Key management shall be handled by a dedicated Hardware Security Module (HSM).

**REQ-SEC-09:** Admin users shall have full, unrestricted read access to the system-wide audit logs to monitor platform usage and investigate security incidents.

**REQ-SEC-10:** The system shall feature automated lockout mechanisms, disabling a user account for 30 minutes after five consecutive failed login attempts.

**REQ-SEC-11:** User authentication credentials shall remain valid for 90 days before the system prompts for a mandatory reset.

**REQ-SEC-12:** System Administrators are the only roles permitted to view security audit logs; general Admin users cannot access this module due to privacy constraints.

<!-- PAGE_15 -->
## **5.3 Reliability and Availability**

The hospital operates 24/7/365. System downtime can have direct, adverse effects on patient care.

**REQ-REL-01:** Uptime for the main portal needs to be high to support continuous clinical operations.

**REQ-REL-02:** The core system infrastructure shall guarantee a 99.95% uptime SLA, allowing for no more than 4.38 hours of unplanned downtime per year.

**REQ-REL-03:** In the event of a catastrophic primary data center failure, the system shall seamlessly failover to a geographically redundant backup site within 5 minutes, with zero data loss (RPO = 0, RTO = 5 mins).

**REQ-REL-04:** If the central server connection is lost, local workstation caching shall support up to 50 concurrent transactions before requiring a hard lock on further data entry.

**REQ-REL-05:** The system shall undergo automated, daily full backups at 02:00 AM, with incremental backups occurring every 15 minutes.

**REQ-REL-06:** During network disconnection events or wide-area network outages, the system must seamlessly cache up to 100 concurrent transactions locally to maintain operational continuity in the emergency department.

**REQ-REL-07:** Patient clinical data and active treatment plans are moved to cold storage archiving 30 days after the formal discharge event to optimize primary database performance.

## **6. Other Constraints**

## **6.1 Regulatory Constraints**

**REQ-CON-01:** The system architecture and data handling procedures must be entirely compliant with the Health Insurance Portability and Accountability Act (HIPAA).

**REQ-CON-02:** The software must achieve Office of the National Coordinator for Health Information Technology (ONC) certification to ensure the hospital remains eligible for federal incentive programs.

**REQ-CON-03:** Any data relating to substance abuse treatment must be strictly partitioned and adhere to 42 CFR Part 2 federal regulations, requiring explicit, additional patient consent for data sharing.

<!-- PAGE_16 -->
## **6.2 Technical and Business Constraints**

**REQ-CON-04:** The system shall not rely on any proprietary, vendor-locked proprietary database technologies; standard open-source SQL engines must be utilized.

**REQ-CON-05:** The initial capital expenditure for the system's software licensing and cloud infrastructure deployment shall not exceed \$2.5 million for the first operational year.

**REQ-CON-06:** Due to legacy hardware limitations in rural satellite clinics, the client-side web application must function reasonably well on machines with only 4GB of RAM.

**REQ-CON-07:** Due to provider schedule volatility and historical no-show rates, the appointment scheduling module is restricted to a maximum 90-day rolling window for all future bookings.