<!-- PAGE_0 -->
# **Logbook+ — User Stories**

## **Class Representative (CR) User Stories**

### **US001 – Attendance Management**

**As a** Class Representative,

**I want to** access my class list for the current period and mark each student as present or absent,

**so that** I can quickly submit the initial attendance to the faculty for review.

#### **Acceptance Criteria:**

- The class list is pre-populated with all registered students for that class.
- CR can access the attendance list for the currently scheduled period.
- By default, all students are marked "Present".
- CR can tap a student's name to toggle their status to "Absent".
- A "Submit to Faculty" button becomes active after the CR has viewed the list.

## **US002 – Schedule & Timetable Viewing**

**As a** Class Representative,

**I want to** view the complete daily and weekly timetable for my class,

**so that** I can anticipate which faculty is coming and prepare for the subjects.

#### **Acceptance Criteria:**

- The timetable view displays all periods of the week in a structured table format.
- The view displays period times, subject names, and faculty names.
- The active period during that day is highlighted for easy reference.

<!-- PAGE_1 -->
## **US003 – Class Status Reporting**

**As a** Class Representative,

**I want to** report when a scheduled class is free (faculty absent) or substituted, **so that** the administration and faculty-in-charge are immediately aware of schedule changes.

## **Acceptance Criteria:**

- On the current period's attendance screen, a "Report Class Status" option is available.
- Available options:
  - "Faculty Absent (Free Period)" ** THEN ** If "Faculty Absent (Free Period)" is selected, the period is marked as absent.
  - "Substitution" ** THEN **If "Substitution" is selected, the CR can select the substitute faculty's name from a searchable list.

<!-- PAGE_2 -->
# **Faculty User Stories**

### **US004 – Dashboard Overview**

**As a** Faculty member,

**I want to** see a dashboard overview of my day,

**so that** I can instantly view all assigned periods, classes, and attendance status.

#### **Acceptance Criteria:**

- Each period appears as a card displaying the Classroom number, Course name, and Timing.
- If attendance is submitted by the CR, the card shows "Pending Review" with counts (e.g., "Present: 45 / Absent: 5").
- If attendance is not submitted, the card shows "Awaiting CR Submission".

## **US005 – Attendance Review & Confirmation**

**As a** Faculty member,

**I want to** review and edit the attendance list submitted by the CR, **so that** I can ensure the final record is accurate.

#### **Acceptance Criteria:**

- Faculty can override any student's status (e.g., change "Absent" to "Present").
- A "Confirm & Finalize" button submits the finalized attendance.
- Once finalized, the record is locked and marked as "Completed".

<!-- PAGE_3 -->
## **US006 – Period Status Visualization**

**As a** Faculty member,

**I want to** see visual indicators for each period's status,

**so that** I can quickly understand my teaching progress and engagement.

## **Acceptance Criteria:**

- **Green**: Attendance finalized (completed period).
- **Red**: Faculty absent or class not engaged.
- **Orange**: Substitution period taken.
- **Grey**: Upcoming or unengaged period.

## **US007 – Class Swap Requests**

**As a** Faculty member,

**I want to** request a class swap by selecting one of my periods and proposing a new time/day,

**so that** I can handle schedule conflicts or plan extra classes.

## **Acceptance Criteria:**

- Faculty can browse and select a target slot (free slot or another faculty's slot).
- Once approved by the targeted slot's faculty, the requesting faculty can occupy the selected period as scheduled.
- Faculty can select one of their future periods to compensate for the swapped from the timetable.

<!-- PAGE_4 -->
### **US008 – Attendance Analytics**

**As a** Faculty member,

**I want to** view attendance statistics for my subjects,

**so that** I can monitor engagement and identify students with low attendance.

### **Acceptance Criteria:**

- Displays overall attendance percentage.
- Faculty can set a date range (Last 30 Days, This Semester, or Custom).
- When a student's attendance falls below 75%, a notification is generated for the faculty, including the number of classes the student has been absent.
- Individual student attendance can be viewed by clicking their name, showing date-wise records and summary counts.
- For each individual student, shows a detailed, date-wise attendance record along with a summary count (e.g., "Attended 8 out of 12 classes").

# **Admin User Stories**

## **US011 –Workload & Activity Log**

**As the** Admin,

**I want to** view logs of absent periods, substitutions, swaps, and extra classes **so that** I can monitor faculty workload and overall curriculum coverage across the department.

### **Acceptance Criteria:**

- A "Workload Report" section is available.
- The report can be filtered by date range, department, and faculty.
- Lists event types: Substitution, Swap, Extra Class, and Period Not Engaged.
- The report can be exported as a PDF or CSV file.

<!-- PAGE_5 -->
## **US012 – Department Engagement Monitoring**

**As the** Admin,

**I want to** view real-time engagement metrics for all classes, **so that** I can monitor academic activity across the department.

## **Acceptance Criteria:**

- The dashboard displays real-time engagement percentage (e.g., "85% engaged").
- Includes a bar chart showing "Total Engaged" vs. "Total Not Engaged" periods.
- Admin can drill down into "Not Engaged" periods to view affected classes.