// MASTER DATA STORE (Mock Database -> Ready for API Integration)
const schoolDB = {
    schoolInfo: {
        name: "Pucho.ai SMS Center",
        academicYear: "2024-25",
        address: "Digital Square, Bengaluru",
        contact: "+91 80000 12345"
    },
    students: [
        // Grade 10 - A
        { id: "STD-001", name: "Aarav Sharma", class: "Grade 10", division: "A", roll_no: 1, guardian_name: "Rajesh Sharma", phone: "9876543210", email: "rajesh.sharma@example.com", status: "Active", db_id: 1 },
        { id: "STD-002", name: "Vihaan Das", class: "Grade 10", division: "A", roll_no: 2, guardian_name: "Vikram Das", phone: "9988776655", email: "vikram.das@example.com", status: "Active", db_id: 2 },
        { id: "STD-003", name: "Aditi Patel", class: "Grade 10", division: "A", roll_no: 3, guardian_name: "Kiran Patel", phone: "9765432109", email: "kiran.patel@example.com", status: "Active", db_id: 3 },
        { id: "STD-004", name: "Arjun Mehta", class: "Grade 10", division: "A", roll_no: 4, guardian_name: "Anil Mehta", phone: "9654321098", email: "anil.mehta@example.com", status: "Active", db_id: 4 },

        // Grade 10 - B
        { id: "STD-005", name: "Diya Reddy", class: "Grade 10", division: "B", roll_no: 1, guardian_name: "Suresh Reddy", phone: "9543210987", email: "suresh.reddy@example.com", status: "Active", db_id: 5 },
        { id: "STD-006", name: "Rohan Gupta", class: "Grade 10", division: "B", roll_no: 2, guardian_name: "Manoj Gupta", phone: "9432109876", email: "manoj.gupta@example.com", status: "Active", db_id: 6 },
        { id: "STD-036", name: "Kavya Nambiar", class: "Grade 10", division: "B", roll_no: 3, guardian_name: "Sunil Nambiar", phone: "9321098765", email: "sunil.nambiar@example.com", status: "Active", db_id: 36 },
        { id: "STD-037", name: "Aryan Sethi", class: "Grade 10", division: "B", roll_no: 4, guardian_name: "Vivek Sethi", phone: "9210987654", email: "vivek.sethi@example.com", status: "Active", db_id: 37 },

        // Grade 9 - A
        { id: "STD-034", name: "Lakshya Pandey", class: "Grade 9", division: "A", roll_no: 1, guardian_name: "Manoj Pandey", phone: "9567893421", email: "manoj.pandey@example.com", status: "Active", db_id: 34 },
        { id: "STD-038", name: "Tara Bhat", class: "Grade 9", division: "A", roll_no: 2, guardian_name: "Ramesh Bhat", phone: "9109876543", email: "ramesh.bhat@example.com", status: "Active", db_id: 38 },

        // Grade 9 - B
        { id: "STD-007", name: "Ishani Verma", class: "Grade 9", division: "B", roll_no: 1, guardian_name: "Sanjay Verma", phone: "9123456789", email: "sanjay.verma@example.com", status: "Active", db_id: 7 },
        { id: "STD-008", name: "Kabir Joshi", class: "Grade 9", division: "B", roll_no: 2, guardian_name: "Rahul Joshi", phone: "9234567890", email: "rahul.joshi@example.com", status: "Active", db_id: 8 },
        { id: "STD-009", name: "Ananya Singh", class: "Grade 9", division: "B", roll_no: 3, guardian_name: "Pradeep Singh", phone: "9345678901", email: "pradeep.singh@example.com", status: "Active", db_id: 9 },
        { id: "STD-010", name: "Vivaan Kumar", class: "Grade 9", division: "B", roll_no: 4, guardian_name: "Dinesh Kumar", phone: "9456789012", email: "dinesh.kumar@example.com", status: "Active", db_id: 10 },
        { id: "STD-011", name: "Saanvi Nair", class: "Grade 9", division: "B", roll_no: 5, guardian_name: "Ravi Nair", phone: "9567890123", email: "ravi.nair@example.com", status: "Active", db_id: 11 },

        // Grade 8 - A
        { id: "STD-035", name: "Anika Rajput", class: "Grade 8", division: "A", roll_no: 1, guardian_name: "Harish Rajput", phone: "9678904532", email: "harish.rajput@example.com", status: "Active", db_id: 35 },
        { id: "STD-039", name: "Rudra Pillai", class: "Grade 8", division: "A", roll_no: 2, guardian_name: "Manoj Pillai", phone: "9098765432", email: "manoj.pillai@example.com", status: "Active", db_id: 39 },

        // Grade 8 - C
        { id: "STD-012", name: "Zoya Khan", class: "Grade 8", division: "C", roll_no: 1, guardian_name: "Arif Khan", phone: "9822334455", email: "arif.khan@example.com", status: "Active", db_id: 12 },
        { id: "STD-013", name: "Ayaan Ali", class: "Grade 8", division: "C", roll_no: 2, guardian_name: "Imran Ali", phone: "9678901234", email: "imran.ali@example.com", status: "Active", db_id: 13 },
        { id: "STD-014", name: "Mira Desai", class: "Grade 8", division: "C", roll_no: 3, guardian_name: "Ketan Desai", phone: "9789012345", email: "ketan.desai@example.com", status: "Active", db_id: 14 },
        { id: "STD-015", name: "Shivansh Iyer", class: "Grade 8", division: "C", roll_no: 4, guardian_name: "Venkat Iyer", phone: "9890123456", email: "venkat.iyer@example.com", status: "Active", db_id: 15 },

        // Grade 7 - B
        { id: "STD-016", name: "Anaya Das", class: "Grade 7", division: "B", roll_no: 1, guardian_name: "Vikram Das", phone: "9600778899", email: "vikram.das@example.com", status: "Active", db_id: 16 },
        { id: "STD-017", name: "Aditya Rao", class: "Grade 7", division: "B", roll_no: 2, guardian_name: "Prakash Rao", phone: "9901234567", email: "prakash.rao@example.com", status: "Active", db_id: 17 },
        { id: "STD-018", name: "Kiara Pillai", class: "Grade 7", division: "B", roll_no: 3, guardian_name: "Sunil Pillai", phone: "9012345678", email: "sunil.pillai@example.com", status: "Active", db_id: 18 },
        { id: "STD-019", name: "Reyansh Menon", class: "Grade 7", division: "B", roll_no: 4, guardian_name: "Anand Menon", phone: "9123450987", email: "anand.menon@example.com", status: "Active", db_id: 19 },

        // Grade 6 - A
        { id: "STD-028", name: "Pranav Jain", class: "Grade 6", division: "A", roll_no: 1, guardian_name: "Sanjay Jain", phone: "9901238765", email: "sanjay.jain@example.com", status: "Active", db_id: 28 },
        { id: "STD-029", name: "Riya Bansal", class: "Grade 6", division: "A", roll_no: 2, guardian_name: "Mohan Bansal", phone: "9012349876", email: "mohan.bansal@example.com", status: "Active", db_id: 29 },
        { id: "STD-030", name: "Sai Krishnan", class: "Grade 6", division: "A", roll_no: 3, guardian_name: "Rajan Krishnan", phone: "9123459087", email: "rajan.krishnan@example.com", status: "Active", db_id: 30 },

        // Grade 5 - B
        { id: "STD-031", name: "Tanvi Thakur", class: "Grade 5", division: "B", roll_no: 1, guardian_name: "Rajesh Thakur", phone: "9234560198", email: "rajesh.thakur@example.com", status: "Active", db_id: 31 },
        { id: "STD-032", name: "Atharv Saxena", class: "Grade 5", division: "B", roll_no: 2, guardian_name: "Pankaj Saxena", phone: "9345671209", email: "pankaj.saxena@example.com", status: "Active", db_id: 32 },
        { id: "STD-033", name: "Pihu Aggarwal", class: "Grade 5", division: "B", roll_no: 3, guardian_name: "Rahul Aggarwal", phone: "9456782310", email: "rahul.aggarwal@example.com", status: "Active", db_id: 33 },
    ],
    staff: [
        { id: "STF-001", name: "Dr. Ramesh Babu", email: "ramesh.babu@school.com", role: "teacher", subject: "Mathematics", status: "Active", designation: "HOD Math", class_assigned: "Grade 10", division_assigned: "A", experience: 15 },
        { id: "STF-002", name: "Ms. Sunita Rao", email: "sunita.rao@school.com", role: "teacher", subject: "Science", status: "Active", designation: "Class Teacher", class_assigned: "Grade 9", division_assigned: "B", experience: 10 },
        { id: "STF-003", name: "Mr. Amit Kumar", email: "amit.kumar@school.com", role: "teacher", subject: "English", status: "Active", designation: "Faculty", class_assigned: "Grade 8", division_assigned: "C", experience: 8 },
        { id: "STF-004", name: "Mrs. Priya Singh", email: "priya.singh@school.com", role: "teacher", subject: "Social Studies", status: "Active", designation: "Faculty", class_assigned: "Grade 7", division_assigned: "B", experience: 12 },
        { id: "STF-008", name: "Mr. Karthik Iyer", email: "karthik.iyer@school.com", role: "teacher", subject: "Computer Science", status: "Active", designation: "IT Head", class_assigned: "Grade 10", division_assigned: "A", experience: 11 },
        { id: "STF-009", name: "Mrs. Lakshmi Menon", email: "lakshmi.menon@school.com", role: "teacher", subject: "Hindi", status: "Active", designation: "Faculty", class_assigned: "Grade 9", division_assigned: "A", experience: 14 },
        { id: "STF-010", name: "Mr. Sanjay Gupta", email: "sanjay.gupta@school.com", role: "teacher", subject: "Physical Education", status: "Active", designation: "Sports Coordinator", class_assigned: "N/A", division_assigned: "N/A", experience: 6 },
        { id: "STF-011", name: "Ms. Divya Joshi", email: "divya.joshi@school.com", role: "teacher", subject: "Art & Craft", status: "Active", designation: "Faculty", class_assigned: "Grade 6", division_assigned: "A", experience: 5 },
        { id: "STF-012", name: "Mr. Varun Kapoor", email: "varun.kapoor@school.com", role: "teacher", subject: "Music", status: "Active", designation: "Faculty", class_assigned: "Grade 5", division_assigned: "B", experience: 8 }
    ],
    fees: [
        // Monthly Tuition - Pending
        { id: "FEE-101", student_id: "STD-001", student: "Aarav Sharma", class: "Grade 10", type: "Monthly Tuition", amount: 5000, status: "Pending", dueDate: "2026-05-10" },
        { id: "FEE-102", student_id: "STD-002", student: "Vihaan Das", class: "Grade 10", type: "Monthly Tuition", amount: 5500, status: "Pending", dueDate: "2026-02-10" },
        { id: "FEE-103", student_id: "STD-007", student: "Ishani Verma", class: "Grade 9", type: "Monthly Tuition", amount: 4800, status: "Pending", dueDate: "2026-05-10" },
        { id: "FEE-104", student_id: "STD-012", student: "Zoya Khan", class: "Grade 8", type: "Monthly Tuition", amount: 4500, status: "Pending", dueDate: "2026-05-10" },

        // Paid Fees
        { id: "FEE-106", student_id: "STD-003", student: "Aditi Patel", class: "Grade 10", type: "Monthly Tuition", amount: 5000, status: "Paid", dueDate: "2026-04-10", paidDate: "2026-04-01" },
        { id: "FEE-107", student_id: "STD-016", student: "Anaya Das", class: "Grade 7", type: "Admission Fee", amount: 15000, status: "Paid", dueDate: "2026-03-30", paidDate: "2026-03-25" },
        { id: "FEE-108", student_id: "STD-002", student: "Vihaan Das", class: "Grade 10", type: "Exam Fee", amount: 2000, status: "Paid", dueDate: "2026-05-01", paidDate: "2026-04-28" },

        // Transport Fees
        { id: "FEE-109", student_id: "STD-008", student: "Kabir Joshi", class: "Grade 9", type: "Transport Fee", amount: 1500, status: "Pending", dueDate: "2026-05-15" },
        { id: "FEE-110", student_id: "STD-016", student: "Anaya Das", class: "Grade 7", type: "Transport Fee", amount: 1500, status: "Paid", dueDate: "2026-04-15", paidDate: "2026-04-12" }
    ],
    attendance: [
        // STD-016 Anaya Das
        { id: "ATT-001", student_id: "STD-016", date: "2026-01-05", status: "Present" },
        { id: "ATT-002", student_id: "STD-016", date: "2026-01-08", status: "Absent" },
        { id: "ATT-003", student_id: "STD-016", date: "2026-01-12", status: "Present" },
        { id: "ATT-004", student_id: "STD-016", date: "2026-01-15", status: "Absent" },
        { id: "ATT-005", student_id: "STD-016", date: "2026-01-20", status: "Present" },
        { id: "ATT-006", student_id: "STD-016", date: "2026-01-22", status: "Present" },
        // STD-002 Vihaan Das
        { id: "ATT-007", student_id: "STD-002", date: "2026-01-10", status: "Present" },
        { id: "ATT-008", student_id: "STD-002", date: "2026-01-15", status: "Present" }
    ],
    exams: [
        { id: "EXM-001", class: "Grade 10", subject: "Mathematics", date: "2026-05-15", time: "10:00 AM", venue: "Hall A", examType: "Mid Term" },
        { id: "EXM-002", class: "Grade 10", subject: "Science", date: "2026-05-16", time: "10:00 AM", venue: "Hall A", examType: "Mid Term" },
        { id: "EXM-006", class: "Grade 7", subject: "English", date: "2026-05-20", time: "09:00 AM", venue: "Room 102", examType: "Finals" }
    ],
    results: [
        { id: "RES-001", student_id: "STD-002", student: "Vihaan Das", subject: "Mathematics", marks: 92, total: 100, grade: "A+", exam_type: "Mid Term" },
        { id: "RES-002", student_id: "STD-002", student: "Vihaan Das", subject: "Science", marks: 88, total: 100, grade: "A", exam_type: "Mid Term" },
        { id: "RES-003", student_id: "STD-016", student: "Anaya Das", subject: "English", marks: 85, total: 100, grade: "A", exam_type: "Mid Term" },
        { id: "RES-004", student_id: "STD-016", student: "Anaya Das", subject: "Mathematics", marks: 78, total: 100, grade: "B+", exam_type: "Mid Term" },
        { id: "RES-005", student_id: "STD-016", student: "Anaya Das", subject: "Science", marks: 90, total: 100, grade: "A+", exam_type: "Mid Term" }
    ],
    admissions: [
        { id: "ADM-001", student_name: "Rahul Verma", parent_name: "Suresh Verma", grade: "Grade 6", dob: "2013-08-15", phone: "9876540001", status: "Pending", applied_at: "2024-03-10T10:00:00Z", parent_email: "suresh.verma@example.com", docs: { birth_cert: "uploaded", address_proof: "missing" } },
        { id: "ADM-002", student_name: "Anaya Das", parent_name: "Vikram Das", grade: "Grade 7", dob: "2013-05-20", phone: "9600778899", status: "Approved", applied_at: "2026-01-10T11:30:00Z", parent_email: "vikram.das@example.com", docs: { birth_cert: "uploaded", address_proof: "uploaded" } }
    ],
    notices: [
        { id: "NTC-001", title: "Annual Day 2026", content: "Annual celebrations on 20th Feb 2026.", date: "2026-01-15", target: "Global", priority: "High" },
        { id: "NTC-002", title: "PTM Notice", content: "Parent-Teacher Meeting next Saturday.", date: "2026-01-20", target: "Parents", priority: "Medium" }
    ],
    quizzes: [
        { id: "QZ-001", title: "Algebra Quiz-1", subject: "Mathematics", class: "Grade 10", division: "A", type: "Unit Test", date: "2026-01-08", totalMarks: 20 }
    ],
    subjects: [
        { id: "SUB-001", name: "Mathematics", class: "Grade 10" },
        { id: "SUB-002", name: "Science", class: "Grade 10" },
        { id: "SUB-006", name: "English", class: "Grade 7" },
        { id: "SUB-007", name: "Social Studies", class: "Grade 7" }
    ],
    homework: [
        { id: "HW-101", title: "Quadratic Equations", subject: "Mathematics", class_grade: "Grade 10", division: "A", assignedBy: "Dr. Ramesh Babu", dueDate: "2026-01-25", assignedDate: "2026-01-20", file: "quadratic_ws.pdf", description: "Solve all problems from exercise 4.2 in your textbook. Focus on middle-term splitting method." },
        { id: "HW-102", title: "Photosynthesis Diagram", subject: "Science", class_grade: "Grade 10", division: "A", assignedBy: "Ms. Sunita Rao", dueDate: "2026-01-26", assignedDate: "2026-01-21", file: null, description: "Draw and label the process of photosynthesis on an A4 sheet. Use proper coloring for chloroplasts." },
        { id: "HW-103", title: "Verb Tense Exercise", subject: "English", class_grade: "Grade 7", division: "B", assignedBy: "Mrs. Priya Singh", dueDate: "2026-01-24", assignedDate: "2026-01-20", file: "english_grammar.pdf", description: "Complete the worksheet on past perfect continuous tense. Ensure you highlight the auxiliary verbs." }
    ],
    leaves: [
        { id: "LV-001", user_id: "STD-016", user_name: "Anaya Das", user_role: "student", reason: "Family Trip", start_date: "2026-01-15", end_date: "2026-01-18", status: "Approved", target_role: "staff" },
        { id: "LV-002", user_id: "VikramDas123", user_name: "Vikram Das", user_role: "parent", reason: "Sick Leave for Anaya", start_date: "2026-01-22", end_date: "2026-01-23", status: "Pending", target_role: "staff" }
    ]
};

// Global accessor
window.schoolDB = schoolDB;
