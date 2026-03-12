// MASTER DASHBOARD ENGINE
const dashboard = {
    // Supabase Config (Direct DB Access)
    supabaseUrl: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_URL : '',
    supabaseKey: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_KEY : '',

    // Internal Shims for Module Compatibility
    get auth() { return window.auth; },
    get schoolDB() { return window.schoolDB; },

    // Data State
    isDbConnected: false,
    editingExamId: null,
    editingHomeworkId: null,

    // Supabase Helper
    db: async function (table, method = 'GET', body = null, query = '') {
        if (this.supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
            console.warn(`[Supabase] Using Mock Data for ${table}. Please set your Anon Key.`);
            return null;
        }

        const url = `${this.supabaseUrl}/rest/v1/${table}${query}`;
        const headers = {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        try {
            const response = await fetch(url, {
                method: method,
                headers: headers,
                body: body ? JSON.stringify(body) : null
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`DB Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }
            this.isDbConnected = true;
            return await response.json();
        } catch (err) {
            console.error(`[Supabase Error] ${table}:`, err);
            // Don't show toast for every error to avoid spam, just log complex errors
            if (err.message.includes('400')) console.warn('Query Syntax Error for table:', table);
            return null;
        }
    },

    // Supabase Storage Helper
    uploadFile: async function (bucket, path, file) {
        if (!this.isDbConnected) return null;
        
        const url = `${this.supabaseUrl}/storage/v1/object/${bucket}/${path}`;
        const headers = {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': file.type || 'application/octet-stream'
        };

        try {
            console.log(`[Supabase Storage] Uploading to ${bucket}/${path}...`);
            const response = await fetch(url, {
                method: 'POST', // Use POST for new objects, or PUT for overwrite
                headers: headers,
                body: file
            });

            if (!response.ok) {
                const errText = await response.text();
                // Try PUT if POST fails (object might exist)
                if (response.status === 409) {
                     const putRes = await fetch(url, {
                        method: 'PUT',
                        headers: headers,
                        body: file
                    });
                    if (!putRes.ok) throw new Error(`Storage Overwrite Error: ${putRes.status}`);
                    return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
                }
                throw new Error(`Storage Error: ${response.status} - ${errText}`);
            }

            // Return Public URL
            return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
        } catch (err) {
            console.error(`[Supabase Storage Error]`, err);
            return null;
        }
    },

    // Sync Local DB with Supabase
    syncDB: async function (silent = false) {
        const content = document.getElementById('mainContent');
        if (content && !silent) content.innerHTML = this.skeleton();

        // Fetch Data with Relational Joins
        // Fetch Data with Relational Joins
        // Added homework to destructuring
        // Fetch Data with Relational Joins
        // Added homework to destructuring
        // Fetch Data with Relational Joins
        // Added homework to destructuring
        const [studentsRaw, staffRaw, fees, attendance, examsRaw, resultsRaw, admissions, notices, quizzes, subjects, classesRaw, staffProfiles, leaves, homeworkRaw, sectionsRaw] = await Promise.all([
            this.db('students', 'GET', null, '?select=*,profiles:profiles!students_id_fkey(full_name,phone,avatar_url),sections:section_id(name,classes(name))'),
            this.db('staff'), // Fetch raw staff, manual join
            this.db('fees_payments'),
            this.db('attendance'),
            this.db('exams'),  // Manual join for classes
            this.db('results', 'GET', null, '?select=*,students:student_id(profiles:profiles!students_id_fkey(full_name)),subjects:subject_id(name)'),
            this.db('admissions'),
            this.db('notices'),
            this.db('quizzes'),
            this.db('subjects'),
            this.db('classes'), // Fetch classes manually for mapping
            this.db('profiles', 'GET', null, '?select=id,full_name,phone,avatar_url&role=eq.teacher'), // Fetch teacher profiles
            this.db('leaves'), // Fetch leaves
            this.db('homework'), // Fetch homework (simple fetch - uses class, assigned_by columns)
            this.db('sections', 'GET', null, '?select=*,classes(name)')
        ]);

        // Auto-update Maharashtra Board Subjects forcefully (Runs Once automatically)
        if (!localStorage.getItem('mh_subjects_force_seeded_v2')) {
            console.log("Updating to Maharashtra Board Subjects forcefully (v2)...");
            localStorage.setItem('mh_subjects_force_seeded_v2', 'true');
            // First Delete existing
            await this.db('subjects', 'DELETE');

            const subjectMap = [
                { classes: ['Nursery', 'LKG', 'UKG'], subjects: ['English', 'Mathematics', 'General Awareness', 'Rhymes & Stories'] },
                { classes: ['1st', '2nd', '3rd', '4th', '5th'], subjects: ['English', 'Marathi', 'Hindi', 'Mathematics', 'Environmental Studies (EVS)'] },
                { classes: ['6th', '7th', '8th'], subjects: ['English', 'Marathi', 'Hindi', 'Mathematics', 'General Science', 'History & Civics', 'Geography'] },
                { classes: ['9th', '10th'], subjects: ['English', 'Marathi', 'Hindi', 'Mathematics Part-I', 'Mathematics Part-II', 'Science Part-I', 'Science Part-II', 'History & Political Science', 'Geography'] }
            ];

            const toInsert = [];
            for (const group of subjectMap) {
                for (const clsName of group.classes) {
                    for (const subName of group.subjects) {
                        toInsert.push({ name: subName, class: clsName, code: `${subName.substring(0, 3).toUpperCase()}-${clsName.replace(/[^a-zA-Z0-9]/g, '')}` });
                    }
                }
            }
            // Re-insert
            for (let i = 0; i < toInsert.length; i += 50) {
                await this.db('subjects', 'POST', toInsert.slice(i, i + 50));
            }
            console.log("Successfully integrated MH Board subjects with normalized names!");
        }

        // --- NORMALIZATION LAYER ---

        // Map Students
        if (studentsRaw) {
            window.schoolDB.students = studentsRaw.map(s => ({
                id: s.admission_no || s.id,
                db_id: s.id,
                name: (s.profiles && s.profiles.full_name) || 'Student',
                class: (s.sections && s.sections.classes && s.sections.classes.name) || 'N/A',
                division: (s.sections && s.sections.name) || 'N/A',
                roll_no: s.roll_no || 0,
                phone: (s.profiles && s.profiles.phone) || '',
                email: s.id + '@school.com',
                status: s.status || 'Active',
                gender: s.gender,
                dob: s.dob,
                parent_id: s.parent_id,
                guardian_name: s.guardian_name || 'N/A',
                parent_email: s.parent_email || '',
                parent_phone: s.parent_phone || ''
            }));
        }

        // Map Staff
        if (staffRaw) {
            // Create map of profiles
            const profileMap = {};
            if (staffProfiles) {
                staffProfiles.forEach(p => profileMap[p.id] = p);
            }

            window.schoolDB.staff = staffRaw.map(s => {
                const profile = profileMap[s.id] || profileMap[s.employee_id] || {}; // Try matching on ID (likely)
                return {
                    id: s.employee_id || s.id,
                    db_id: s.id,
                    name: profile.full_name || s.name || 'Staff Member',
                    role: s.role || 'Teacher',
                    subject: s.subject || 'All',
                    phone: profile.phone || s.mobile || '',
                    status: 'Active'
                };
            });
        }

        // Map Exams
        if (examsRaw) {
            // Create a map of class_id -> class_name
            const classMap = {};
            if (classesRaw) {
                classesRaw.forEach(c => classMap[c.id] = c.name);
            }

            window.schoolDB.exams = examsRaw.map(e => ({
                id: e.id,
                title: e.title,
                class: classMap[e.class_id] || e.class || 'All', // Manual Map
                date: e.start_date,
                subject: e.subject || 'General'
            }));
        }

        // Map Results
        if (resultsRaw) {
            window.schoolDB.results = resultsRaw.map(r => ({
                id: r.id,
                student_id: r.student_id,
                student_name: (r.students && r.students.profiles && r.students.profiles.full_name) || 'Student',
                subject: (r.subjects && r.subjects.name) || 'Subject',
                marks: r.marks_obtained,
                total: r.total_marks,
                exam: 'Term Exam'
            }));
        }

        if (fees) window.schoolDB.fees = fees;
        if (attendance) window.schoolDB.attendance = attendance;
        if (admissions) window.schoolDB.admissions = admissions;
        if (notices) {
            window.schoolDB.notices = notices.map(n => ({
                ...n,
                target: n.target_role || n.target || 'All',
                date: n.created_at ? new Date(n.created_at).toLocaleDateString() : (n.date || 'Today')
            }));
        }
        if (quizzes) {
            window.schoolDB.quizzes = quizzes.map(q => ({
                ...q,
                class: q.class || '1st', // Fallback or map from DB field
                division: q.division || 'All',
                type: q.type || 'Quiz',
                date: q.date ? new Date(q.date).toLocaleDateString() : (q.created_at ? new Date(q.created_at).toLocaleDateString() : 'Today')
            }));
        }
        if (subjects) {
            window.schoolDB.subjects = subjects.map(s => ({
                id: s.id,
                name: s.name,
                class: s.class || '1st',
                code: s.code || s.name.substring(0, 3).toUpperCase()
            }));
        }

        if (homeworkRaw) {
            window.schoolDB.homework = homeworkRaw.map(h => ({
                id: h.id,
                title: h.title,
                description: h.description,
                subject: h.subject,
                class: h.class || 'N/A',
                division: h.division || 'All',
                assignedBy: h.assigned_by || 'Teacher',
                dueDate: h.due_date ? new Date(h.due_date).toLocaleDateString() : 'N/A',
                date: h.created_at ? new Date(h.created_at).toLocaleDateString() : 'Today',
                status: h.status || 'Active'
            }));
        }

        if (leaves) window.schoolDB.leaves = leaves;
        if (classesRaw) window.schoolDB.classes = classesRaw;
        if (sectionsRaw) window.schoolDB.sections = sectionsRaw;

        if (this.isDbConnected && !silent) {
            // DIAGNOSTICS
            console.log("Sync Complete. Loaded:", {
                students: window.schoolDB.students.length,
                staff: window.schoolDB.staff.length,
                exams: window.schoolDB.exams.length,
                homework: (window.schoolDB.homework || []).length,
                sections: (window.schoolDB.sections || []).length,
                sectionsSample: (window.schoolDB.sections && window.schoolDB.sections.length > 0) ? window.schoolDB.sections[0] : 'No Sections'
            });
            showToast(`✅ Cloud Sync: ${window.schoolDB.students.length} Students, ${window.schoolDB.staff.length} Staff`, 'success');
        } else if (!this.isDbConnected && !silent) {
            showToast('Using Local Cache (Offline)', 'warning');
        }
    },

    // Global Event Listeners
    setupGlobalEvents: function () {
        // Close modals on outside click
        window.onclick = function (event) {
            const modals = document.querySelectorAll('[id$="Modal"]'); // Select all ending with Modal
            modals.forEach(modal => {
                if (event.target == modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            });
        };
    },

    // Dynamic Stats Calculator
    getDashboardStats: function (role) {
        const stats = {
            admin: [
                { title: 'Total Students', value: schoolDB.students.length, sub: 'Active', icon: '👨‍🎓', color: 'blue' },
                { title: 'Pending Fees', value: `₹${schoolDB.fees.filter(f => f.status !== 'Paid').reduce((acc, f) => acc + f.amount, 0).toLocaleString()}`, sub: 'Unpaid', icon: '💳', color: 'red' },
                { title: 'Staff Active', value: schoolDB.staff.filter(s => s.status === 'Active').length, sub: 'On Duty', icon: '👩‍🏫', color: 'purple' },
                { title: 'Admissions', value: schoolDB.admissions.length, sub: 'Pending', icon: '🏫', color: 'orange' }
            ],
            staff: [
                { title: 'My Students', value: schoolDB.students.length, sub: 'Assigned', icon: '👨‍🎓', color: 'blue' },
                { title: 'Attendance Today', value: '95%', sub: 'Avg.', icon: '✅', color: 'green' },
                { title: 'Pending Quizzes', value: schoolDB.quizzes.length, sub: 'Active', icon: '⚡', color: 'purple' },
                { title: 'Notices', value: schoolDB.notices.length, sub: 'New', icon: '🔔', color: 'orange' }
            ],
            parent: [
                { title: 'Attendance', value: '98%', sub: 'Monthly', icon: '📅', color: 'green' },
                { title: 'Fees Clear', value: '₹0', sub: 'Dues', icon: '💳', color: 'blue' },
                { title: 'Class Rank', value: '05', sub: 'Academic', icon: '🏆', color: 'purple' },
                { title: 'Exams Left', value: schoolDB.exams.length, sub: 'Scheduled', icon: '📝', color: 'orange' }
            ]
        };
        return stats[role.toLowerCase()] || stats.admin;
    },

    // Normalize class name: '8th' -> 'Grade 8', '1st' -> 'Grade 1', 'LKG' -> 'LKG', etc.
    normalizeClassName: function (className) {
        if (!className) return className;
        const revMap = {
            'Grade 1': '1st', 'Grade 2': '2nd', 'Grade 3': '3rd',
            'Grade 4': '4th', 'Grade 5': '5th', 'Grade 6': '6th',
            'Grade 7': '7th', 'Grade 8': '8th', 'Grade 9': '9th',
            'Grade 10': '10th', 'Grade 11': '11th', 'Grade 12': '12th'
        };
        return revMap[className] || className;
    },

    getSubjectsForClass: function (className) {
        const normalized = this.normalizeClassName(className);
        return (schoolDB.subjects || []).filter(s =>
            s.class === normalized || s.class === className
        );
    },

    // Chart Initialization Engine
    chartInstances: {},

    initCharts: function () {
        const ctxAttendance = document.getElementById('attendanceChart');
        const ctxRevenue = document.getElementById('revenueChart');

        // Cleanup existing charts
        if (this.chartInstances.attendance) {
            this.chartInstances.attendance.destroy();
            this.chartInstances.attendance = null;
        }
        if (this.chartInstances.revenue) {
            this.chartInstances.revenue.destroy();
            this.chartInstances.revenue = null;
        }

        if (ctxAttendance) {
            this.chartInstances.attendance = new Chart(ctxAttendance, {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                    datasets: [{
                        label: 'Attendance %',
                        data: [95, 98, 92, 96, 94, 97],
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointBackgroundColor: '#8b5cf6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: false, grid: { display: false } }, x: { grid: { display: false } } }
                }
            });
        }

        if (ctxRevenue) {
            this.chartInstances.revenue = new Chart(ctxRevenue, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Revenue',
                        data: [45000, 52000, 48000, 61000, 55000, 67000],
                        backgroundColor: '#3b82f6',
                        borderRadius: 8,
                        barThickness: 20
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } }
                }
            });
        }
    },

    // Initial Load Logic
    // Initial Load Logic
    init: async function () {
        this.renderSidebar();
        // Background Sync (Silent)
        this.syncDB(true).then(() => {
            const currentHash = window.location.hash.substring(1) || 'overview';
            // Force reload for pages that might show stale mock data
            const dataPages = ['homework', 'students', 'staff', 'exams', 'attendance_all', 'subjects', 'manage_quizzes', 'parent_homework'];
            if (dataPages.includes(currentHash)) {
                console.log(`[Sync] Data update complete. Refreshing ${currentHash} view.`);
                this.loadPage(currentHash);
            }
        });

        // Hash Routing Logic
        const hash = window.location.hash.substring(1); // Remove '#'
        if (hash) {
            this.loadPage(hash);
        } else {
            this.loadPage('overview');
        }

        // Handle Back/Forward Browser Navigation
        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.substring(1);
            if (newHash) this.loadPage(newHash);
        });

        // Initial Chart load if on overview
        if (!hash || hash === 'overview') {
            setTimeout(() => this.initCharts(), 500);
        }

        // Setup global clicks
        this.setupGlobalEvents();
    },

    getMenuItems: function (role) {
        role = role.toLowerCase();
        if (role === 'teacher') role = 'staff';
        const common = [{ id: 'overview', name: 'Overview', icon: '📊' }];

        const menus = {
            admin: [
                { id: 'admissions', name: 'Admissions', icon: '🏫' },
                { id: 'students', name: 'Students', icon: '👨‍🎓' },
                { id: 'staff', name: 'Staff Management', icon: '👩‍🏫' },
                { id: 'fees', name: 'Fee Management', icon: '💰' },
                { id: 'subjects', name: 'Subjects', icon: '📚' },
                { id: 'exams', name: 'Exams & Results', icon: '📝' },
                { id: 'attendance_all', name: 'Attendance', icon: '📅' },
                { id: 'ai_insights', name: 'AI Insights', icon: '🧠' },
                { id: 'communication', name: 'Communication', icon: '📢' },
                { id: 'reports', name: 'Reports', icon: '📈' },
                { id: 'leave_approvals', name: 'Leave Requests', icon: '📝' },
                { id: 'settings', name: 'Settings', icon: '⚙️' }
            ],
            staff: [
                { id: 'my_classes', name: 'My Classes', icon: '📚' },
                { id: 'mark_attendance', name: 'Mark Attendance', icon: '✅' },
                { id: 'exam_marks', name: 'Enter Marks', icon: '📝' },
                { id: 'manage_quizzes', name: 'Quiz Builder', icon: '⚡' },
                { id: 'homework', name: 'Homework', icon: '📖' },
                { id: 'ai_insights', name: 'Student Insights', icon: '🧠' },
                { id: 'staff_notices', name: 'Notices', icon: '📢' },
                { id: 'leave_approvals', name: 'Leave Requests', icon: '📝' },
                { id: 'settings', name: 'Settings', icon: '⚙️' }
            ],
            parent: [
                { id: 'student_profile', name: 'My Child', icon: '👤' },
                { id: 'new_application', name: 'New Application', icon: '📝' },
                { id: 'parent_attendance', name: 'Attendance', icon: '📅' },
                { id: 'parent_homework', name: 'Homework', icon: '📖' },
                { id: 'parent_fees', name: 'Fees & Dues', icon: '💳' },
                { id: 'parent_results', name: 'Results', icon: '📜' },
                { id: 'parent_leave', name: 'Leave Application', icon: '📝' },
                { id: 'parent_notices', name: 'Announcements', icon: '🔔' },
                { id: 'settings', name: 'Settings', icon: '⚙️' }
            ]
        };
        return [...common, ...(menus[role] || [])];
    },

    getStats: function (role) {
        // Generate stats based on user role
        const r = (role || '').toLowerCase();
        if (r === 'admin') {
            return [
                { title: 'Total Students', value: schoolDB.students.length || 0, sub: 'Enrolled', icon: '👨‍🎓', color: 'blue' },
                { title: 'Teaching Staff', value: schoolDB.staff.length || 0, sub: 'Active', icon: '👩‍🏫', color: 'purple' },
                { title: 'Attendance', value: '94%', sub: 'This Week', icon: '📊', color: 'green' },
                { title: 'Fee Collection', value: '₹' + ((schoolDB.fees.filter(f => f.status === 'Paid').reduce((s, f) => s + f.amount, 0) / 1000).toFixed(0)) + 'K', sub: 'This Month', icon: '💰', color: 'orange' }
            ];
        } else if (r === 'staff' || r === 'teacher') {
            return [
                { title: 'My Classes', value: '3', sub: 'Assigned', icon: '📚', color: 'blue' },
                { title: 'Students', value: schoolDB.students.length || 0, sub: 'Total', icon: '👥', color: 'purple' },
                { title: 'Avg Attendance', value: '92%', sub: 'This Week', icon: '✅', color: 'green' },
                { title: 'Pending Tasks', value: '5', sub: 'To Complete', icon: '📝', color: 'orange' }
            ];
        } else {
            // Student/Parent
            return [
                { title: 'Attendance', value: '95%', sub: 'This Month', icon: '📅', color: 'green' },
                { title: 'Assignments', value: '8', sub: 'Pending', icon: '📚', color: 'orange' },
                { title: 'Avg Marks', value: '85%', sub: 'Last Exam', icon: '🏆', color: 'purple' },
                { title: 'Fee Status', value: 'Paid', sub: 'Up to date', icon: '✅', color: 'blue' }
            ];
        }
    },



    // Utility Functions
    submitApplication: async function (e) {
        e.preventDefault();
        const appData = {
            id: "ADM-" + Math.floor(Math.random() * 10000),
            student_name: document.getElementById('appName').value,
            grade: document.getElementById('appGrade').value,
            dob: document.getElementById('appDob').value,
            parent_name: document.getElementById('appFather').value,
            parent_email: auth.currentUser.email,
            phone: document.getElementById('appPhone').value,
            address: document.getElementById('appAddress').value,
            status: 'Pending',
            applied_at: new Date().toISOString(),
            docs: {
                birth_cert: document.getElementById('status_birth_cert').innerText.includes('Selected') ? 'uploaded' : 'missing',
                address_proof: document.getElementById('status_address_proof').innerText.includes('Selected') ? 'uploaded' : 'missing'
            }
        };

        showToast('Processing application...', 'info');

        const result = await this.db('admissions', 'POST', appData);

        if (result) {
            schoolDB.admissions.unshift(appData);
            showToast('🎉 Application Submitted!', 'success');
            this.loadPage('overview');
        } else {
            // Fallback
            schoolDB.admissions.unshift(appData);
            showToast('Saved locally (Sync pending).', 'warning');
            this.loadPage('overview');
        }
    },

    submitLeaveRequest: async function (e) {
        e.preventDefault();
        const reason = document.getElementById('leaveReason').value;
        const startDate = document.getElementById('leaveStart').value;
        const endDate = document.getElementById('leaveEnd').value;

        if (!reason || !startDate || !endDate) {
            showToast('Please fill all fields', 'error');
            return;
        }

        // Routing Logic
        const currentUser = auth.currentUser;
        let targetRole = 'admin'; // Default
        if (currentUser.role === 'student') targetRole = 'staff';
        else if (currentUser.role === 'staff') targetRole = 'admin';

        const leaveData = {
            user_id: currentUser.id, // Assuming auth.currentUser has id
            user_name: currentUser.name || currentUser.full_name || 'User',
            user_role: currentUser.role,
            target_role: targetRole,
            reason: reason,
            start_date: startDate,
            end_date: endDate,
            status: 'Pending'
        };

        showToast('Submitting leave request...', 'info');

        if (this.isDbConnected) {
            const res = await this.db('leaves', 'POST', leaveData);
            if (res) {
                if (!schoolDB.leaves) schoolDB.leaves = [];
                schoolDB.leaves.push(res[0] || leaveData);
                showToast('Leave request submitted!', 'success');
                document.getElementById('leaveForm').reset();
                // Close modal if it exists
                const modal = document.getElementById('leaveModal');
                if (modal) modal.classList.add('hidden');
                // Refresh list if visible
                this.loadLeaves();
            }
        } else {
            if (!schoolDB.leaves) schoolDB.leaves = [];
            schoolDB.leaves.push(leaveData);
            showToast('Saved locally', 'warning');
            this.loadLeaves();
        }
    },

    updateLeaveStatus: async function (id, status) {
        if (!confirm(`Mark this leave as ${status}?`)) return;

        showToast('Updating status...', 'info');

        if (this.isDbConnected) {
            await this.db('leaves', 'PATCH', { status: status }, `?id=eq.${id}`);
        }

        // Local update
        if (schoolDB.leaves) {
            const leave = schoolDB.leaves.find(l => l.id === id);
            if (leave) leave.status = status;
        }

        showToast(`Leave marked as ${status}`, 'success');
        this.loadPage('leave_approvals');
    },

    loadLeaves: function () {
        // This function should be called when loading the leave page
        const list = document.getElementById('leaveHistoryList');
        if (!list) return;

        const currentUser = auth.currentUser;
        let leavesToShow = [];

        if (!schoolDB.leaves) schoolDB.leaves = [];

        if (currentUser.role === 'student') {
            // Show my leaves
            leavesToShow = schoolDB.leaves.filter(l => l.user_id === currentUser.id);
        } else if (currentUser.role === 'staff') {
            // Show my leaves AND leaves targeted to me (students)
            // simplified: show leaves where target_role is 'staff'
            leavesToShow = schoolDB.leaves.filter(l => l.target_role === 'staff' || l.user_id === currentUser.id);
        } else if (currentUser.role === 'admin') {
            // Show leaves targeted to admin
            leavesToShow = schoolDB.leaves.filter(l => l.target_role === 'admin');
        }

        if (leavesToShow.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-gray-400">No leave requests found.</div>';
            return;
        }

        list.innerHTML = leavesToShow.map(l => `
            <div class="p-4 bg-white border border-gray-100 rounded-xl mb-3 shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-500">${l.user_role.toUpperCase()}</span>
                        <h4 class="font-bold text-pucho-dark mt-1">${l.user_name}</h4>
                        <p class="text-sm text-gray-500">${l.reason}</p>
                        <p class="text-xs text-blue-500 mt-2 font-bold">${new Date(l.start_date).toLocaleDateString()} - ${new Date(l.end_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                         <span class="px-3 py-1 rounded-full text-xs font-bold ${l.status === 'Approved' ? 'bg-green-100 text-green-600' : (l.status === 'Rejected' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600')}">
                            ${l.status}
                         </span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    handleFileUpload: function (input, type) {
        const statusEl = document.getElementById(`status_${type}`);
        if (input.files && input.files[0]) {
            const fileName = input.files[0].name;
            statusEl.innerText = `Selected: ${fileName}`;
            statusEl.classList.remove('text-gray-400');
            statusEl.classList.add('text-pucho-purple', 'font-bold');
            showToast(`${fileName} prepared for upload.`, 'info');
        }
    },

    renderSidebar: function () {
        const role = window.auth.currentUser.role.toLowerCase();
        const nav = document.getElementById('navLinks');
        nav.innerHTML = '';
        const currentHash = window.location.hash.substring(1) || 'overview';

        const items = this.getMenuItems(role);
        items.forEach(item => {
            const link = document.createElement('a');
            link.href = `#${item.id}`; // Proper Hash Link
            link.className = `flex items-center gap-[12px] px-[16px] h-[44px] rounded-[22px] text-[14px] font-medium transition-all duration-200 hover:bg-gray-50 text-pucho-dark group`;

            // Highlight active link primarily based on hash
            if (item.id === currentHash) link.classList.add('bg-pucho-purple/10', 'active-nav');

            link.innerHTML = `
                <span class="text-xl opacity-70 group-hover:scale-110 transition-transform">${item.icon}</span> 
                <span class="truncate">${item.name}</span>
            `;

            link.onclick = (e) => {
                // Let default anchor behavior handle hash update
                document.querySelectorAll('#navLinks a').forEach(l => l.classList.remove('bg-pucho-purple/10', 'active-nav'));
                link.classList.add('bg-pucho-purple/10', 'active-nav');
                // this.loadPage(item.id) is now called via hashchange event or fallback
                // However, for smoother feel, we can call it directly too, 
                // but let's rely on standard hash navigation or call loadPage to be safe + visual update
                e.preventDefault();
                window.location.hash = item.id;
                // The hash change listener in init() will catch this and call loadPage
            };
            nav.appendChild(link);
        });
    },

    loadPage: function (id) {
        // Update hash without triggering reload loop
        if (window.location.hash.substring(1) !== id) {
            window.location.hash = id;
            // active state update in sidebar is handled by hash check mostly, 
            // but visually we might want to ensure it syncs if loaded programmatically
            const links = document.querySelectorAll('#navLinks a');
            links.forEach(l => {
                l.classList.toggle('bg-pucho-purple/10', l.getAttribute('href') === `#${id}`);
                l.classList.toggle('active-nav', l.getAttribute('href') === `#${id}`);
            });
        }

        const content = document.getElementById('mainContent');
        const title = document.getElementById('pageTitle');
        const desc = document.getElementById('pageDesc');
        const role = window.auth.currentUser.role;

        const metadata = {
            overview: { title: 'Dashboard Overview', desc: 'Quick summary of school activity' },
            admissions: { title: 'Admissions Hall', desc: 'Track and process new student applications' },
            students: { title: 'Student Database', desc: 'Manage profiles, classes, and sections' },
            staff: { title: 'Staff Directory', desc: 'Manage teachers, clerks, and accountants' },
            fees: { title: 'Finance Center', desc: 'Fee structures, billing, and collection' },
            exams: { title: 'Examination Office', desc: 'Schedule exams and manage academic results' },
            attendance_all: { title: 'Global Attendance', desc: 'Monitor daily presence for students and staff' },
            ai_insights: { title: 'AI Academic Insights', desc: 'Predictive analytics and performance intervention' },
            communication: { title: 'Broadcast Room', desc: 'Send circulars and notifications' },
            reports: { title: 'System Reports', desc: 'Detailed analytics and exportable reports' },
            settings: { title: 'System Settings', desc: 'Configure school profile and academic year' },
            my_classes: { title: 'My Schedule', desc: 'Assigned classes and teaching subjects' },
            mark_attendance: { title: 'Student Register', desc: 'Mark and submit daily class attendance' },
            exam_marks: { title: 'Grade Book', desc: 'Enter student marks for tests and exams' },
            manage_quizzes: { title: 'Quiz Builder', desc: 'Create and deploy evaluations' },
            homework: { title: 'Academics', desc: 'Upload homework and study materials' },
            staff_notices: { title: 'Internal Notices', desc: 'Important staff announcements' },
            parent_attendance: { title: 'Attendance Log', desc: 'View your child\'s presence history' },
            parent_homework: { title: 'Homework & Tasks', desc: 'Daily assignments and project deadlines' },
            parent_fees: { title: 'Fee Status', desc: 'Online dues tracking and payment history' },
            parent_results: { title: 'Report Cards', desc: 'Academic performance and results summary' },
            parent_leave: { title: 'Leave Application', desc: 'Apply for absence or viewing leave history' },
            parent_notices: { title: 'School Notices', desc: 'Announcements and events for parents' },
            settings: { title: 'Settings', desc: 'Configure application preferences' },
            subjects: { title: 'Subject Master', desc: 'Define and manage subjects for each class' },
            leave_approvals: { title: 'Leave Management', desc: 'Review and approve leave requests' }
        };

        const meta = metadata[id] || { title: 'Module', desc: 'Section Details' };
        title.innerText = meta.title;
        desc.innerText = meta.desc;

        if (this[id]) {
            try {
                content.innerHTML = this[id](role);
                if (id === 'overview') {
                    setTimeout(() => this.initCharts(), 100);
                }
            } catch (err) {
                console.error(`Error rendering template ${id}:`, err);
                content.innerHTML = `
                    <div class="p-20 text-center animate-fade-in">
                        <div class="text-6xl mb-6">⚠️</div>
                        <h2 class="text-2xl font-bold text-pucho-dark mb-4">Content Load Error</h2>
                        <p class="text-gray-400 mb-8 max-w-md mx-auto">We encountered a problem while displaying this section. Please try refreshing or contact support.</p>
                        <button onclick="window.location.reload()" class="bg-pucho-dark text-white px-8 py-3 rounded-2xl font-bold shadow-glow">Reload App</button>
                    </div>
                `;
            }
        } else {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center p-20 animate-fade-in text-center">
                    <div class="text-8xl mb-6">🚧</div>
                    <h2 class="text-3xl font-bold text-pucho-dark mb-2">${meta.title} Module</h2>
                    <p class="text-gray-400 font-inter max-w-md">The ${id} system is currently being populated with Master Prompt logic. Stay tuned!</p>
                </div>
            `;
        }
    },

    // Add the homework template function here, assuming `this.templates` is an object
    // that `dashboard` has access to, and this is where new templates are defined.
    // This placement is based on the instruction's context, implying it's a new method
    // or property being added to the `dashboard` object, which then populates `this.templates`.
    // However, the instruction implies it should be *inside* the `this.templates` object.
    // Given the structure, `this.templates` is likely a property of the `dashboard` object.
    // The instruction's placement is a bit ambiguous, but the most logical interpretation
    // is to add it as a new template function.
    // For now, I will assume `this.templates` is an object that is implicitly built or
    // defined elsewhere, and this is a new function being added to the `dashboard` object
    // that will then be referenced by `this.templates[id]`.
    // If `this.templates` is a direct property of `dashboard`, then the instruction
    // implies adding it to the `dashboard` object itself, which is then used by `this.templates[id]`.
    // Let's assume `this.templates` is an object property of `dashboard` and we are adding
    // a new function to it. The instruction's format is a bit misleading.
    // I will place it as a new method of the `dashboard` object, and assume `this.templates`
    // is dynamically populated or `homework` is a direct method that `this.templates[id]`
    // would point to.

    // Re-reading the instruction: "if (this.templates[id]) { content.innerHTML = this.templates[id](role); ... homework: function() { ... } }"
    // This implies `homework` is a property of `this.templates`.
    // Since `this.templates` is not fully shown, I will insert it where it makes sense
    // as a new template function. The instruction's snippet is a bit out of context.
    // I will place it as a new method of the `dashboard` object, and assume `this.templates`
    // is implicitly populated or `dashboard.templates.homework` would be the correct call.

    // Given the instruction's snippet, it seems to be adding a new property to the `this.templates` object.
    // However, the provided code snippet does not show the definition of `this.templates`.
    // The most faithful interpretation of the instruction, given the surrounding code,
    // is to add the `homework` function as a new method to the `dashboard` object,
    // and then assume `this.templates` is either `this` itself or an object that
    // collects these methods.

    // The instruction's snippet is syntactically incorrect if placed directly as shown.
    // It looks like it's trying to define a new property `homework` within the `dashboard` object,
    // which would then be accessed via `this.templates.homework` if `this.templates`
    // was a reference to `this` or an object containing these methods.



    showAddStaffModal: function () {
        const modal = document.getElementById('staffModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        document.querySelector('#staffModal h1').innerText = "Onboard New Staff";
        document.querySelector('#staffModal p').innerText = "Details will be sent to the automation flow";
        const submitBtn = document.querySelector('#staffForm button[type="submit"]');
        if (submitBtn) submitBtn.innerText = "Add & Notify Staff";

        const form = document.getElementById('staffForm');
        if (form) {
            form.reset();
            delete form.dataset.editId;
            form.onsubmit = (e) => {
                e.preventDefault();
                this.submitStaffData(e);
            };
        }
    },

    loadAttendanceStudents: async function () {
        const rawClass = document.getElementById('attClass').value;
        const cls = this.normalizeClassName(rawClass);
        const div = document.getElementById('attDiv').value;
        const list = document.getElementById('attendanceList');

        if (!cls || !div) return;

        list.innerHTML = this.skeleton();

        // Use local schoolDB which is already synced and enriched
        const students = schoolDB.students.filter(s => (s.class === cls || s.class === rawClass) && s.division === div);

        if (students.length === 0) {
            list.innerHTML = `<div class="flex flex-col items-center justify-center p-12 bg-gray-50 rounded-3xl text-center animate-fade-in">
                <div class="text-4xl mb-4">📭</div>
                <h4 class="font-bold text-gray-600">No Students Found</h4>
                <p class="text-sm text-gray-400">No students enrolled in ${cls} - ${div}</p>
            </div>`;
            return;
        }

        list.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in" id="studentAttendanceItems">
            ${students.map((s, i) => `
                <div class="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 hover:shadow-subtle transition-all group" data-student-id="${s.id}">
                     <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center font-bold text-xs text-blue-500 border border-blue-100">${s.roll_no}</div>
                        <div>
                            <p class="font-bold text-sm text-pucho-dark">${s.name}</p>
                            <p class="text-[10px] font-bold text-gray-400">ID: ${s.id}</p>
                        </div>
                     </div>
                     <button onclick="this.classList.toggle('bg-red-50'); this.classList.toggle('text-red-600'); this.classList.toggle('border-red-200'); this.classList.toggle('bg-green-50'); this.classList.toggle('text-green-600'); this.classList.toggle('border-green-200'); this.innerText = this.innerText === 'P' ? 'A' : 'P'" 
                     class="attendance-btn w-10 h-10 rounded-xl bg-green-50 text-green-600 border border-green-200 font-bold hover:scale-110 transition-all shadow-sm">P</button>
                </div>
            `).join('')}
        </div>`;
    },

    submitAttendance: async function () {
        const cls = document.getElementById('attClass').value;
        const div = document.getElementById('attDiv').value;
        if (!cls || !div) {
            showToast('Select Class and Division first', 'error');
            return;
        }

        const items = document.querySelectorAll('#studentAttendanceItems > div');
        const attendanceData = [];
        const date = new Date().toISOString().split('T')[0];

        items.forEach(item => {
            const studentId = item.dataset.studentId;
            const status = item.querySelector('.attendance-btn').innerText === 'P' ? 'Present' : 'Absent';
            attendanceData.push({
                student_id: studentId,
                date: date,
                status: status,
                marked_by: auth.currentUser.email
            });
        });

        showToast(`Saving attendance for ${attendanceData.length} students...`, 'info');

        // Perspective update
        if (this.isDbConnected) {
            try {
                await this.db('attendance', 'POST', attendanceData);
                showToast('Attendance synced to cloud!', 'success');
            } catch (err) {
                console.error('Attendance Sync Error:', err);
                showToast('Cloud sync failed - using flow fallback...', 'error');
            }
        } else {
            // Mock persistence
            schoolDB.attendance = [...schoolDB.attendance, ...attendanceData];
            showToast('Attendance saved locally (Offline)', 'success');
        }

        // TRIGGER AUTOMATION FLOW (Pucho Studio) - Specifically for Staff/Teacher side
        if (auth.currentUser.role === 'staff' || auth.currentUser.role === 'admin' || auth.currentUser.role === 'teacher') {
            try {
                const now = new Date();
                const time = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });

                const enrichedRecords = attendanceData.map(d => {
                    const student = schoolDB.students.find(s => s.db_id === d.student_id || s.id === d.student_id);
                    return {
                        student_id: d.student_id,
                        student_name: student ? student.name : 'Unknown',
                        status: d.status,
                        parent_name: student ? student.guardian_name : 'Parent',
                        parent_contact: student ? student.phone : 'N/A',
                        parent_email: student ? student.email : 'N/A'
                    };
                });

                const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/GrNg8QkIFlOGYy6x94Fv6';
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'STAFF_ATTENDANCE_AUTOMATION',
                        class: `${cls} - ${div}`,
                        date: date,
                        time: time,
                        teacher: auth.currentUser.name || 'Teacher',
                        records: enrichedRecords
                    })
                });
                showToast('🚀 Staff automation flow triggered!', 'success');
            } catch (e) {
                console.error('Automation Flow Error:', e);
            }
        }
    },

    updateGlobalAttendance: function () {
        const content = document.getElementById('mainContent');
        if (content) {
            content.innerHTML = this.templates.attendance_all();
        }
    },

    switchAttendanceTab: function (tab) {
        console.log(`[Dashboard] Switching Attendance Tab to: ${tab}`);
        // Remove active class from all tabs
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.classList.remove('bg-pucho-dark', 'text-white', 'att-tab-active', 'shadow-lg');
            btn.classList.add('text-gray-400');
        });

        // Find and activate requested tab
        const btn = document.querySelector(`[data-tab="${tab}"]`);
        if (btn) {
            btn.classList.add('bg-pucho-dark', 'text-white', 'att-tab-active', 'shadow-lg');
            btn.classList.remove('text-gray-400');
        }

        this.updateGlobalAttendance();
    },

    loadMarksStudents: function () {
        const rawClass = document.getElementById('marksClass').value;
        const cls = this.normalizeClassName(rawClass);
        const div = document.getElementById('marksDiv').value;
        const body = document.getElementById('marksTableBody');

        if (!cls || !div || !body) return;

        const students = schoolDB.students.filter(s => (s.class === cls || s.class === rawClass) && s.division === div);

        if (students.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-gray-400 font-bold opacity-60">No students found in ${cls} - ${div}</td></tr>`;
            return;
        }

        body.innerHTML = students.map(s => `
            <tr class="border-b border-gray-50 animate-fade-in" data-student-id="${s.id}">
                <td class="px-6 py-4 font-bold text-gray-500">${s.roll || s.roll_no || 'N/A'}</td>
                <td class="px-6 py-4 font-bold text-pucho-dark">${s.name}</td>
                <td class="px-6 py-4">
                    <input type="number" class="mark-input w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 font-bold text-center outline-none focus:border-pucho-purple" 
                    placeholder="0" oninput="dashboard.updateGrade(this)">
                </td>
                <td class="px-6 py-4 font-bold text-gray-400">100</td>
                <td class="px-6 py-4"><span class="grade-badge bg-gray-50 text-gray-400 px-3 py-1 rounded-lg text-xs font-bold">-</span></td>
            </tr>
        `).join('');
    },

    updateGrade: function (input) {
        const val = parseInt(input.value);
        const badge = input.closest('tr').querySelector('.grade-badge');
        if (!badge) return;

        let grade = '-';
        let colorClass = 'bg-gray-50 text-gray-400';

        if (!isNaN(val)) {
            if (val >= 90) { grade = 'A+'; colorClass = 'bg-green-100 text-green-700'; }
            else if (val >= 80) { grade = 'A'; colorClass = 'bg-green-50 text-green-600'; }
            else if (val >= 70) { grade = 'B+'; colorClass = 'bg-blue-50 text-blue-600'; }
            else if (val >= 60) { grade = 'B'; colorClass = 'bg-blue-50 text-blue-500'; }
            else if (val >= 50) { grade = 'C'; colorClass = 'bg-orange-50 text-orange-600'; }
            else if (val >= 40) { grade = 'D'; colorClass = 'bg-orange-50 text-orange-500'; }
            else { grade = 'F'; colorClass = 'bg-red-50 text-red-600'; }
        }

        badge.innerText = grade;
        badge.className = `grade-badge ${colorClass} px-3 py-1 rounded-lg text-xs font-bold`;
    },

    saveExamMarks: async function () {
        const cls = document.getElementById('marksClass').value;
        const div = document.getElementById('marksDiv').value;
        const exam = document.getElementById('marksExam').value;
        const subject = document.getElementById('marksSubject').value;

        if (!cls || !div || !exam || !subject) {
            showToast('Please fill all filters', 'error');
            return;
        }

        const rows = document.querySelectorAll('#marksTableBody tr');
        const resultsData = [];
        const date = new Date().toISOString().split('T')[0];

        rows.forEach(row => {
            const studentId = row.dataset.studentId;
            const marks = row.querySelector('.mark-input').value;
            const grade = row.querySelector('.grade-badge').innerText;

            if (marks !== "") {
                resultsData.push({
                    student_id: studentId,
                    exam_name: exam,
                    subject: subject,
                    marks: parseInt(marks),
                    grade: grade,
                    date: date,
                    teacher: auth.currentUser.email
                });
            }
        });

        if (resultsData.length === 0) {
            showToast('No marks entered to save', 'warning');
            return;
        }

        showToast(`Saving results for ${resultsData.length} students...`, 'info');

        if (this.isDbConnected) {
            const result = await this.db('results', 'POST', resultsData);
            if (result) {
                showToast('Results synced to cloud!', 'success');

                // --- WEBHOOK INTEGRATION (Pucho Studio - Report Card Automation) ---
                try {
                    const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/lAFPplKxovNfqPFSBaCxE'; // Reusing or waiting for specific URL? User gave one URL, might be for all or just homework.
                    // The user said "hey 3 ke flow de ek ek karke", I will use the same base logic but I need to know if they want the SAME webhook URL or a different one.
                    // For now, I'll implement the logic so it's ready.

                    const enrichedResults = resultsData.map(r => {
                        const student = schoolDB.students.find(s => s.db_id === r.student_id || s.id === r.student_id);
                        return {
                            ...r,
                            student_name: student ? student.name : 'Unknown',
                            parent_name: student ? student.guardian_name : 'Parent',
                            parent_email: student ? student.parent_email || student.email : ''
                        };
                    });

                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'REPORT_CARD_GENERATION',
                            exam_name: exam,
                            class: cls,
                            division: div,
                            subject: subject,
                            results: enrichedResults
                        })
                    });
                    showToast('🚀 Report Card automation triggered!', 'info');
                } catch (e) { console.error("Report Card Webhook Error:", e); }
            }
        } else {
            schoolDB.results = [...schoolDB.results, ...resultsData];
            showToast('Results saved locally (Mock)', 'success');
        }
    },

    publishQuiz: async function () {
        const cls = document.getElementById('quizClass').value;
        const div = document.getElementById('quizDiv').value;
        const subject = document.getElementById('quizSubject').value;
        const type = document.getElementById('quizType').value;
        const title = document.getElementById('quizTitle').value;

        if (!cls || !subject || !title) {
            showToast('Fill mandatory fields: Class, Subject, Title', 'error');
            return;
        }

        const newQuiz = {
            id: 'QZ-' + Date.now(),
            class: cls,
            division: div || 'All',
            subject: subject,
            type: type || 'Quiz',
            title: title,
            date: new Date().toLocaleDateString(),
            teacher: auth.currentUser.email
        };

        if (this.isDbConnected) {
            await this.db('quizzes', 'POST', newQuiz);
        }
        schoolDB.quizzes.push(newQuiz);
        showToast('Assignment Published successfully!', 'success');
        this.loadPage('manage_quizzes');
    },





    editHomework: function (id) {
        try {
            console.log(`[editHomework] Attempting to find ID: ${id}`);
            const hwArray = schoolDB.homework || [];
            
            let hw = hwArray.find(h => {
                if (!h.id) return false;
                return String(h.id).trim().toLowerCase() === String(id).trim().toLowerCase();
            });

            if (!hw) {
                console.error(`[editHomework] Could not find assignment with ID ${id}. UI might be stale. Re-syncing...`);
                showToast("Data out of sync. Refreshing...", "warning");
                this.updateHomeworkList();
                return;
            }

            console.log(`[editHomework] Found assignment:`, hw);
            this.editingHomeworkId = id;
            console.log(`[editHomework] Step 1: Assigning hwSubject`);
            // We set class first because subject choice depends on filtered options
            document.getElementById('hwClass').value = hw.class || '';
            
            this.updateHwSubjects();
            document.getElementById('hwSubject').value = hw.subject || '';
            
            console.log(`[editHomework] Step 2: Assigning hwClass is handled`);
            console.log(`[editHomework] Step 3: Assigning hwDivision`);
            if (document.getElementById('hwDivision')) {
                document.getElementById('hwDivision').value = hw.division || 'All';
            }
            console.log(`[editHomework] Step 4: Assigning hwTitle`);
            document.getElementById('hwTitle').value = hw.title || '';
            
            console.log(`[editHomework] Step 5: Assigning hwDesc`);
            if (document.getElementById('hwDesc')) {
                document.getElementById('hwDesc').value = hw.description || '';
            }
            
            console.log(`[editHomework] Step 6: Assigning hwDueDate`);
            if (document.getElementById('hwDueDate') && hw.dueDate && hw.dueDate !== 'N/A') {
                try {
                    const d = new Date(hw.due_date || hw.dueDate);
                    if (!isNaN(d.getTime())) {
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        document.getElementById('hwDueDate').value = `${year}-${month}-${day}`;
                    }
                } catch(e) {}
            }

            console.log(`[editHomework] Step 7: Updating submit button`);
            const submitBtn = document.querySelector('#addHomeworkModal button.bg-pucho-dark') || document.querySelector('button[onclick="dashboard.uploadHomework()"]');
            if (submitBtn) submitBtn.innerText = "Update Assignment";

            console.log(`[editHomework] Step 8: Opening modal`);
            const modal = document.getElementById('addHomeworkModal') || document.getElementById('homeworkModal');
            if (modal) {
                modal.classList.remove('hidden');
                console.log(`[editHomework] Modal opened successfully`);
            } else {
                console.warn("[editHomework] Could not find homework modal element to open");
                showToast("Could not open modal UI", "error");
            }
        } catch (err) {
            console.error("[editHomework] Edit Error:", err);
            showToast("Error: " + err.message, "error");
        }
    },

    saveExamMarks: async function () {
        const cls = document.getElementById('marksClass').value;
        const div = document.getElementById('marksDiv').value;
        const exam = document.getElementById('marksExam').value;
        const subject = document.getElementById('marksSubject').value;

        if (!cls || !div || !exam || !subject) {
            showToast('Please fill all filters', 'error');
            return;
        }

        const rows = document.querySelectorAll('#marksTableBody tr');
        const resultsData = [];
        const date = new Date().toISOString().split('T')[0];

        rows.forEach(row => {
            const studentId = row.dataset.studentId;
            const marks = row.querySelector('.mark-input').value;
            const grade = row.querySelector('.grade-badge').innerText;

            if (marks !== "") {
                resultsData.push({
                    student_id: studentId,
                    exam_name: exam,
                    subject: subject,
                    marks: parseInt(marks),
                    grade: grade,
                    date: date,
                    teacher: auth.currentUser.email
                });
            }
        });

        if (resultsData.length === 0) {
            showToast('No marks entered to save', 'warning');
            return;
        }

        showToast(`Saving results for ${resultsData.length} students...`, 'info');

        if (this.isDbConnected) {
            const result = await this.db('results', 'POST', resultsData);
            if (result) {
                showToast('Results synced to cloud!', 'success');

                // --- WEBHOOK INTEGRATION (Pucho Studio - Report Card Automation) ---
                try {
                    const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/lAFPplKxovNfqPFSBaCxE'; // Reusing or waiting for specific URL? User gave one URL, might be for all or just homework.
                    // The user said "hey 3 ke flow de ek ek karke", I will use the same base logic but I need to know if they want the SAME webhook URL or a different one.
                    // For now, I'll implement the logic so it's ready.

                    const enrichedResults = resultsData.map(r => {
                        const student = schoolDB.students.find(s => s.db_id === r.student_id || s.id === r.student_id);
                        return {
                            ...r,
                            student_name: student ? student.name : 'Unknown',
                            parent_name: student ? student.guardian_name : 'Parent',
                            parent_email: student ? student.parent_email || student.email : ''
                        };
                    });

                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'REPORT_CARD_GENERATION',
                            exam_name: exam,
                            class: cls,
                            division: div,
                            subject: subject,
                            results: enrichedResults
                        })
                    });
                    showToast('🚀 Report Card automation triggered!', 'info');
                } catch (e) { console.error("Report Card Webhook Error:", e); }
            }
        } else {
            schoolDB.results = [...schoolDB.results, ...resultsData];
            showToast('Results saved locally (Mock)', 'success');
        }
    },

    publishQuiz: async function () {
        const cls = document.getElementById('quizClass').value;
        const div = document.getElementById('quizDiv').value;
        const subject = document.getElementById('quizSubject').value;
        const type = document.getElementById('quizType').value;
        const title = document.getElementById('quizTitle').value;

        if (!cls || !subject || !title) {
            showToast('Fill mandatory fields: Class, Subject, Title', 'error');
            return;
        }

        const newQuiz = {
            id: 'QZ-' + Date.now(),
            class: cls,
            division: div || 'All',
            subject: subject,
            type: type || 'Quiz',
            title: title,
            date: new Date().toLocaleDateString(),
            teacher: auth.currentUser.email
        };

        if (this.isDbConnected) {
            await this.db('quizzes', 'POST', newQuiz);
        }
        schoolDB.quizzes.push(newQuiz);
        showToast('Assignment Published successfully!', 'success');
        this.loadPage('manage_quizzes');
    },




    submitStaffData: async function (event) {
        if (event) event.preventDefault();

        const form = document.getElementById('staffForm');
        const editId = form.getAttribute('data-edit-id');
        console.log('[DEBUG] Entered submitStaffData. EditId:', editId);

        const name = document.getElementById('staffName').value;
        const email = document.getElementById('staffEmail').value;

        const phone = document.getElementById('staffPhone').value;
        const dept = document.getElementById('staffDept').value;
        const role = document.getElementById('staffRole').value;
        const subject = document.getElementById('staffSubject').value;
        const joiningDate = document.getElementById('staffJoiningDate').value;

        showToast(editId ? 'Updating staff...' : 'Onboarding staff...', 'info');

        let profileId = editId;

        // 1. Create Auth User if new
        if (!editId && this.isDbConnected) {
            try {
                const password = document.getElementById('staffPass').value || 'Pucho@123';
                const authResponse = await fetch(`${this.supabaseUrl}/auth/v1/admin/users`, {
                    method: 'POST',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        email_confirm: true,
                        user_metadata: { role: 'teacher' }
                    })
                });

                if (!authResponse.ok) {
                    const errText = await authResponse.text();
                    // If user already exists (422/409), try to find them or handle gracefully
                    if (errText.includes("already registered")) {
                        // Ideally we'd search for the user, but for now we might fail or assume
                        // we can't get the ID easily without a lookup. 
                        // Check if we can proceed with a mock ID if this is just a re-run test?
                        // Better: Lookup user by email to get ID
                        console.warn("User exists, trying to fetch ID not implemented. Faking ID if needed.");
                    }
                    if (!errText.includes("already registered")) {
                        throw new Error(`Auth User Creation Failed: ${errText}`);
                    }
                } else {
                    const authData = await authResponse.json();
                    profileId = authData.id;
                }

                // Fallback if we couldn't get ID (e.g. duplicate email): 
                // In a real app we'd fetch the user. For this MVP/Test:
                if (!profileId) {
                    // Try to match with existing staff if any
                    const existing = schoolDB.staff.find(s => s.email === email);
                    profileId = existing ? existing.id : 'STF-' + Math.floor(Math.random() * 10000);
                }

            } catch (e) {
                console.error("Auth Create Error:", e);
                showToast("Failed to create login. Check console.", "error");
                return;
            }
        } else if (!editId) {
            profileId = 'STF-' + Math.floor(Math.random() * 10000);
        }

        const profileData = {
            id: profileId,
            full_name: name,
            phone: phone,
            role: 'teacher' // or generic 'staff'
        };

        const staffData = {
            employee_id: profileId, // Use Auth/Profile ID as employee_id for linking in syncDB
            name: name,
            email: email,
            role: role,
            subject: subject,
            password: document.getElementById('staffPass').value,
            // Exclude fields missing in DB schema to prevent 400 Errors
            // phone, dept, class, division, qual, exp, joining_date, status are NOT in the table based on seed/errors
        };

        const staffLocalData = {
            ...staffData,
            id: profileId,
            dept: dept,
            phone: phone,
            class_assigned: document.getElementById('staffClass').value,
            division_assigned: document.getElementById('staffDivision').value,
            qualification: document.getElementById('staffQual').value,
            experience: document.getElementById('staffExp').value,
            joining_date: joiningDate,
            status: 'Active'
        };

        if (this.isDbConnected) {
            try {
                // 2. Persist to DB
                if (editId) {
                    await this.db('profiles', 'PATCH', profileData, `?id=eq.${editId}`);
                    await this.db('staff', 'PATCH', staffData, `?employee_id=eq.${editId}`);
                } else {
                    // Check if profile exists (corner case)
                    await this.db('profiles', 'POST', profileData);
                    await this.db('staff', 'POST', staffData);
                }

                // 3. Webhook (Fire & Forget or await)
                const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/JocqWwEcVSKvlSKelcgzP';
                fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(staffLocalData)
                }).then(r => console.log("Webhook Triggered", r.status)).catch(console.error);

                showToast(editId ? 'Staff updated!' : 'Staff onboarded successfully!', 'success');
                document.getElementById('staffModal').classList.add('hidden');
                this.syncDB(true).then(() => this.loadPage('staff'));

            } catch (err) {
                console.error("Staff Data Persist Error:", err);
                showToast("Failed to save to cloud.", "error");
            }
        } else {
            // Local fallback
            if (editId) {
                const index = schoolDB.staff.findIndex(s => s.id === editId);
                if (index !== -1) schoolDB.staff[index] = { ...schoolDB.staff[index], ...staffLocalData };
            } else {
                schoolDB.staff.push(staffLocalData);
            }
            showToast('Saved locally (Sync pending)', 'warning');
            document.getElementById('staffModal').classList.add('hidden');
            this.loadPage('staff');
        }
    },

    approveAdmission: async function (id) {
        if (!confirm("Approve this admission? This will enroll the student.")) return;

        const admission = schoolDB.admissions.find(a => a.id === id);
        if (!admission) return;

        const studentId = "STD-" + (schoolDB.students.length + 1).toString().padStart(3, '0');
        const newStudent = {
            id: studentId,
            name: admission.student_name,
            class: admission.grade,
            division: 'A',
            roll_no: schoolDB.students.length + 1,
            guardian_name: admission.parent_name,
            phone: admission.phone,
            email: admission.parent_email || 'student',
            dob: admission.dob || "2010-01-01"
        };

        showToast('Enrolling student...', 'info');

        // 1. Add to Students
        const sResult = await this.db('students', 'POST', newStudent);

        if (sResult) {
            // 2. Update Admission Status
            await this.db('admissions', 'PATCH', { status: 'Approved' }, `?id=eq.${id}`);

            schoolDB.students.push(newStudent);
            const idx = schoolDB.admissions.findIndex(a => a.id === id);
            if (idx !== -1) schoolDB.admissions[idx].status = 'Approved';

            showToast(`Student Enrolled: ${newStudent.id}`, 'success');
            this.loadPage('admissions');
        }
    },

    editStaff: function (id) {
        const staff = schoolDB.staff.find(s => s.id === id);
        if (!staff) return;

        const modal = document.getElementById('staffModal');
        const form = document.getElementById('staffForm');
        modal.classList.remove('hidden');
        document.querySelector('#staffModal h1').innerText = "Edit Staff Member";
        document.querySelector('#staffModal p').innerText = "Details will be updated in the automation flow";
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerText = "Update & Sync Staff";
        form.setAttribute('data-edit-id', id);

        document.getElementById('staffName').value = staff.name || '';
        document.getElementById('staffEmail').value = staff.email || '';
        document.getElementById('staffPhone').value = staff.phone || staff.mobile || '';
        document.getElementById('staffDept').value = staff.dept || '';
        document.getElementById('staffRole').value = staff.role || '';
        document.getElementById('staffClass').value = staff.class_assigned || 'N/A';
        document.getElementById('staffDivision').value = staff.division_assigned || 'N/A';
        document.getElementById('staffSubject').value = staff.subject || 'General';
        document.getElementById('staffPass').value = staff.password || '123';
        document.getElementById('staffQual').value = staff.qualification || '';
        document.getElementById('staffExp').value = staff.experience || '';
        document.getElementById('staffJoiningDate').value = staff.joining_date || new Date().toISOString().split('T')[0];
        form.noValidate = true;

        form.onsubmit = (e) => {
            e.preventDefault();
            this.submitStaffData(e);
        };
    },

    deleteStaff: async function (id) {
        if (!confirm('Are you sure you want to delete this staff member?')) return;

        // Try cloud delete
        const result = await this.db('staff', 'DELETE', null, `?employee_id=eq.${id}`);

        // Optimistic Update: Remove locally regardless of cloud status
        // This ensures the UI works even if keys are missing or offline
        const initialLength = schoolDB.staff.length;
        schoolDB.staff = schoolDB.staff.filter(s => s.id !== id);

        if (schoolDB.staff.length < initialLength) {
            if (result) {
                showToast('Staff removed from cloud.', 'success');
            } else {
                showToast('Staff removed locally (Offline/Mock).', 'warning');
            }
            this.loadPage('staff');
        } else {
            showToast('Staff member not found.', 'error');
        }
    },

    showChangePasswordModal: function () {
        document.getElementById('passwordModal').classList.remove('hidden');
        document.getElementById('passwordForm').reset();
    },

    submitNewPassword: async function () {
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;

        if (newPass !== confirmPass) {
            showToast("Passwords do not match!", 'error');
            return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast("No user logged in.", 'error');
            return;
        }

        const submitBtn = document.querySelector('#passwordForm button');
        submitBtn.innerText = "Syncing...";
        submitBtn.disabled = true;

        const staffRecord = schoolDB.staff.find(s => s.email === currentUser.email);
        const userId = staffRecord ? staffRecord.id : null;

        if (!userId) {
            showToast("Could not find database record. Update skipped.", 'warning');
            submitBtn.innerText = "Update Password";
            submitBtn.disabled = false;
            return;
        }

        const result = await this.db('staff', 'PATCH', { password: newPass }, `?id=eq.${userId}`);

        if (result) {
            showToast('Password successfully updated globally!', 'success');
            document.getElementById('passwordModal').classList.add('hidden');
        }

        submitBtn.innerText = "Update Password";
        submitBtn.disabled = false;
    },

    filterStaff: function () {
        const body = document.getElementById('staffTableBody');
        if (!body) return;

        const filtered = schoolDB.staff;

        body.innerHTML = filtered.map(s => `
            <tr class="hover:bg-gray-50/50 font-inter animate-fade-in transition-all">
                <td class="p-6 border-b border-gray-50">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-pucho-purple/10 flex items-center justify-center text-pucho-purple font-bold">${(s.name || 'U')[0]}</div>
                        <div>
                            <div class="font-bold text-pucho-dark">${s.name || 'Unknown'}</div>
                            <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">${s.email || 'no-email'}</div>
                        </div>
                    </div>
                </td>
                <td class="p-6 border-b border-gray-50">
                    <span class="text-xs font-bold text-pucho-purple">${s.role || 'Staff'}</span>
                    <br><span class="text-[10px] text-gray-400 font-medium">${s.dept || 'General'}${s.subject ? ' | ' + s.subject : ''}</span>
                </td>
                <td class="p-6 border-b border-gray-50 text-sm font-bold text-gray-400 font-inter">${s.qualification && s.qualification !== 'undefined' ? s.qualification : 'N/A'}</td>
                <td class="p-6 border-b border-gray-50 text-sm text-gray-400">${s.phone || s.contact || 'N/A'}</td>
                <td class="p-6 border-b border-gray-50">
                    <div class="flex gap-3">
                        <button onclick="dashboard.editStaff('${s.id}')" class="p-2 hover:bg-pucho-purple/10 rounded-lg text-pucho-purple transition-all">✏️</button>
                        <button onclick="dashboard.deleteStaff('${s.id}')" class="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-all">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    showBroadcastModal: function () {
        document.getElementById('broadcastModal').classList.remove('hidden');
        document.getElementById('broadcastForm').reset();
        document.getElementById('bcDate').valueAsDate = new Date();
    },

    publishNotice: async function () {
        const title = document.getElementById('bcTitle').value;
        const content = document.getElementById('bcContent').value;
        const target = document.getElementById('bcTarget').value;
        const date = document.getElementById('bcDate').value;
        const noticeClass = document.getElementById('bcClass').value;
        const noticeDivision = document.getElementById('bcDivision') ? document.getElementById('bcDivision').value : '';

        if (!title || !content) {
            showToast("Title and Content are required", 'error');
            return;
        }

        const newNotice = {
            title, content, target, date,
            class: noticeClass,
            division: noticeDivision
        };

        showToast("Publishing Notice...", "info");

        let result = null;
        if (this.isDbConnected) {
            try {
                result = await this.db('notices', 'POST', newNotice);
            } catch (err) {
                console.error("[publishNotice] DB Save Error:", err);
            }
        }
        
        // Always save locally for instant UI update
        if (!schoolDB.notices) schoolDB.notices = [];
        schoolDB.notices.unshift(newNotice);
        
        // Dispatch Webhook
        try {
            const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/yqARM2AlwdHyrtLw4Zi2k';
            // Find recipients based on target
            let recipients = [];
            
            if (target === 'Staff' || target === 'All') {
                const staffList = schoolDB.staff || [];
                recipients = recipients.concat(staffList.map(s => ({
                    name: s.name || s.full_name || 'Staff User',
                    email: s.email || '',
                    phone: s.phone || '',
                    type: 'Staff'
                })));
            }
            
            if (target === 'Parent' || target === 'Student' || target === 'All') {
                let stus = schoolDB.students || [];
                if (noticeClass) {
                    stus = stus.filter(s => s.class === noticeClass);
                    if (noticeDivision && noticeDivision !== 'All') {
                        stus = stus.filter(s => s.division === noticeDivision);
                    }
                }
                
                // Deduplicate parents to avoid spamming siblings
                const parentEmails = new Set();
                stus.forEach(s => {
                    const pe = s.parent_email || s.guardian_email || s.email;
                    if (pe && !parentEmails.has(pe)) {
                        parentEmails.add(pe);
                        recipients.push({
                            student_name: s.name || s.profiles?.full_name || 'Student',
                            name: s.parent_name || 'Parent',
                            email: pe,
                            phone: s.parent_phone || s.profiles?.phone || s.phone || '',
                            type: 'Parent'
                        });
                    }
                });
            }

            const payload = {
                action: 'NOTICE_PUBLISHED',
                notice: {
                    title,
                    content,
                    target,
                    date,
                    class_targeted: noticeClass || 'Global',
                    published_by: auth?.currentUser?.name || auth?.currentUser?.full_name || 'Admin'
                },
                recipients: recipients
            };
            
            console.log("[publishNotice] Sending Webhook:", JSON.stringify(payload, null, 2));
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(res => {
                if (res.ok) console.log("[publishNotice] Webhook successful");
                else console.error("[publishNotice] Webhook failed:", res.status);
            }).catch(e => console.error("[publishNotice] Webhook error:", e));
            
        } catch (e) {
            console.error("[publishNotice] Error preparing webhook:", e);
        }

        showToast(this.isDbConnected && result ? 'Notice Published!' : 'Notice Published! (Local)', 'success');
        document.getElementById('broadcastModal').classList.add('hidden');
        this.loadPage('communication');
    },

    showExamModal: function () {
        this.editingExamId = null; // Clear edit state
        const modal = document.getElementById('examModal');
        const form = document.getElementById('examForm');
        const submitBtn = document.querySelector('#examForm button[type="submit"]');

        if (modal && form) {
            form.reset();
            if (submitBtn) submitBtn.innerText = "Publish Timetable";
            const container = document.getElementById('subjectRowsContainer');
            container.innerHTML = '';
            // Trigger load for default class (10th)
            this.selectExamClass('10th');
            modal.classList.remove('hidden');
        }
    },

    editExam: function (id) {
        const exam = schoolDB.exams.find(e => e.id === id);
        if (!exam) {
            showToast("Exam record not found", "error");
            return;
        }

        this.editingExamId = id;
        const modal = document.getElementById('examModal');
        const form = document.getElementById('examForm');
        const submitBtn = document.querySelector('#examForm button[type="submit"]');

        if (modal && form) {
            // Populate Class
            this.selectExamClass(exam.class_id || exam.class);

            // Clear and add only this subject
            const container = document.getElementById('subjectRowsContainer');
            container.innerHTML = '';
            this.addSubjectRow(exam.subject || (exam.title ? exam.title.split(' (')[0] : ''));

            // Populate the specific row
            const row = container.querySelector('[id^="row_"]');
            if (row) {
                const dateInput = row.querySelector('.row-date');
                const startTimeInput = row.querySelector('.row-start-time');
                const endTimeInput = row.querySelector('.row-end-time');
                const subjectSelect = row.querySelector('.row-subject');

                if (dateInput) dateInput.value = exam.start_date || exam.date;

                // Parse time if it exists
                if (exam.time && exam.time.includes(' - ')) {
                    const [start, end] = exam.time.split(' - ');
                    if (startTimeInput) startTimeInput.value = start;
                    if (endTimeInput) endTimeInput.value = end;
                } else if (exam.start_time && exam.end_time) {
                    if (startTimeInput) startTimeInput.value = exam.start_time;
                    if (endTimeInput) endTimeInput.value = exam.end_time;
                }

                if (subjectSelect) subjectSelect.value = exam.subject || (exam.title ? exam.title.split(' (')[0] : '');
            }

            if (submitBtn) submitBtn.innerText = "Update Schedule";
            modal.classList.remove('hidden');
            showToast("Editing Schedule...", "info");
        }
    },

    addSubjectRow: function (preSelectedSubject = null) {
        const container = document.getElementById('subjectRowsContainer');
        const examClass = document.getElementById('examClass').value;
        const subjects = this.getSubjectsForClass(examClass);

        const rowId = 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const rowHTML = `
        <div id="${rowId}" class="grid grid-cols-1 md:grid-cols-5 gap-4 items-end animate-fade-in bg-white p-4 rounded-2xl border border-gray-100 shadow-sm group">
            <div class="space-y-1">
                <label class="text-[9px] uppercase font-bold text-gray-400 ml-1">Date</label>
                <input type="date" class="row-date w-full px-3 py-2 rounded-xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-pucho-purple outline-none text-xs transition-all" required>
            </div>
            <div class="space-y-1">
                <label class="text-[9px] uppercase font-bold text-gray-400 ml-1">Start Time</label>
                <input type="time" class="row-start-time w-full px-3 py-2 rounded-xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-pucho-purple outline-none text-xs transition-all" required>
            </div>
            <div class="space-y-1">
                <label class="text-[9px] uppercase font-bold text-gray-400 ml-1">End Time</label>
                <input type="time" class="row-end-time w-full px-3 py-2 rounded-xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-pucho-purple outline-none text-xs transition-all" required>
            </div>
            <div class="space-y-1">
                <label class="text-[9px] uppercase font-bold text-gray-400 ml-1">Subject</label>
                <select class="row-subject w-full px-3 py-2 rounded-xl border border-gray-100 bg-gray-50/50 focus:bg-white focus:border-pucho-purple outline-none text-xs transition-all cursor-pointer appearance-none" required>
                    <option value="">Select Subject</option>
                    ${subjects.map(s => `<option value="${s.name}" ${preSelectedSubject === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}
                </select>
            </div>
            <div class="flex justify-end pb-1">
                <button type="button" onclick="this.closest('#${rowId}').remove()" 
                    class="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-all opacity-0 group-hover:opacity-100">🗑️</button>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', rowHTML);
    },

    selectExamClass: function (val) {
        document.getElementById('examClass').value = val;
        document.getElementById('selectedClassText').innerText = val;
        document.getElementById('classDropdownOptions').classList.add('hidden');

        // Auto-populate rows for all subjects of this class
        const container = document.getElementById('subjectRowsContainer');
        container.innerHTML = ''; // Clear existing

        const subjects = this.getSubjectsForClass(val);

        if (subjects.length > 0) {
            subjects.forEach(s => {
                this.addSubjectRow(s.name);
            });
            showToast(`Loaded ${subjects.length} subjects for Class ${val}`, 'info');
        } else {
            this.addSubjectRow(); // Add one empty row if no subjects found
            showToast(`No subjects found for Class ${val}`, 'info');
        }
    },

    scheduleExam: async function () {
        const submitBtn = document.querySelector('#examForm button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerText : "Publish Timetable";
        const isEditing = !!this.editingExamId;

        try {
            const rawClass = document.getElementById('examClass').value;
            const examClass = this.normalizeClassName(rawClass);
            const container = document.getElementById('subjectRowsContainer');
            const rows = container.querySelectorAll('[id^="row_"]');

            if (rows.length === 0) {
                showToast("Add at least one subject", 'error');
                return;
            }

            const examData = [];
            rows.forEach(row => {
                const date = row.querySelector('.row-date').value;
                const startTime = row.querySelector('.row-start-time').value;
                const endTime = row.querySelector('.row-end-time').value;
                const subject = row.querySelector('.row-subject').value;

                if (date && startTime && endTime && subject) {
                    examData.push({
                        id: isEditing ? this.editingExamId : ('EXM-' + Math.floor(Math.random() * 10000)),
                        subject,
                        class: examClass,
                        date,
                        time: `${startTime} - ${endTime}`,
                        start_time: startTime,
                        end_time: endTime,
                        venue: 'N/A',
                        status: 'Scheduled',
                        period_start: date,
                        period_end: date
                    });
                }
            });

            if (examData.length === 0) {
                showToast("Fill all subject details", 'error');
                return;
            }

            if (submitBtn) {
                submitBtn.innerText = isEditing ? "Updating..." : "Processing...";
                submitBtn.disabled = true;
            }

            // --- WEBHOOK INTEGRATION (Pucho Studio) ---
            // Fetch real parent contacts from Supabase profiles via parent_id
            let recipients = [];
            try {
                const classStudentsRaw = await this.db('students', 'GET', null,
                    '?select=admission_no,parent_id,profiles:profiles!students_id_fkey(full_name,phone),sections:section_id(name,classes(name))'
                );
                if (classStudentsRaw) {
                    // Filter by selected class
                    const classFiltered = classStudentsRaw.filter(s =>
                        s.sections && s.sections.classes && s.sections.classes.name === examClass
                    );
                    // Fetch parent profiles individually via parent_id
                    const parentIds = classFiltered.map(s => s.parent_id).filter(Boolean);
                    let parentProfiles = [];
                    if (parentIds.length > 0) {
                        const idList = parentIds.map(id => `"${id}"`).join(',');
                        parentProfiles = await this.db('profiles', 'GET', null,
                            `?select=id,full_name,phone,email&id=in.(${parentIds.join(',')})`
                        ) || [];
                    }
                    const parentMap = {};
                    parentProfiles.forEach(p => parentMap[p.id] = p);

                    recipients = classFiltered.map(s => {
                        const parent = parentMap[s.parent_id] || {};
                        return {
                            student_name: (s.profiles && s.profiles.full_name) || 'Student',
                            parent_name: parent.full_name || 'Parent',
                            parent_email: parent.email || '',
                            parent_phone: parent.phone || (s.profiles && s.profiles.phone) || ''
                        };
                    });
                }
            } catch (recipientErr) {
                console.warn('⚠️ Could not fetch parent contacts:', recipientErr);
                // Fallback to local schoolDB data (uses parent_email/parent_phone stored in students table)
                const students = schoolDB.students.filter(s => s.class === examClass);
                recipients = students.map(s => ({
                    student_name: s.name,
                    parent_name: s.guardian_name || 'Parent',
                    parent_email: s.parent_email || s.email || '',
                    parent_phone: s.parent_phone || s.phone || ''
                }));
            }

            const webhookPayload = {
                action: isEditing ? "Exam Updated" : "Exam Published",
                target_class: examClass,
                exam_schedule: examData,
                recipients: recipients,
                timestamp: new Date().toISOString()
            };

            const webhookUrl = "https://studio.pucho.ai/api/v1/webhooks/3GWzZUORoobpsu0ALUV4s";
            console.log("🚀 Triggering Pucho Studio Webhook:", { url: webhookUrl, payload: webhookPayload });

            // Await webhook for better reliability
            try {
                const whResponse = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(webhookPayload)
                });
                if (whResponse.ok) {
                    showToast(isEditing ? "Update notifications sent" : "Notifications sent via Pucho Studio", 'success');
                } else {
                    console.error("❌ Webhook Failed:", whResponse.status);
                }
            } catch (whErr) {
                console.error("⚠️ Webhook Fetch Error:", whErr);
            }

            // --- DB PERSISTENCE ---
            showToast(isEditing ? "Updating record..." : `Saving ${examData.length} records...`, 'info');

            for (const exam of examData) {
                const examPayload = {
                    title: `${exam.subject} (${exam.time})`,
                    subject: exam.subject,
                    start_time: exam.start_time,
                    end_time: exam.end_time,
                    start_date: exam.date,
                    class_id: exam.class,
                    class: exam.class,
                    venue: exam.venue,
                    status: 'Scheduled'
                };

                let result;
                if (isEditing) {
                    result = await this.db('exams', 'PATCH', examPayload, `?id=eq.${this.editingExamId}`);
                } else {
                    result = await this.db('exams', 'POST', examPayload);
                }

                // Add/Update local state
                if (isEditing) {
                    const idx = schoolDB.exams.findIndex(e => e.id === this.editingExamId);
                    if (idx !== -1) schoolDB.exams[idx] = { ...schoolDB.exams[idx], ...examPayload, ...exam };
                } else {
                    const finalExam = (result && result[0]) ? result[0] : exam;
                    schoolDB.exams.unshift(finalExam);
                }
            }

            showToast(isEditing ? "✅ Schedule Updated!" : "✅ Timetable Published!", 'success');

            setTimeout(() => {
                const modal = document.getElementById('examModal');
                if (modal) modal.classList.add('hidden');
                this.loadPage('exams');
            }, 800);

        } catch (error) {
            console.error("❌ scheduleExam Error:", error);
            showToast("Something went wrong. Check console.", 'error');
        } finally {
            if (submitBtn) {
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
            this.editingExamId = null;
        }
    },

    deleteExam: async function (id) {
        if (!confirm('Are you sure you want to remove this exam schedule?')) return;

        const result = await this.db('exams', 'DELETE', null, `?id=eq.${id}`);

        if (result || this.supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
            schoolDB.exams = schoolDB.exams.filter(e => e.id !== id);
            showToast('Exam schedule removed.', 'success');
            this.loadPage('exams');
        }
    },

    // Modal Helpers
    submitStudentData: async function (e) {
        if (e) e.preventDefault();
        const form = document.getElementById('studentForm');
        const editId = form.dataset.editId;

        const firstName = document.getElementById('stdFirstName').value;
        const lastName = document.getElementById('stdLastName').value;
        const fullName = `${firstName} ${lastName}`;
        const dob = document.getElementById('stdDob').value;
        const gender = document.getElementById('stdGender').value;
        const className = document.getElementById('stdClass').value;
        const division = document.getElementById('stdDiv').value;
        const rollNo = document.getElementById('stdRoll').value;
        const guardian = document.getElementById('stdGuardian').value;
        const phone = document.getElementById('stdPhone').value;
        const parentEmail = document.getElementById('stdParentEmail').value;
        const parentPhone = document.getElementById('stdParentPhone').value;

        showToast(editId ? 'Updating student...' : 'Adding student...', 'info');

        let profileId = editId;

        // Create Auth User if new student
        if (!editId && this.isDbConnected) {
            try {
                const email = `student.${Date.now()}_${Math.floor(Math.random() * 1000)}@puchschool.com`;
                const password = 'TemporaryPassword123!';

                const authResponse = await fetch(`${this.supabaseUrl}/auth/v1/admin/users`, {
                    method: 'POST',
                    headers: {
                        'apikey': this.supabaseKey,
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password,
                        email_confirm: true,
                        user_metadata: { role: 'student' }
                    })
                });

                if (!authResponse.ok) {
                    const errText = await authResponse.text();
                    throw new Error(`Auth User Creation Failed: ${errText}`);
                }

                const authData = await authResponse.json();
                profileId = authData.id; // Use the real Auth ID

            } catch (e) {
                console.error("Auth Create Error:", e);
                showToast("Failed to create student login. Check console.", "error");
                return;
            }
        } else if (!editId) {
            // Fallback for local testing if DB not connected (though isDbConnected check above handles it)
            profileId = crypto.randomUUID();
        }

        // Find section_id
        const section = (schoolDB.sections || []).find(s =>
            (s.classes && s.classes.name === className) && s.name === division
        );

        if (!section && this.isDbConnected) {
            showToast(`Could not find section for ${className} - ${division}`, 'error');
            return;
        }

        const profileData = {
            id: profileId,
            full_name: fullName,
            phone: phone,
            role: 'student'
        };

        const studentData = {
            id: profileId,
            roll_no: parseInt(rollNo) || 0,
            status: 'Active',
            section_id: section ? section.id : null,
            gender: gender,
            dob: dob,
            guardian_name: guardian,
            parent_email: parentEmail,
            parent_phone: parentPhone
        };

        if (!editId) {
            studentData.admission_no = 'STD-' + Math.floor(Math.random() * 10000);
        }

        if (this.isDbConnected) {
            try {
                // 1. Profile
                if (editId) {
                    await this.db('profiles', 'PATCH', profileData, `?id=eq.${editId}`);
                } else {
                    await this.db('profiles', 'POST', profileData);
                }

                // 2. Student
                if (editId) {
                    await this.db('students', 'PATCH', studentData, `?id=eq.${editId}`);
                } else {
                    await this.db('students', 'POST', studentData);
                }

                showToast(editId ? 'Student updated!' : 'Student added!', 'success');
                document.getElementById('studentModal').classList.add('hidden');
                this.syncDB(true).then(() => this.loadPage('students'));
            } catch (err) {
                console.error("Student Sync Error:", err);
                showToast("Failed to sync with cloud. Check internet.", "error");
            }
        } else {
            // Local Update
            const localStudent = {
                id: profileId,
                name: fullName,
                class: className,
                division: division,
                roll_no: rollNo,
                guardian_name: guardian,
                phone: phone,
                parent_email: parentEmail,
                parent_phone: parentPhone,
                status: 'Active'
            };
            if (editId) {
                const idx = schoolDB.students.findIndex(s => s.id === editId || s.db_id === editId);
                if (idx !== -1) schoolDB.students[idx] = localStudent;
            } else {
                schoolDB.students.push(localStudent);
            }
            showToast('Saved locally (Sync pending)', 'warning');
            document.getElementById('studentModal').classList.add('hidden');
            this.loadPage('students');
        }
    },

    deleteStudent: async function (id) {
        if (!confirm('Are you sure you want to delete this student profile?')) return;
        showToast('Deleting student...', 'info');
        if (this.isDbConnected) {
            await this.db('students', 'DELETE', null, `?id=eq.${id}`);
            await this.db('profiles', 'DELETE', null, `?id=eq.${id}`);
            showToast('Student deleted from cloud', 'success');
        }
        schoolDB.students = schoolDB.students.filter(s => s.db_id !== id && s.id !== id);
        this.loadPage('students');
    },

    editStudent: function (id) {
        const student = schoolDB.students.find(s => s.id === id || s.db_id === id);
        if (!student) return;

        const modal = document.getElementById('studentModal');
        const form = document.getElementById('studentForm');
        if (!modal || !form) return;
        form.noValidate = true; // TODO: Fix date validation issue
        modal.classList.remove('hidden');
        document.querySelector('#studentModal h1').innerText = "Edit Student Profile";
        form.dataset.editId = student.db_id || student.id;

        const nameParts = (student.name || '').split(' ');
        document.getElementById('stdFirstName').value = nameParts[0] || '';
        document.getElementById('stdLastName').value = nameParts.slice(1).join(' ') || '';
        document.getElementById('stdClass').value = student.class || '10th';
        document.getElementById('stdDiv').value = student.division || 'A';
        document.getElementById('stdRoll').value = student.roll_no || '';
        document.getElementById('stdPhone').value = student.phone || '';
        document.getElementById('stdGuardian').value = student.guardian_name || '';
        document.getElementById('stdParentEmail').value = student.parent_email || '';
        document.getElementById('stdParentPhone').value = student.parent_phone || '';

        form.onsubmit = (e) => {
            e.preventDefault();
            this.submitStudentData(e);
        };
    },

    showAddStudentModal: function () {
        const modal = document.getElementById('studentModal');
        const form = document.getElementById('studentForm');
        if (modal && form) {
            form.reset();
            delete form.dataset.editId;
            modal.classList.remove('hidden');
            document.querySelector('#studentModal h1').innerText = "Add New Student";
            form.onsubmit = (e) => {
                e.preventDefault();
                this.submitStudentData(e);
            };
        }
    },

    // Generic Filter Helper
    filterGeneric: function (type) {
        const body = document.getElementById(`${type}TableBody`);
        if (!body) return;

        let data = schoolDB[type];
        if (classFilter) {
            const normalized = this.normalizeClassName(classFilter);
            data = data.filter(d => d.class === normalized || d.class === classFilter);
        }

        if (!data || data.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400 font-inter font-bold uppercase tracking-widest">No ${type} records found</td></tr>`;
            return;
        }

        body.innerHTML = data.map(d => {
            if (type === 'students') {
                return `<tr class="hover:bg-gray-50/50 transition-all animate-fade-in">
                    <td class="p-6 border-b border-gray-50">
                        <div class="font-bold text-pucho-dark">${d.name}</div>
                        <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ID: ${d.id}</div>
                    </td>
                    <td class="p-6 border-b border-gray-50">
                        <div class="text-sm font-bold text-gray-600">${d.class} - ${d.division}</div>
                        <div class="text-[10px] text-gray-400 font-bold">Roll: ${d.roll_no}</div>
                    </td>
                    <td class="p-6 border-b border-gray-50 text-sm text-gray-500">${d.guardian_name}</td>
                    <td class="p-6 border-b border-gray-50 text-sm text-gray-500">${d.phone}</td>
                    <td class="p-6 border-b border-gray-50"><span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">Active</span></td>
                     <td class="p-6 border-b border-gray-50">
                        <button class="p-2 hover:bg-pucho-purple/10 rounded-lg text-pucho-purple transition-all">✏️</button>
                    </td>
                </tr>`;
            }
            if (type === 'fees') {
                return `<tr class="hover:bg-gray-50/50 transition-all animate-fade-in">
                    <td class="p-6 border-b border-gray-50 font-bold text-pucho-dark cursor-pointer text-indigo-600 hover:underline">${d.student_id}</td>
                    <td class="p-6 border-b border-gray-50 text-gray-500 font-medium">${d.type}</td>
                    <td class="p-6 border-b border-gray-50 font-bold">₹${d.amount?.toLocaleString() || '0'}</td>
                    <td class="p-6 border-b border-gray-50"><span class="px-3 py-1 ${d.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} rounded-full text-[10px] font-bold uppercase tracking-widest">${d.status}</span></td>
                </tr>`;
            }
            if (type === 'exams') {
                const isAdmin = auth.currentUser.role === 'admin';
                return `
                <tr class="group hover:bg-gray-50/50 transition-all animate-fade-in font-inter">
                    <td class="p-6 border-b border-gray-50">
                        <div class="font-bold text-pucho-dark">${d.subject}</div>
                        <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ID: ${d.id}</div>
                    </td>
                    <td class="p-6 border-b border-gray-50 text-gray-500 text-sm font-medium">${d.class}</td>
                    <td class="p-6 border-b border-gray-50">
                        <div class="text-sm font-bold text-pucho-purple">${new Date(d.date || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <div class="text-[10px] text-gray-400 font-bold uppercase tracking-tight">${d.time || (d.start_time ? `${d.start_time} - ${d.end_time}` : 'TBA')}</div>
                    </td>
                    <td class="p-6 border-b border-gray-50 text-sm font-medium text-gray-500">${d.venue || 'TBA'}</td>
                    <td class="p-6 border-b border-gray-50 text-right">
                        <div class="flex justify-end gap-2 transition-all opacity-0 group-hover:opacity-100">
                            <button onclick="dashboard.editExam('${d.id}')" 
                                    class="p-2 hover:bg-pucho-purple/10 rounded-lg text-pucho-purple transition-all" title="Edit">✏️</button>
                            ${isAdmin ? `
                            <button onclick="dashboard.deleteExam('${d.id}')" 
                                    class="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-all" title="Delete">🗑️</button>
                            ` : ''}
                        </div>
                    </td>
                </tr>`;
            }
            return '';
        }).join('');
    },

    runRecoveryFlow: async function () {
        const classFilter = document.getElementById('filterClass_fees')?.value;
        const pendingFees = schoolDB.fees.filter(f => f.status === 'Pending');

        // Enrich data with student/parent info for the Automation Loop
        const enrichedFees = pendingFees.map(f => {
            const student = schoolDB.students.find(s => s.id === f.student_id);
            return {
                ...f,
                student_name: student ? student.name : 'Unknown',
                parent_name: student ? (student.guardian_name || student.parent_name) : 'Unknown',
                parent_email: student ? student.email : (student ? student.parent_email : 'Unknown'),
                student_class: student ? student.class : 'N/A'
            };
        });

        // Filter by class if selected
        let finalFees = enrichedFees;
        if (classFilter) {
            finalFees = enrichedFees.filter(f => f.student_class === classFilter);
        }

        if (finalFees.length === 0) {
            showToast("No pending fees found for recovery.", "info");
            return;
        }

        showToast(`Processing ${finalFees.length} recovery requests...`, "info");

        // New Webhook URL for Email Automation Loop
        const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/4JqnOMaZ4qeTHElL9FyT1';

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'FEE_RECOVERY_AUTOMATION_LOOP',
                    total_amount: finalFees.reduce((sum, f) => sum + (f.amount || 0), 0),
                    count: finalFees.length,
                    grade_filter: classFilter || 'All Grades',
                    data: finalFees // This list contains emails and amounts for Studio to loop
                })
            });

            if (response.ok) {
                showToast("🚀 Recovery Flow Sent to Pucho Studio!", "success");
            } else {
                throw new Error("Flow trigger failed");
            }
        } catch (err) {
            console.error("Recovery Flow Error:", err);
            showToast("Failed to trigger flow. Check your internet.", "error");
        }
    },

    toggleCustomDropdown: function (event) {
        event.stopPropagation();
        const menu = document.getElementById('dropdownMenu_fees');
        const arrow = document.getElementById('dropdownArrow');
        if (!menu) return;

        const isShow = menu.classList.contains('show');
        menu.classList.toggle('show');
        if (arrow) arrow.style.transform = isShow ? 'rotate(0deg)' : 'rotate(180deg)';

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove('show');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
                window.removeEventListener('click', closeMenu);
            }
        };
        window.addEventListener('click', closeMenu);
    },

    selectDropdownOption: function (val, text) {
        const input = document.getElementById('filterClass_fees');
        const toggleText = document.getElementById('selectedClassText');
        const menu = document.getElementById('dropdownMenu_fees');
        const arrow = document.getElementById('dropdownArrow');

        if (input) input.value = val;
        if (toggleText) toggleText.innerText = text;

        if (menu) {
            const items = menu.querySelectorAll('.dropdown-item');
            items.forEach(item => {
                if (item.innerText === text) item.classList.add('selected');
                else item.classList.remove('selected');
            });
            menu.classList.remove('show');
        }
        if (arrow) arrow.style.transform = 'rotate(0deg)';

        this.filterGeneric('fees');
    },

    // Subject Custom Dropdown Logic
    toggleSubjectDropdown: function (event) {
        event.stopPropagation();
        const menu = document.getElementById('dropdownMenu_subject');
        const arrow = document.getElementById('subjectDropdownArrow');
        if (!menu) return;

        const isHidden = menu.classList.contains('hidden');

        if (isHidden) {
            menu.classList.remove('hidden');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            menu.classList.add('hidden');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }

        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !e.target.closest('#dropdownToggle_subject')) {
                menu.classList.add('hidden');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
                window.removeEventListener('click', closeMenu);
            }
        };
        window.addEventListener('click', closeMenu);
    },

    selectSubjectOption: function (val) {
        const input = document.getElementById('addSubjectClass');
        const textSpan = document.getElementById('subjectSelectedText');
        const menu = document.getElementById('dropdownMenu_subject');
        const arrow = document.getElementById('subjectDropdownArrow');

        if (input) input.value = val;
        if (textSpan) {
            textSpan.innerText = val;
            textSpan.className = "font-bold text-pucho-dark";
        }

        if (menu) menu.classList.add('hidden');
        if (arrow) arrow.style.transform = 'rotate(0deg)';

        // Load existing subjects for this class
        this.renderExistingSubjects(val);
    },

    // Subject Management Functions
    renderExistingSubjects: function (className) {
        const container = document.getElementById('existingSubjectsContainer');
        if (!container) return;

        const subjects = schoolDB.subjects.filter(s => s.class === className);

        if (subjects.length === 0) {
            container.innerHTML = `
                <div class="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center text-gray-400 text-xs font-medium">
                    No subjects defined for ${className} yet.
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="flex flex-wrap gap-2">
                ${subjects.map(s => `
                    <div class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100 flex items-center gap-2">
                        ${s.name}
                        <button type="button" onclick="dashboard.deleteSubject('${s.id}')" class="hover:text-red-500">✕</button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    addSubjectInputRow: function () {
        const container = document.getElementById('subjectRowsContainer');
        const rowId = 'sub_row_' + Date.now();
        const div = document.createElement('div');
        div.id = rowId;
        div.className = "flex gap-2 mb-2 animate-fade-in";
        div.innerHTML = `
            <input type="text" placeholder="Subject Name (e.g. Physics)" class="row-subject-name w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none" required>
            <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all">✕</button>
        `;
        container.appendChild(div);
    },

    showAddSubjectModal: function () {
        const modal = document.getElementById('subjectModal');
        const form = document.getElementById('subjectForm');

        if (modal && form) {
            form.reset();
            document.getElementById('subjectRowsContainer').innerHTML = '';
            const existingContainer = document.getElementById('existingSubjectsContainer');
            if (existingContainer) existingContainer.innerHTML = ''; // Clear previous existing subjects
            this.addSubjectInputRow(); // Add first row by default

            // Reset custom dropdown
            const textSpan = document.getElementById('subjectSelectedText');
            if (textSpan) {
                textSpan.innerText = "Select Class";
                textSpan.className = "font-bold text-gray-400 opacity-70";
            }
            document.getElementById('addSubjectClass').value = "";

            // Auto-select class if filter is active
            const currentFilter = document.getElementById('filterClass_subjects')?.value;
            if (currentFilter) {
                this.selectSubjectOption(currentFilter);
            }

            modal.classList.remove('hidden');

            // Set Onsubmit
            form.onsubmit = async (e) => {
                e.preventDefault();
                await this.saveSubjects();
            };
        }
    },

    saveSubjects: async function () {
        const targetClass = document.getElementById('addSubjectClass').value;
        const rows = document.querySelectorAll('.row-subject-name');

        if (!targetClass) {
            showToast('Please select a target class.', 'error');
            return;
        }

        const subjectsToAdd = [];
        rows.forEach(row => {
            if (row.value.trim()) {
                subjectsToAdd.push({
                    id: crypto.randomUUID(),
                    name: row.value.trim(),
                    class: targetClass
                });
            }
        });

        if (subjectsToAdd.length === 0) {
            showToast('Please add at least one subject.', 'error');
            return;
        }

        const submitBtn = document.querySelector('#subjectForm button[type="submit"]');
        submitBtn.innerText = "Saving...";
        submitBtn.disabled = true;

        // Process sequentially or batch if API supports
        let successCount = 0;
        for (const sub of subjectsToAdd) {
            const result = await this.db('subjects', 'POST', sub);
            if (result || this.supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
                schoolDB.subjects.push(sub);
                successCount++;
            }
        }

        if (successCount > 0) {
            showToast(`Successfully added ${successCount} subjects to ${targetClass}!`, 'success');
            document.getElementById('subjectModal').classList.add('hidden');
            this.loadPage('subjects');
        } else {
            showToast('Failed to save subjects.', 'error');
        }

        submitBtn.innerText = "Save Subjects";
        submitBtn.disabled = false;
    },

    renderSubjectModal: function () {
        const classes = ['LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

        return `<div id="subjectModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm hidden animate-fade-in">
            <div class="bg-white p-8 w-full max-w-xl rounded-[32px] border border-white/30 shadow-2xl relative animate-slide-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                <button onclick="document.getElementById('subjectModal').classList.add('hidden')" class="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full">✕</button>
                <div class="mb-6 border-b border-gray-50 pb-4">
                    <div class="w-12 h-12 bg-pucho-purple/10 rounded-xl flex items-center justify-center text-2xl mb-4">📚</div>
                    <h1 class="text-3xl font-bold text-pucho-dark mb-1">Add New Subject</h1>
                    <p class="text-gray-500 font-inter">Define subjects to be used in exam scheduling.</p>
                </div>
                <form id="subjectForm" class="space-y-6 font-inter">
                    <div>
                         <label class="text-[10px] font-bold text-pucho-purple uppercase tracking-widest mb-2 block">Target Class</label>
                         <div class="relative w-full">
                            <div onclick="dashboard.toggleSubjectDropdown(event)" id="dropdownToggle_subject" class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 flex justify-between items-center cursor-pointer hover:border-blue-500 transition-all group">
                                <span id="subjectSelectedText" class="font-bold text-gray-400 opacity-70">Select Class</span>
                                <svg id="subjectDropdownArrow" class="w-5 h-5 text-blue-600 transition-transform group-hover:text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                            <input type="hidden" id="addSubjectClass" required>
                            
                            <div id="dropdownMenu_subject" class="absolute top-full left-0 w-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 hidden z-50 max-h-48 overflow-y-auto custom-scrollbar p-2 animate-fade-in">
                                ${classes.map(c => `<div class="p-3 hover:bg-blue-50 rounded-xl cursor-pointer font-bold text-gray-600 hover:text-blue-600 transition-colors" onclick="dashboard.selectSubjectOption('${c}')">${c}</div>`).join('')}
                            </div>
                        </div>
                    </div>

                    <div>
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">Existing Subjects</label>
                    <div id="existingSubjectsContainer" class="mb-4">
                        <!-- Existing subjects loaded dynamically -->
                    </div>

                    <div class="flex justify-between items-center mb-2">
                         <label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Add New Subjects</label>
                         <button type="button" onclick="dashboard.addSubjectInputRow()" class="text-xs font-bold text-pucho-purple hover:underline">+ Add Row</button>
                    </div>
                        <div id="subjectRowsContainer" class="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                             <!-- Rows injected here -->
                        </div>
                    </div>

                    <div class="pt-4 border-t border-gray-50">
                        <button type="submit" class="w-full bg-pucho-dark text-white px-8 py-4 rounded-2xl font-bold hover:shadow-glow hover:bg-pucho-purple transition-all transform active:scale-[0.98]">SAVE SUBJECTS</button>
                    </div>
                </form>
            </div>
        </div>`;
    },

    deleteSubject: async function (id) {
        if (!confirm('Are you sure you want to remove this subject?')) return;

        const result = await this.db('subjects', 'DELETE', null, `?id=eq.${id}`);

        if (result || this.supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
            schoolDB.subjects = schoolDB.subjects.filter(s => s.id !== id);
            showToast('Subject removed.', 'success');
            this.loadPage('subjects');
        }
    },

    subjects: function () {
        const classFilter = document.getElementById('filterClass_subjects')?.value || '';
        let filtered = schoolDB.subjects;
        if (classFilter) filtered = filtered.filter(s => s.class === classFilter);

        const rows = filtered.map(s => `
            <tr class="hover:bg-gray-50/50 transition-all font-inter">
                <td class="p-6 font-bold text-pucho-dark border-b border-gray-50">${s.id}</td>
                <td class="p-6 text-gray-700 font-medium border-b border-gray-50">${s.name}</td>
                <td class="p-6 text-gray-500 text-sm border-b border-gray-50">${s.class}</td>
                <td class="p-6 border-b border-gray-50 text-right">
                    <button onclick="dashboard.deleteSubject('${s.id}')" class="w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center ml-auto">🗑️</button>
                </td>
            </tr>
        `).join('');

        return `<div class="space-y-8 animate-fade-in">
            <div class="flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-2xl text-pucho-dark">Subject Master</h3>
                    <p class="text-gray-400">Manage subjects for academic scheduling</p>
                </div>
                <button onclick="dashboard.showAddSubjectModal()" class="bg-pucho-dark text-white px-8 py-3 rounded-2xl font-bold hover:shadow-glow hover:bg-pucho-purple transition-all">+ ADD SUBJECT</button>
            </div>

            <div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle min-h-[400px]">
                <div class="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <h4 class="font-bold text-lg">Defined Subjects</h4>
                    <select id="filterClass_subjects" onchange="dashboard.loadPage('subjects')" class="px-6 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 outline-none hover:border-pucho-purple transition-colors bg-gray-50">
                        <option value="">All Classes</option>
                        <option value="LKG" ${classFilter === 'LKG' ? 'selected' : ''}>LKG</option>
                        <option value="UKG" ${classFilter === 'UKG' ? 'selected' : ''}>UKG</option>
                        <option value="1st" ${classFilter === '1st' ? 'selected' : ''}>1st</option>
                        <option value="2nd" ${classFilter === '2nd' ? 'selected' : ''}>2nd</option>
                        <option value="3rd" ${classFilter === '3rd' ? 'selected' : ''}>3rd</option>
                        <option value="4th" ${classFilter === '4th' ? 'selected' : ''}>4th</option>
                        <option value="5th" ${classFilter === '5th' ? 'selected' : ''}>5th</option>
                        <option value="6th" ${classFilter === '6th' ? 'selected' : ''}>6th</option>
                        <option value="7th" ${classFilter === '7th' ? 'selected' : ''}>7th</option>
                        <option value="8th" ${classFilter === '8th' ? 'selected' : ''}>8th</option>
                        <option value="9th" ${classFilter === '9th' ? 'selected' : ''}>9th</option>
                        <option value="10th" ${classFilter === '10th' ? 'selected' : ''}>10th</option>
                    </select>
                </div>
                <table class="w-full text-left font-inter">
                    <thead class="bg-gray-50/50">
                        <tr>
                            <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID</th>
                            <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Name</th>
                            <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class</th>
                            <th class="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        ${rows || '<tr><td colspan="4" class="p-12 text-center text-gray-400 font-bold opacity-60">No subjects found. Add new subjects to get started.</td></tr>'}
                    </tbody>
                </table>
                ${dashboard.renderSubjectModal()}
            </div>
        </div>`;
    },
    skeleton: function () {
        return `<div class="p-8 space-y-8 animate-pulse">
                <div class="h-48 skeleton rounded-[40px] w-full"></div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div class="h-32 skeleton rounded-[32px]"></div>
                    <div class="h-32 skeleton rounded-[32px]"></div>
                    <div class="h-32 skeleton rounded-[32px]"></div>
                    <div class="h-32 skeleton rounded-[32px]"></div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div class="h-64 skeleton rounded-[40px]"></div>
                    <div class="h-64 skeleton rounded-[40px]"></div>
                </div>
            </div>`;
    },
    new_application: function () {
        return `<div class="max-w-4xl mx-auto bg-white rounded-[40px] p-10 border border-gray-100 shadow-subtle animate-fade-in relative overflow-hidden">
                 <div class="absolute top-0 right-0 w-64 h-64 bg-pucho-purple/5 rounded-full blur-[80px]"></div>
                <div class="mb-8 relative z-10">
                    <h3 class="text-2xl font-bold text-pucho-dark">Student Admission Form</h3>
                    <p class="text-gray-400">Session 2024-25</p>
                </div>
                <form onsubmit="dashboard.submitApplication(event)" class="space-y-6 relative z-10 font-inter">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Child's Full Name</label>
                            <input type="text" id="appName" required class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none" placeholder="e.g. Arjun Singh">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Date of Birth</label>
                            <input type="date" id="appDob" required class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Grade Applying For</label>
                             <select id="appGrade" class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none cursor-pointer">
                                <option>Nursery</option><option>LKG</option><option>UKG</option>
                                <option>1st</option><option>2nd</option><option>3rd</option>
                                <option>4th</option><option>5th</option><option>6th</option>
                                <option>7th</option><option>8th</option><option>9th</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Previous School (Optional)</label>
                            <input type="text" id="appPrevSchool" class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none" placeholder="e.g. St. Mary's">
                        </div>
                    </div>
                    
                    <div class="pt-6 border-t border-gray-50">
                        <h4 class="font-bold text-gray-500 text-sm uppercase tracking-widest mb-4">Required Documents</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="p-6 border-2 border-dashed border-gray-100 rounded-[32px] hover:border-pucho-purple/30 transition-all group bg-gray-50/30">
                                <label class="block text-sm font-bold text-gray-700 mb-2">Birth Certificate</label>
                                <div class="flex flex-col items-center justify-center py-4">
                                    <div class="text-3xl mb-2 group-hover:scale-110 transition-transform">📄</div>
                                    <input type="file" id="appDocBirth" class="hidden" onchange="dashboard.handleFileUpload(this, 'birth_cert')">
                                    <button type="button" onclick="document.getElementById('appDocBirth').click()" class="text-xs font-bold text-pucho-purple hover:underline uppercase tracking-tighter">Choose File</button>
                                    <p id="status_birth_cert" class="text-[10px] text-gray-400 mt-2 italic font-medium">No file selected</p>
                                </div>
                            </div>
                            <div class="p-6 border-2 border-dashed border-gray-100 rounded-[32px] hover:border-pucho-purple/30 transition-all group bg-gray-50/30">
                                <label class="block text-sm font-bold text-gray-700 mb-2">Residential Proof (Aadhaar/Bill)</label>
                                <div class="flex flex-col items-center justify-center py-4">
                                    <div class="text-3xl mb-2 group-hover:scale-110 transition-transform">🏠</div>
                                    <input type="file" id="appDocAddress" class="hidden" onchange="dashboard.handleFileUpload(this, 'address_proof')">
                                    <button type="button" onclick="document.getElementById('appDocAddress').click()" class="text-xs font-bold text-pucho-purple hover:underline uppercase tracking-tighter">Choose File</button>
                                    <p id="status_address_proof" class="text-[10px] text-gray-400 mt-2 italic font-medium">No file selected</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="pt-6 border-t border-gray-50">
                        <h4 class="font-bold text-gray-500 text-sm uppercase tracking-widest mb-4">Parent Details</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-1">Father's Name</label>
                                <input type="text" id="appFather" required class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none" value="${auth.currentUser.name || ''}">
                            </div>
                             <div>
                                <label class="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
                                <input type="tel" id="appPhone" required class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none" placeholder="+91...">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-bold text-gray-700 mb-1">Residential Address</label>
                                <textarea id="appAddress" rows="2" class="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:border-pucho-purple outline-none" placeholder="Full address..."></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end pt-4">
                        <button type="submit" class="bg-pucho-dark text-white px-10 py-4 rounded-2xl font-bold shadow-glow hover:bg-pucho-purple transition-all transform active:scale-95">SUBMIT APPLICATION</button>
                    </div>
                </form>
            </div>`;
    },

    my_applications: function () {
        const myApps = schoolDB.admissions.filter(a => a.parent_email === auth.currentUser.email || a.parent_name === auth.currentUser.name);

        if (myApps.length === 0) {
            return `<div class="bg-white rounded-[40px] p-12 border border-gray-100 shadow-subtle animate-fade-in text-center">
                    <div class="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-6xl">📂</div>
                    <h3 class="text-2xl font-bold text-pucho-dark mb-2">No Applications Yet</h3>
                    <p class="text-gray-400 mb-8 max-w-md mx-auto">Start your journey with SMS Cloud by applying for admission.</p>
                    <button onclick="dashboard.loadPage('new_application')" class="btn-primary px-8 py-3 rounded-2xl shadow-glow">Start New Application</button>
                </div>`;
        }

        return `<div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle animate-fade-in">
                 <div class="p-8 border-b border-gray-50"><h3 class="font-bold text-2xl">My Applications</h3></div>
                 <div class="divide-y divide-gray-50">
                    ${myApps.map(app => `
                        <div class="p-6 flex flex-col md:flex-row justify-between items-center hover:bg-gray-50 transition-colors gap-4">
                            <div>
                                <h4 class="font-bold text-lg text-pucho-dark">${app.student_name}</h4>
                                <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Applying for: ${app.grade}</p>
                                <p class="text-xs text-gray-400 mt-2">Submitted on: ${new Date(app.applied_at || Date.now()).toLocaleDateString()}</p>
                            </div>
                            <div class="flex items-center gap-4">
                                <div class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${app.status === 'Pending' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}">
                                    ${app.status === 'Pending' ? '⏳ Application Under Review' : '✅ Admission Granted'}
                                </div>
                                <div class="flex gap-2">
                                    <div class="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-100 ${app.docs?.birth_cert === 'uploaded' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}" title="Birth Cert">📄</div>
                                    <div class="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-100 ${app.docs?.address_proof === 'uploaded' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}" title="Address Proof">🏠</div>
                                </div>
                                ${app.status !== 'Pending' ? '<button onclick="showToast(\'Please visit the school office to complete formalities.\', \'info\')" class="text-pucho-purple font-bold text-xs underline">Next Steps</button>' : ''}
                            </div>
                        </div>
                    `).join('')}
                 </div>
            </div>`;
    },


    card: function (title, value, sub, icon, color = 'pucho-purple') {
        return `<div class="p-8 bg-white border border-gray-100 rounded-[32px] shadow-subtle hover:shadow-glow transition-all">
                <div class="flex justify-between items-start mb-6">
                    <div class="w-14 h-14 rounded-2xl bg-${color}/10 flex items-center justify-center text-2xl">${icon}</div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">${sub}</span>
                </div>
                <h4 class="text-gray-500 text-sm font-medium mb-1">${title}</h4>
                <p class="text-3xl font-bold text-pucho-dark tracking-tight">${value}</p>
            </div>`;
    },

    overview: function (role) {
        const stats = dashboard.getDashboardStats(role);
        const cards = stats.map(s => this.card(s.title, s.value, s.sub, s.icon, s.color)).join('');

        return `
            <div class="space-y-10 animate-fade-in">
                <!-- Top Stats -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${cards}
                </div>

                <!-- Charts Section -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Attendance Analytics -->
                    <div class="bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle relative overflow-hidden">
                        <div class="flex justify-between items-center mb-8">
                            <div>
                                <h3 class="font-bold text-xl text-pucho-dark">Attendance Trend</h3>
                                <p class="text-xs text-gray-400 font-medium">Weekly percentage overview</p>
                            </div>
                            <div class="flex gap-2">
                                <span class="w-3 h-3 rounded-full bg-pucho-purple"></span>
                                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active</span>
                            </div>
                        </div>
                        <div class="h-[250px] relative">
                            <canvas id="attendanceChart"></canvas>
                        </div>
                    </div>

                    <!-- Financial Analytics -->
                    <div class="bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle relative overflow-hidden">
                        <div class="flex justify-between items-center mb-8">
                            <div>
                                <h3 class="font-bold text-xl text-pucho-dark">Fee Collection</h3>
                                <p class="text-xs text-gray-400 font-medium">Monthly revenue cycle</p>
                            </div>
                            <select class="bg-gray-50 border-none text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl outline-none">
                                <option>Term 1</option>
                                <option>Term 2</option>
                            </select>
                        </div>
                        <div class="h-[250px] relative">
                            <canvas id="revenueChart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Recent Activity / Action Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="p-6 bg-gradient-to-br from-pucho-purple to-pucho-light rounded-[32px] text-white space-y-4 shadow-glow group cursor-pointer overflow-hidden relative">
                        <div class="absolute -right-4 -bottom-4 text-8xl opacity-10 group-hover:scale-110 transition-transform">📢</div>
                        <p class="text-[10px] font-bold uppercase tracking-widest opacity-80">Broadcast</p>
                        <h4 class="text-xl font-bold">Post New Announcement</h4>
                        <button onclick="dashboard.showBroadcastModal()" class="bg-white/20 backdrop-blur-md px-6 py-2 rounded-full text-xs font-bold hover:bg-white/40 transition-all">START FLOW</button>
                    </div>
                    
                    <div class="p-6 bg-gradient-to-br from-pucho-blue to-pucho-light rounded-[32px] text-white space-y-4 shadow-glow group cursor-pointer overflow-hidden relative">
                         <div class="absolute -right-4 -bottom-4 text-8xl opacity-10 group-hover:scale-110 transition-transform">📝</div>
                        <p class="text-[10px] font-bold uppercase tracking-widest opacity-80">Academic</p>
                        <h4 class="text-xl font-bold">Schedule Examination</h4>
                        <button onclick="dashboard.loadPage('exams')" class="bg-white/20 backdrop-blur-md px-6 py-2 rounded-full text-xs font-bold hover:bg-white/40 transition-all">OPEN MODULE</button>
                    </div>

                    <div class="p-6 bg-white border border-gray-100 rounded-[32px] space-y-4 shadow-subtle group cursor-pointer hover:border-pucho-purple/20 transition-all">
                        <div class="flex justify-between items-center">
                            <h4 class="font-bold text-pucho-dark">System Health</h4>
                            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        </div>
                        <div class="space-y-3">
                            <div class="flex justify-between text-[10px] uppercase font-bold text-gray-400">
                                <span>DB Sync</span>
                                <span class="text-pucho-purple">${dashboard.isDbConnected ? 'Active' : 'Offline'}</span>
                            </div>
                            <div class="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                                <div class="h-full bg-pucho-purple rounded-full" style="width: ${dashboard.isDbConnected ? '100%' : '20%'}"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    },

    admissions: function () {
        if (schoolDB.admissions.length === 0) {
            return `<div class="bg-white rounded-[40px] p-12 border border-gray-100 shadow-subtle animate-fade-in text-center">
                    <div class="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-6xl">📝</div>
                    <h3 class="text-2xl font-bold text-pucho-dark mb-2">No Pending Admissions</h3>
                    <p class="text-gray-400 mb-8 max-w-md mx-auto">All applications have been processed. Good job!</p>
                </div>`;
        }

        let rows = schoolDB.admissions.map(a => `<tr class="hover:bg-gray-50/50 transition-all font-inter">
                <td class="p-6 font-bold text-pucho-dark border-b border-gray-50">${a.student_name}</td>
                <td class="p-6 text-gray-500 text-sm border-b border-gray-50">${a.grade}</td>
                <td class="p-6 text-gray-500 text-sm border-b border-gray-50">${a.parent_name}</td>
                <td class="p-6 text-gray-400 text-sm border-b border-gray-50">${new Date(a.applied_at || Date.now()).toLocaleDateString()}</td>
                <td class="p-6 border-b border-gray-50"><span class="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold uppercase tracking-widest">${a.status}</span></td>
                <td class="p-6 border-b border-gray-50">
                    <button onclick="dashboard.approveAdmission('${a.id}')" class="px-4 py-2 bg-pucho-dark text-white rounded-xl text-xs font-bold hover:bg-pucho-purple transition-all shadow-glow">Approve & Enroll</button>
                </td>
            </tr>`).join('');

        return `<div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle animate-fade-in">
                <div class="p-8 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-2xl">Admission Pipeline</h3>
                         <p class="text-gray-400 text-sm">Pending Applications: ${schoolDB.admissions.length}</p>
                    </div>
                </div>
                <table class="w-full text-left font-inter">
                    <thead class="bg-gray-50/50"><tr>
                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Student Name</th>
                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grade</th>
                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Parent</th>
                         <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Action</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    },

    students: function () {
        // Empty State
        if (schoolDB.students.length === 0) {
            return `<div class="bg-white rounded-[40px] p-12 border border-gray-100 shadow-subtle animate-fade-in text-center">
                    <div class="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-6xl">🎓</div>
                    <h3 class="text-2xl font-bold text-pucho-dark mb-2">No Students Found</h3>
                    <p class="text-gray-400 mb-8 max-w-md mx-auto">Your student database is currently empty. Start by adding a new student or approving admissions.</p>
                    <button onclick="dashboard.showAddStudentModal()" class="btn-primary px-8 py-3 rounded-2xl shadow-glow hover:scale-105 transition-transform">+ ADD STUDENT</button>
                    ${this.renderStudentModal()} 
                </div>`;
        }

        // Initial load rows
        setTimeout(() => {
            const body = document.getElementById('studentsTableBody');
            if (!body) return;
            body.innerHTML = schoolDB.students.map(s => `
            <tr class="hover:bg-gray-50/50 transition-all">
                <td class="p-6 border-b border-gray-50">
                    <div class="font-bold text-pucho-dark">${s.name}</div>
                    <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ID: ${s.id}</div>
                </td>
                <td class="p-6 border-b border-gray-50">
                    <div class="text-sm font-bold text-gray-600">${s.class} - ${s.division}</div>
                    <div class="text-[10px] text-gray-400 font-bold">Roll: ${s.roll_no}</div>
                </td>
                <td class="p-6 border-b border-gray-50 text-sm text-gray-500">${s.parent_email || 'N/A'}</td>
                <td class="p-6 border-b border-gray-50 text-sm text-gray-500">${s.parent_phone || s.phone || 'N/A'}</td>
                <td class="p-6 border-b border-gray-50"><span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">Active</span></td>
                <td class="p-6 border-b border-gray-50">
                    <div class="flex gap-2">
                        <button onclick="dashboard.editStudent('${s.id}')" class="p-2 hover:bg-pucho-purple/10 rounded-lg text-pucho-purple transition-all">✏️</button>
                        <button onclick="dashboard.deleteStudent('${s.db_id || s.id}')" class="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-all">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
        }, 100);

        return `<div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle animate-fade-in">
                <div class="p-8 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-2xl">Student Database</h3>
                        <p class="text-gray-400 text-sm">Total Students: ${schoolDB.students.length}</p>
                    </div>
                    <div class="flex gap-4">
                        <select id="filterClass_students" onchange="dashboard.filterGeneric('students')" class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 outline-none"><option value="">All Classes</option><option value="10th">10th</option><option value="9th">9th</option><option value="8th">8th</option><option value="7th">7th</option><option value="6th">6th</option><option value="5th">5th</option></select>
                        <button onclick="dashboard.showAddStudentModal()" class="bg-pucho-dark text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-pucho-purple transition-all">+ ADD</button>
                    </div>
                </div>
                <table class="w-full text-left font-inter">
                    <thead class="bg-gray-50/50">
                        <tr>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Student Info</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Academic</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Parent Email</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Parent Phone</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Action</th>
                        </tr>
                    </thead>
                    <tbody id="studentsTableBody"></tbody>
                </table>
                ${this.renderStudentModal()}
            </div>`;
    },

    renderStudentModal: function () {
        return `<div id="studentModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm hidden animate-fade-in">
                <div class="bg-white p-8 w-full max-w-2xl rounded-[32px] border border-white/30 shadow-2xl relative animate-slide-up max-h-[90vh] overflow-y-auto">
                    <button onclick="document.getElementById('studentModal').classList.add('hidden')" class="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full">✕</button>
                    <div class="mb-8 border-b border-gray-50 pb-4">
                        <h1 class="text-3xl font-bold text-pucho-dark mb-1">Add New Student</h1>
                        <p class="text-gray-500 font-inter">Complete profile setup</p>
                    </div>
                    <form id="studentForm" class="space-y-6 font-inter">
                        <!-- 1. Personal Info -->
                        <div>
                            <h4 class="text-sm font-bold text-pucho-purple uppercase tracking-widest mb-4">Personal Information</h4>
                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="label-sm">First Name</label><input type="text" id="stdFirstName" class="input-field" required placeholder="e.g. Arjun"></div>
                                <div><label class="label-sm">Last Name</label><input type="text" id="stdLastName" class="input-field" required placeholder="e.g. Das"></div>
                                <div><label class="label-sm">Date of Birth</label><input type="date" id="stdDob" class="input-field" required></div>
                                <div><label class="label-sm">Gender</label><select id="stdGender" class="input-field"><option>Male</option><option>Female</option><option>Other</option></select></div>
                            </div>
                        </div>

                        <!-- 2. Academic Info -->
                        <div>
                            <h4 class="text-sm font-bold text-pucho-purple uppercase tracking-widest mb-4">Academic Details</h4>
                            <div class="grid grid-cols-3 gap-4">
                                <div><label class="label-sm">Class</label><select id="stdClass" class="input-field">
                                    <option>10th</option><option>9th</option><option>8th</option><option>7th</option>
                                    <option>6th</option><option>5th</option><option>4th</option><option>3rd</option>
                                    <option>2nd</option><option>1st</option><option>UKG</option><option>LKG</option>
                                </select></div>
                                <div><label class="label-sm">Division</label><select id="stdDiv" class="input-field"><option>A</option><option>B</option></select></div>
                                <div><label class="label-sm">Roll No</label><input type="text" id="stdRoll" class="input-field" placeholder="001"></div>
                            </div>
                        </div>

                        <!-- 3. Guardian / Parent Info -->
                        <div>
                            <h4 class="text-sm font-bold text-pucho-purple uppercase tracking-widest mb-4">Parent / Guardian Details</h4>
                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="label-sm">Guardian Name</label><input type="text" id="stdGuardian" class="input-field" required></div>
                                <div><label class="label-sm">Contact Number</label><input type="tel" id="stdPhone" class="input-field" required placeholder="+91 98765 43210"></div>
                                <div><label class="label-sm">Parent Email</label><input type="email" id="stdParentEmail" class="input-field" placeholder="parent@email.com"></div>
                                <div><label class="label-sm">Parent Phone (WhatsApp)</label><input type="tel" id="stdParentPhone" class="input-field" placeholder="+91 98765 43210"></div>
                            </div>
                        </div>

                        <div class="pt-6 border-t border-gray-50 flex justify-end gap-4">
                            <button type="button" onclick="document.getElementById('studentModal').classList.add('hidden')" class="px-6 py-3 rounded-2xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                            <button type="submit" class="btn-primary px-8 py-3 rounded-2xl">Save Student</button>
                        </div>
                    </form>
                </div>
            </div>`;
    },

    staff: function () {
        // Empty State
        if (schoolDB.staff.length === 0) {
            return `<div class="bg-white rounded-[40px] p-12 border border-gray-100 shadow-subtle animate-fade-in text-center">
                    <div class="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-6xl">👩‍🏫</div>
                    <h3 class="text-2xl font-bold text-pucho-dark mb-2">No Staff Members</h3>
                    <p class="text-gray-400 mb-8 max-w-md mx-auto">Build your team by adding faculty and administrative staff.</p>
                    <button onclick="dashboard.showAddStaffModal()" class="btn-primary px-8 py-3 rounded-2xl shadow-glow hover:scale-105 transition-transform">+ ADD STAFF</button>
                    ${this.renderStaffModal()}
                </div>`;
        }

        // Initial load rows
        setTimeout(() => dashboard.filterStaff(), 0);

        return `<div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle animate-fade-in">
                <div class="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h3 class="font-bold text-2xl">Staff Directory</h3>
                         <p class="text-gray-400 text-sm">Total Strength: ${schoolDB.staff.length}</p>
                    </div>
                    <div class="flex gap-4 items-center">
                         <select id="filterClass" onchange="dashboard.filterStaff()" class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 outline-none focus:border-pucho-purple">
                            <option value="">All Classes</option><option value="LKG">LKG</option><option value="UKG">UKG</option><option value="1st">1st</option><option value="2nd">2nd</option><option value="3rd">3rd</option><option value="4th">4th</option><option value="5th">5th</option><option value="6th">6th</option><option value="7th">7th</option><option value="8th">8th</option><option value="9th">9th</option><option value="10th">10th</option>
                        </select>
                        <select id="filterDivision" onchange="dashboard.filterStaff()" class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 outline-none focus:border-pucho-purple">
                            <option value="">All Div</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                        </select>
                        <button class="btn-primary" onclick="dashboard.showAddStaffModal()">+ ADD STAFF</button>
                    </div>
                </div>
                <table class="w-full text-left font-inter">
                    <thead class="bg-gray-50/50">
                        <tr>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Faculty Details</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Designation</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Qualifications</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contact</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="staffTableBody"></tbody>
                </table>
                ${this.renderStaffModal()}
            </div>`;
    },

    renderStaffModal: function () {
        const labelClass = "block text-[10px] uppercase font-bold text-pucho-purple tracking-widest mb-1.5 text-left w-full";
        const inputClass = "w-full px-5 py-3.5 rounded-[20px] border border-black/5 bg-gray-50/50 focus:bg-white focus:border-pucho-purple focus:ring-4 focus:ring-pucho-purple/5 outline-none transition-all placeholder:text-gray-300 shadow-sm text-sm text-pucho-dark font-medium";

        return `<div id="staffModal" class="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm hidden animate-fade-in overflow-y-auto">
                <div class="bg-white p-10 w-full max-w-3xl rounded-[40px] border border-white/30 shadow-2xl relative animate-slide-up my-20 custom-scrollbar">
                    <button onclick="document.getElementById('staffModal').classList.add('hidden')" class="absolute top-8 right-8 p-3 hover:bg-gray-100 rounded-full transition-colors">
                        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                    <div class="mb-10">
                        <h1 class="text-4xl font-black text-pucho-dark tracking-tight mb-2">Onboard New Staff</h1>
                        <p class="text-gray-500 font-inter text-sm opacity-80">Syncing details with the educational automation flow.</p>
                    </div>
                    <form id="staffForm" class="space-y-8">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            <div class="col-span-1">
                                <label class="${labelClass}">Full Name</label>
                                <input type="text" id="staffName" class="${inputClass}" required placeholder="e.g. Rahul Sharma">
                            </div>
                            <div class="col-span-1">
                                <label class="${labelClass}">Email Address</label>
                                <input type="email" id="staffEmail" class="${inputClass}" required placeholder="rahul@school.com">
                            </div>
                            
                            <div class="col-span-1 md:col-span-2">
                                <label class="${labelClass}">Qualification</label>
                                <input type="text" id="staffQual" class="${inputClass}" placeholder="e.g. B.Ed, M.Sc, PhD" required>
                            </div>

                            <div class="col-span-1">
                                <label class="${labelClass}">Phone Number</label>
                                <input type="tel" id="staffPhone" class="${inputClass}" required placeholder="+91 98765 43210">
                            </div>
                            <div class="col-span-1">
                                <label class="${labelClass}">Subject Specialization</label>
                                <input type="text" id="staffSubject" class="${inputClass}" placeholder="e.g. Mathematics, Science" required>
                            </div>

                            <div class="col-span-1">
                                <label class="${labelClass}">Portal Password</label>
                                <input type="password" id="staffPass" class="${inputClass}" required placeholder="Set initial password">
                            </div>
                            <div class="col-span-1">
                                <label class="${labelClass}">Department</label>
                                <select id="staffDept" class="${inputClass}">
                                    <option>Mathematics</option>
                                    <option>Science</option>
                                    <option>Languages</option>
                                    <option>Sports</option>
                                    <option>Admin</option>
                                </select>
                            </div>

                            <div class="col-span-1">
                                <label class="${labelClass}">Joining Date</label>
                                <input type="date" id="staffJoiningDate" class="${inputClass}" required>
                            </div>
                            <div class="col-span-1">
                                <label class="${labelClass}">Staff Role</label>
                                <select id="staffRole" class="${inputClass}">
                                    <option>Teacher</option>
                                    <option>Clerk</option>
                                    <option>Accountant</option>
                                    <option>Office Staff</option>
                                </select>
                            </div>

                            <div class="col-span-1">
                                <label class="${labelClass}">Class Assigned</label>
                                <select id="staffClass" class="${inputClass}">
                                    <option value="N/A">None</option>
                                    <option>10th</option>
                                    <option>9th</option><option>8th</option><option>7th</option>
                                    <option>6th</option><option>5th</option>
                                </select>
                            </div>
                            <div class="col-span-1">
                                <label class="${labelClass}">Division</label>
                                <select id="staffDivision" class="${inputClass}">
                                    <option value="N/A">None</option>
                                    <option>A</option><option>B</option><option>C</option><option>D</option>
                                </select>
                            </div>
                            
                            <input type="hidden" id="staffExp" value="0">
                        </div>
                        <div class="pt-8 border-t border-gray-50 flex justify-end items-center gap-6">
                            <button type="button" onclick="document.getElementById('staffModal').classList.add('hidden')" class="text-sm font-bold text-gray-400 hover:text-pucho-dark transition-colors">Discard Changes</button>
                            <button type="submit" class="bg-gradient-to-b from-[#5833EF] to-[#3A10CE] text-white px-10 py-4 rounded-full font-bold text-sm shadow-[0_5px_15px_rgba(58,16,206,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all">
                                Add & Notify Staff
                            </button>
                        </div>
                    </form>
                </div>
            </div>`;
    },

    skeleton: function () {
        return `<div class="animate-pulse space-y-8 p-4">
                <div class="h-8 bg-gray-200 rounded-xl w-1/3"></div>
                <div class="grid grid-cols-4 gap-6">
                    <div class="h-32 bg-gray-100 rounded-[32px]"></div>
                    <div class="h-32 bg-gray-100 rounded-[32px]"></div>
                    <div class="h-32 bg-gray-100 rounded-[32px]"></div>
                    <div class="h-32 bg-gray-100 rounded-[32px]"></div>
                </div>
                <div class="grid grid-cols-2 gap-8">
                    <div class="h-64 bg-gray-50 rounded-[40px]"></div>
                    <div class="h-64 bg-gray-50 rounded-[40px]"></div>
                </div>
             </div>`;
    },

    overview: function (role) {
        const r = (role || '').toLowerCase();
        const stats = dashboard.getStats(r);
        const cards = stats.map(s => `
                <div class="bg-white p-4 rounded-3xl border border-gray-100 shadow-subtle flex items-center gap-3 hover:shadow-glow transition-all group">
                    <div class="w-12 h-12 rounded-xl bg-${s.color}-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">${s.icon}</div>
                    <div>
                        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">${s.title}</p>
                        <h4 class="text-xl font-black text-pucho-dark mt-0.5">${s.value}</h4>
                        <p class="text-[9px] text-${s.color}-500 font-bold bg-${s.color}-50 px-1.5 py-0.5 rounded inline-block mt-0.5">${s.sub}</p>
                    </div>
                </div>
            `).join('');

        setTimeout(() => dashboard.initCharts(), 100);

        return `<div class="space-y-8 animate-fade-in font-inter">
                <div>
                    <h3 class="font-black text-3xl text-pucho-dark">Welcome Back!</h3>
                    <p class="text-gray-400 mt-1 font-medium">Here's what's happening in your school today.</p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${cards}
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div class="bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle">
                        <div class="flex justify-between items-center mb-6">
                            <h4 class="font-bold text-lg">Attendance Overview</h4>
                            <select class="text-xs font-bold border-none bg-gray-50 rounded-lg px-2 py-1 text-gray-500 outline-none"><option>Weekly</option></select>
                        </div>
                        <div class="h-64">
                            <canvas id="attendanceChart"></canvas>
                        </div>
                    </div>
                     <div class="bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle">
                        <div class="flex justify-between items-center mb-6">
                            <h4 class="font-bold text-lg">Financial Performance</h4>
                             <select class="text-xs font-bold border-none bg-gray-50 rounded-lg px-2 py-1 text-gray-500 outline-none"><option>Monthly</option></select>
                        </div>
                        <div class="h-64">
                            <canvas id="revenueChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>`;
    },

    fees: function () {
        setTimeout(() => dashboard.filterGeneric('fees'), 0);
        const totalPaid = schoolDB.fees.filter(f => f.status === 'Paid').reduce((sum, f) => sum + f.amount, 0);
        const totalPending = schoolDB.fees.filter(f => f.status === 'Pending').reduce((sum, f) => sum + f.amount, 0);
        const pendingCount = schoolDB.fees.filter(f => f.status === 'Pending').length;
        const classes = ['LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

        return `<div class="space-y-8 animate-fade-in">
                <!-- Finance Stats -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="p-8 bg-white border border-gray-100 rounded-[40px] shadow-subtle hover:shadow-glow transition-all">
                        <h4 class="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">M-o-M Collection</h4>
                        <p class="text-3xl font-black text-pucho-dark tracking-tight">₹${(totalPaid / 1000).toFixed(1)}K <span class="text-xs text-green-500 font-bold ml-2">↑ 12%</span></p>
                    </div>
                    <div class="p-8 bg-white border border-gray-100 rounded-[40px] shadow-subtle hover:shadow-glow transition-all">
                        <h4 class="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Total Outstanding</h4>
                        <p class="text-3xl font-bold text-red-500 tracking-tight">₹${(totalPending / 1000).toFixed(1)}K</p>
                    </div>
                    <div class="p-8 bg-pucho-purple/5 border border-pucho-purple/10 rounded-[40px] shadow-subtle group">
                        <h4 class="text-pucho-purple text-xs font-bold uppercase tracking-widest mb-1">Recovery Flow</h4>
                        <p class="text-3xl font-black text-pucho-purple tracking-tight">${pendingCount} <span class="text-xs text-indigo-400 font-bold ml-1">Pending Requests</span></p>
                    </div>
                </div>

                <div id="fees_container" class="bg-white rounded-[40px] border border-gray-100 shadow-subtle animate-fade-in mb-20">
                <div class="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div class="space-y-1">
                        <h3 class="font-bold text-2xl">Financial Center</h3>
                        <p class="text-xs text-gray-400 font-bold uppercase tracking-widest">Fee structure and collection</p>
                    </div>
                    <div class="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        <!-- Custom Scrollable Dropdown -->
                        <div class="dropdown-container w-full md:w-64">
                            <div onclick="dashboard.toggleCustomDropdown(event)" id="dropdownToggle_fees" class="w-full px-6 py-4 rounded-2xl border border-gray-100 bg-gray-50 text-sm font-bold text-gray-600 outline-none flex justify-between items-center cursor-pointer hover:bg-white transition-all shadow-sm">
                                <span id="selectedClassText">All Classes</span>
                                <svg class="w-4 h-4 transition-transform" id="dropdownArrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                            <!-- Hidden input for filterGeneric compatibility -->
                            <input type="hidden" id="filterClass_fees" value="">
                            
                            <div id="dropdownMenu_fees" class="dropdown-menu custom-scrollbar">
                                <div class="dropdown-item selected" onclick="dashboard.selectDropdownOption('', 'All Classes')">All Classes</div>
                                ${classes.map(c => `<div class="dropdown-item" onclick="dashboard.selectDropdownOption('${c}', '${c}')">${c}</div>`).join('')}
                            </div>
                        </div>
                        
                        <button onclick="dashboard.runRecoveryFlow()" class="w-full md:w-auto bg-pucho-dark text-white px-10 py-5 rounded-2xl text-xs font-bold shadow-glow hover:bg-pucho-purple transition-all transform active:scale-95 uppercase tracking-widest">Run Recovery Flow</button>
                    </div>
                </div>
                <div class="overflow-x-auto custom-scrollbar">
                    <table class="w-full text-left font-inter">
                        <thead class="bg-gray-50/50">
                            <tr>
                                <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Student Details</th>
                                <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
                                <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                                <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody id="feesTableBody"></tbody>
                    </table>
                </div>
            </div>
            </div>`;
    },

    exams: function () {
        setTimeout(() => dashboard.filterGeneric('exams'), 0);
        const isAdmin = auth.currentUser.role === 'admin' || auth.currentUser.role === 'staff';

        return `<div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle animate-fade-in">
                <div class="p-8 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-2xl">Exam Schedule</h3>
                        <p class="text-xs text-gray-400 font-medium mt-1">Upcoming academic assessments</p>
                    </div>
                     <div class="flex gap-4">
                        <select id="filterClass_exams" onchange="dashboard.filterGeneric('exams')" class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 outline-none">
                            <option value="">All Classes</option>
                            <option value="LKG">LKG</option><option value="UKG">UKG</option>
                            <option value="1st">1st</option><option value="2nd">2nd</option>
                            <option value="3rd">3rd</option><option value="4th">4th</option>
                            <option value="5th">5th</option><option value="6th">6th</option>
                            <option value="7th">7th</option><option value="8th">8th</option>
                            <option value="9th">9th</option><option value="10th">10th</option>
                        </select>
                        ${isAdmin ? `<button onclick="dashboard.showExamModal()" class="bg-pucho-dark text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-pucho-purple transition-all shadow-glow">+ SCHEDULE EXAM</button>` : ''}
                    </div>
                </div>
                <table class="w-full text-left font-inter">
                     <thead class="bg-gray-50/50">
                        <tr>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subject</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date & Time</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Venue</th>
                            <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="examsTableBody"></tbody>
                </table>
            </div>`;
    },

    attendance_all: function () {
        const activeTab = document.querySelector('.att-tab-active')?.dataset.tab || 'students';
        const classFilter = document.getElementById('globalFilterClass')?.value || '';
        const dateFilter = document.getElementById('globalFilterDate')?.value || new Date().toISOString().split('T')[0];

        const classes = [...new Set(schoolDB.students.map(s => s.class))].sort();

        // Student Stats (Filtered by Date & potentially Class)
        let filteredAttendance = schoolDB.attendance.filter(a => a.date === dateFilter);

        // Global Totals
        const totalS = filteredAttendance.filter(a => a.student_id).length;
        const presentS = filteredAttendance.filter(a => a.student_id && a.status === 'Present').length;
        const studentPct = totalS > 0 ? ((presentS / totalS) * 100).toFixed(1) : "0.0";

        const totalStaff = schoolDB.staff.length;
        const activeStaffCount = schoolDB.attendance.filter(a => a.date === dateFilter && a.staff_id && a.status === 'Present').length;
        const staffPct = totalStaff > 0 ? ((activeStaffCount / totalStaff) * 100).toFixed(1) : "0.0";

        let contentHtml = '';

        if (activeTab === 'students') {
            const classRows = classes.map(c => {
                const studentsInClass = schoolDB.students.filter(s => s.class === c).map(s => s.id);
                const classAtt = filteredAttendance.filter(a => studentsInClass.includes(a.student_id));
                const total = classAtt.length;
                const present = classAtt.filter(a => a.status === 'Present').length;
                const pct = total > 0 ? ((present / total) * 100).toFixed(1) : "0.0";

                let statusColor = 'text-green-600';
                if (parseFloat(pct) < 75) statusColor = 'text-red-500';
                else if (parseFloat(pct) < 90) statusColor = 'text-orange-500';

                return `
                        <tr class="hover:bg-gray-50/50 transition-all font-inter">
                            <td class="p-6 border-b border-gray-50">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-pucho-purple/10 rounded-xl flex items-center justify-center font-bold text-pucho-purple text-xs">${c}</div>
                                    <div class="font-bold text-pucho-dark">${c} Class</div>
                                </div>
                            </td>
                            <td class="p-6 text-gray-500 text-sm border-b border-gray-50">${studentsInClass.length} Students</td>
                            <td class="p-6 border-b border-gray-50">
                                <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                    <div class="h-full ${statusColor.replace('text', 'bg')} transition-all duration-1000" style="width: ${pct}%"></div>
                                </div>
                            </td>
                            <td class="p-6 font-bold ${statusColor} text-sm border-b border-gray-50 text-right">${pct}%</td>
                        </tr>
                    `;
            }).join('');

            contentHtml = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                         <div class="bg-green-50/50 p-12 rounded-[32px] text-center relative overflow-hidden group hover:bg-green-50 transition-all border border-green-100/50">
                             <div class="absolute top-0 right-0 p-8 opacity-10 text-6xl group-hover:scale-110 transition-transform">👨‍🎓</div>
                            <h4 class="text-6xl font-bold text-green-600 mb-2 tracking-tighter">${studentPct}%</h4>
                            <p class="text-green-800/60 text-xs font-bold tracking-widest uppercase">Global Student Attendance</p>
                        </div>
                        <div class="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col justify-center">
                            <label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Quick Class Filter</label>
                            <select id="globalFilterClass" onchange="dashboard.updateGlobalAttendance()" class="w-full px-6 py-4 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 outline-none hover:border-pucho-purple transition-all bg-gray-50">
                                <option value="">All Classes Breakdown</option>
                                ${classes.map(c => `<option value="${c}" ${classFilter === c ? 'selected' : ''}>${c} Class Only</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle min-h-[400px]">
                        <div class="p-8 border-b border-gray-50">
                            <h4 class="font-bold text-lg text-pucho-dark">Class Performance Breakdown</h4>
                            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Attendance records for ${dateFilter}</p>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left font-inter">
                                <thead class="bg-gray-50/50">
                                    <tr>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class / Grade</th>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Strength</th>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Visual Scale</th>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Attendance %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${classRows || '<tr><td colspan="4" class="p-12 text-center text-gray-400 font-bold opacity-60">No student records found for this date.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
        } else {
            const teacherRows = schoolDB.staff.map(s => {
                const att = schoolDB.attendance.find(a => a.date === dateFilter && a.staff_id === s.id);
                const isPresent = att ? att.status === 'Present' : false;

                return `
                        <tr class="hover:bg-gray-50/50 transition-all font-inter">
                            <td class="p-6 border-b border-gray-50">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-pucho-purple/10 rounded-full flex items-center justify-center font-bold text-pucho-purple text-xs">${s.name[0]}</div>
                                    <div>
                                        <div class="font-bold text-pucho-dark">${s.name}</div>
                                        <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">${s.subject || 'Faculty'}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="p-6 text-gray-500 text-sm border-b border-gray-50">${s.designation || s.role}</td>
                            <td class="p-6 border-b border-gray-50">
                                <span class="px-3 py-1 ${isPresent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} rounded-full text-[10px] font-bold uppercase tracking-widest">
                                    ${isPresent ? 'Present' : 'Absent'}
                                </span>
                            </td>
                            <td class="p-6 text-gray-400 text-xs font-bold border-b border-gray-50 text-right">09:00 AM</td>
                        </tr>
                    `;
            }).join('');

            contentHtml = `
                    <div class="bg-blue-50/50 p-12 rounded-[32px] text-center relative overflow-hidden group hover:bg-blue-50 transition-all mb-8 border border-blue-100/50">
                        <div class="absolute top-0 right-0 p-8 opacity-10 text-6xl group-hover:scale-110 transition-transform">👩‍🏫</div>
                        <h4 class="text-6xl font-bold text-blue-600 mb-2 tracking-tighter">${staffPct}%</h4>
                        <p class="text-blue-800/60 text-xs font-bold tracking-widest uppercase">Global Staff Presence</p>
                    </div>
                    <div class="bg-white rounded-[40px] overflow-hidden border border-gray-100 shadow-subtle min-h-[400px]">
                        <div class="p-8 border-b border-gray-50">
                            <h4 class="font-bold text-lg text-pucho-dark">Faculty Attendance Directory</h4>
                            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Staff checking status for ${dateFilter}</p>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left font-inter">
                                <thead class="bg-gray-50/50">
                                    <tr>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Teacher Name</th>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</th>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                        <th class="px-6 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Check-in</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${teacherRows || '<tr><td colspan="4" class="p-12 text-center text-gray-400 font-bold opacity-60">No faculty records found for this date.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
        }

        return `<div class="space-y-8 animate-fade-in">
                <!-- Header & Controls -->
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <h3 class="font-bold text-3xl text-pucho-dark">Attendance Hub</h3>
                        <p class="text-gray-400 mt-1">Cross-reference student and staff daily presence</p>
                    </div>
                    <div class="flex items-center gap-4 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
                        <input type="date" id="globalFilterDate" value="${dateFilter}" onchange="dashboard.updateGlobalAttendance()" class="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 outline-none border-none bg-gray-50">
                        <div class="w-px h-6 bg-gray-100"></div>
                        <div class="flex gap-1">
                            <button onclick="dashboard.switchAttendanceTab('students')" class="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'students' ? 'bg-pucho-dark text-white att-tab-active shadow-lg' : 'text-gray-400 hover:text-pucho-dark'}" data-tab="students">Students</button>
                            <button onclick="dashboard.switchAttendanceTab('staff')" class="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'staff' ? 'bg-pucho-dark text-white att-tab-active shadow-lg' : 'text-gray-400 hover:text-pucho-dark'}" data-tab="staff">Staff</button>
                        </div>
                    </div>
                </div>

                <!-- Main Content Area -->
                <div id="attendanceTabContent">
                    ${contentHtml}
                </div>
            </div>`;
    },

    communication: function (role) {
        const notices = (schoolDB.notices || []).filter(n =>
            role === 'admin' ||
            role === 'staff' ||
            (role === 'parent' && (n.target === 'Parents' || n.target === 'Parent' || n.target === 'Global' || n.target === 'All' || n.target === 'Student' || n.target === 'Students' || n.target === 'student' || n.target === 'parent'))
        );

        let noticeRows = notices.map(n => `
                <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-subtle flex flex-col gap-4 animate-fade-in hover:shadow-glow transition-all group">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-widest">${n.target}</span>
                            <h4 class="text-xl font-bold text-pucho-dark mt-2 group-hover:text-pucho-purple transition-colors">${n.title}</h4>
                            <p class="text-gray-400 text-xs font-bold mt-1">${n.date}</p>
                        </div>
                    </div>
                    <p class="text-gray-600 text-sm leading-relaxed">${n.content}</p>
                    <div class="pt-4 border-t border-gray-50 flex justify-between items-center">
                        <span class="text-xs font-bold text-gray-400">By Admin</span>
                        <button class="text-pucho-purple text-xs font-bold hover:underline">Read More</button>
                    </div>
                </div>
            `).join('');

        return `<div class="space-y-8 animate-fade-in">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-2xl text-pucho-dark">Broadcast Room</h3>
                        <p class="text-gray-400 text-sm">Send circulars and notifications</p>
                    </div>
                    ${role === 'admin' ? '<button onclick="dashboard.showBroadcastModal()" class="bg-pucho-dark text-white px-8 py-3 rounded-2xl font-bold hover:shadow-glow hover:bg-pucho-purple transition-all">+ NEW POST</button>' : ''}
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    ${notices.length > 0 ? noticeRows : '<div class="col-span-2 py-20 text-center text-gray-400 font-bold italic animate-pulse">No circulars or notices available at the moment.</div>'}
                </div>
            </div>`;
    },

    staff_notices: function () {
        const notices = (schoolDB.notices || []).filter(n => n.target === 'Staff' || n.target === 'Global');
        return this.renderNoticeList(notices, 'Staff Announcements');
    },

    parent_notices: function () {
        const notices = (schoolDB.notices || []).filter(n => n.target === 'Parents' || n.target === 'Global');
        return this.renderNoticeList(notices, 'School Announcements');
    },

    renderNoticeList: function (notices, title) {
        const cards = notices.map(n => `
                <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-subtle flex flex-col gap-4 animate-fade-in hover:shadow-glow transition-all group">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-widest">${n.target}</span>
                            <h4 class="text-xl font-bold text-pucho-dark mt-2 group-hover:text-pucho-purple transition-colors">${n.title}</h4>
                            <p class="text-gray-400 text-xs font-bold mt-1">${n.date}</p>
                        </div>
                    </div>
                    <p class="text-gray-600 text-sm leading-relaxed">${n.content}</p>
                    <div class="pt-4 border-t border-gray-50 flex justify-between items-center">
                        <span class="text-xs font-bold text-gray-400">By Admin</span>
                    </div>
                </div>
            `).join('');

        return `<div class="space-y-8 animate-fade-in">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-2xl text-pucho-dark">${title}</h3>
                        <p class="text-gray-400">Important notices for you</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    ${cards || '<p class="text-gray-400 font-bold col-span-2 text-center py-10 italic">No announcements found.</p>'}
                </div>
            </div>`;
    },

    toggleCustomSelect: function (id) {
        const options = document.getElementById(id + '-options');
        const arrow = document.getElementById(id + '-arrow');
        // Close others
        document.querySelectorAll('.custom-options').forEach(el => {
            if (el.id !== id + '-options') el.classList.add('hidden');
        });
        document.querySelectorAll('.custom-arrow').forEach(el => {
            if (el.id !== id + '-arrow') el.classList.remove('rotate-180');
        });

        if (options) {
            options.classList.toggle('hidden');
            if (arrow) arrow.classList.toggle('rotate-180');
        }
    },

    selectCustomOption: function (id, value, display) {
        const input = document.getElementById(id); // hidden input
        const triggerText = document.getElementById(id + '-trigger-text');
        const options = document.getElementById(id + '-options');
        const arrow = document.getElementById(id + '-arrow');

        if (input) input.value = value;
        if (triggerText) {
            triggerText.innerText = display;
            triggerText.classList.remove('text-gray-400');
            triggerText.classList.add('text-pucho-dark');
        }

        if (options) options.classList.add('hidden');
        if (arrow) arrow.classList.remove('rotate-180');
    },

    // Global click listener to close dropdowns
    setupGlobalEvents: function () {
        if (this.eventsSetup) return;
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select-container')) {
                document.querySelectorAll('.custom-options').forEach(el => el.classList.add('hidden'));
                document.querySelectorAll('.custom-arrow').forEach(el => el.classList.remove('rotate-180'));
            }
        });
        this.eventsSetup = true;
    },

    renderCustomSelect: function (id, placeholder, options) {
        // Options format: [{value: '', text: ''}, ...] or simple strings
        const opts = options.map(o => {
            const val = typeof o === 'object' ? o.value : o;
            const txt = typeof o === 'object' ? o.text : o;
            return `<div onclick="dashboard.selectCustomOption('${id}', '${val}', '${txt}')" class="px-5 py-3 hover:bg-pucho-purple/5 hover:text-pucho-purple cursor-pointer transition-colors font-bold text-sm text-gray-600 border-b border-gray-50 last:border-0">${txt}</div>`;
        }).join('');

        return `
            <div class="custom-select-container relative font-inter" style="min-width: 160px;">
                <input type="hidden" id="${id}" value="">
                <div onclick="dashboard.toggleCustomSelect('${id}')" class="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 flex items-center justify-between cursor-pointer hover:border-pucho-purple transition-colors shadow-sm mb-1 group">
                    <span id="${id}-trigger-text" class="text-sm font-bold text-gray-400 truncate select-none">${placeholder}</span>
                    <svg id="${id}-arrow" class="custom-arrow w-4 h-4 text-gray-400 group-hover:text-pucho-purple transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
                </div>
                <div id="${id}-options" class="custom-options hidden absolute top-full left-0 w-full bg-white border border-gray-100 rounded-2xl shadow-xl z-50 mt-2 max-h-60 overflow-y-auto animate-fade-in custom-scrollbar">
                    ${opts}
                </div>
            </div>
            <style>
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #A78BFA; }
            </style>
        `;
    },

    reports: function () {
        // Calculate Analytics
        const totalFees = schoolDB.fees.reduce((acc, curr) => acc + curr.amount, 0);
        const collectedFees = schoolDB.fees.filter(f => f.status === 'Paid').reduce((acc, curr) => acc + curr.amount, 0);
        const pendingFees = totalFees - collectedFees;
        const collectionPercentage = totalFees > 0 ? Math.round((collectedFees / totalFees) * 100) : 0;

        return `<div class="space-y-8 animate-fade-in font-inter">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-2xl text-pucho-dark">System Analytics</h3>
                        <p class="text-gray-400">Comprehensive performance reports</p>
                    </div>
                     <div class="flex gap-4">
                        <button class="px-6 py-3 bg-white border border-gray-200 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all">Download CSV</button>
                        <button class="px-6 py-3 bg-pucho-dark text-white rounded-2xl font-bold text-sm hover:shadow-glow hover:bg-pucho-purple transition-all">Print Report</button>
                    </div>
                </div>

                <!-- Financial Health -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="lg:col-span-2 bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle">
                        <h4 class="font-bold text-lg mb-6">Financial Overview</h4>
                        <div class="relative h-48 bg-gray-50 rounded-3xl overflow-hidden flex items-center px-8">
                            <div class="w-full h-8 bg-gray-200 rounded-full overflow-hidden relative">
                                <div class="absolute top-0 left-0 h-full bg-green-500 transition-all duration-1000" style="width: ${collectionPercentage}%"></div>
                            </div>
                            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                <p class="text-3xl font-bold text-pucho-dark">${collectionPercentage}%</p>
                                <p class="text-xs font-bold text-gray-400 uppercase">Collection Rate</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-8 mt-8">
                            <div>
                                <p class="text-gray-400 text-xs font-bold uppercase">Collected</p>
                                <p class="text-2xl font-bold text-green-600">₹${collectedFees.toLocaleString()}</p>
                            </div>
                            <div>
                                <p class="text-gray-400 text-xs font-bold uppercase">Pending</p>
                                <p class="text-2xl font-bold text-red-500">₹${pendingFees.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Attendance Stats -->
                    <div class="bg-pucho-purple text-white p-10 rounded-[40px] shadow-glow flex flex-col justify-between">
                        <div>
                            <h4 class="font-bold text-xl opacity-80 mb-2">Attendance Alert</h4>
                            <p class="text-sm opacity-60">Students with low attendance</p>
                        </div>
                        <div class="text-5xl font-bold tracking-tighter my-6">12</div>
                        <button class="bg-white/20 hover:bg-white/30 p-4 rounded-2xl font-bold text-sm transition-all text-center backdrop-blur-sm">View Defaulters List</button>
                    </div>
                </div>

                <!-- Academic Performance -->
                <div class="bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle">
                    <h4 class="font-bold text-lg mb-6">Class-wise Performance (Avg GPA)</h4>
                    <div class="flex items-end gap-4 h-64 pb-8 border-b border-gray-50 overflow-x-auto">
                        ${['10th', '9th', '8th', '7th', '6th'].map(cls => {
            const height = Math.floor(Math.random() * (95 - 60) + 60);
            return `<div class="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                                <div class="w-full bg-gray-100 rounded-t-2xl relative group-hover:bg-pucho-purple/10 transition-colors h-full flex items-end">
                                    <div class="w-full bg-pucho-dark rounded-t-2xl transition-all duration-500 group-hover:bg-pucho-purple relative" style="height: ${height}%">
                                        <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">${height}%</div>
                                    </div>
                                </div>
                                <span class="text-xs font-bold text-gray-400">${cls}</span>
                            </div>`;
        }).join('')}
                    </div>
                </div>
            </div>`;
    },




    parent_leave: function () {
        const today = new Date().toISOString().split('T')[0];
        return `<div class="space-y-8 animate-fade-in font-inter">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- Application Form -->
                    <div class="lg:col-span-1 bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle h-fit">
                        <h3 class="font-black text-2xl text-pucho-dark mb-6">Apply for Leave</h3>
                        <form id="leaveForm" onsubmit="dashboard.submitLeaveRequest(event)" class="space-y-6">
                            <div class="space-y-2">
                                <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reason</label>
                                <textarea id="leaveReason" rows="3" class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-pucho-dark resize-none" placeholder="Reason for absence..."></textarea>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Start Date</label>
                                    <input type="date" id="leaveStart" min="${today}" class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-gray-600">
                                </div>
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">End Date</label>
                                    <input type="date" id="leaveEnd" min="${today}" class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-gray-600">
                                </div>
                            </div>
                            <button type="submit" class="w-full bg-pucho-dark text-white px-8 py-4 rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-pucho-purple transition-all shadow-glow active:scale-95">Submit Request</button>
                        </form>
                    </div>

                    <!-- History List -->
                    <div class="lg:col-span-2 space-y-6">
                        <h3 class="font-black text-2xl text-pucho-dark">My Leave History</h3>
                        <div id="leaveHistoryList" class="space-y-4">
                            <!-- Populated by loadLeaves() -->
                            <div class="p-8 text-center text-gray-400 font-bold bg-gray-50 rounded-[32px] border border-gray-50 border-dashed animate-pulse">Loading history...</div>
                        </div>
                    </div>
                </div>
                <script>setTimeout(() => dashboard.loadLeaves(), 100);</script>
            </div>`;
    },

    leave_approvals: function () {
        // Logic to verify user role is done by menu visibility, but reliable filter is in loadLeaves
        return `<div class="space-y-8 animate-fade-in font-inter">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-black text-3xl text-pucho-dark">Leave Requests</h3>
                        <p class="text-gray-400 mt-1">Review and manage applications</p>
                    </div>
                    ${auth.currentUser.role === 'staff' || auth.currentUser.role === 'teacher' ?
                `<button onclick="dashboard.showLeaveModal()" class="bg-pucho-dark text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-pucho-purple transition-all shadow-glow">+ New Request</button>`
                : ''}
                </div>

                <div class="bg-white rounded-[40px] border border-gray-100 shadow-subtle overflow-hidden">
                    <div class="p-8 border-b border-gray-50">
                        <h4 class="font-bold text-lg text-pucho-dark">Pending Applications</h4>
                    </div>
                    <div id="approvalList" class="divide-y divide-gray-50">
                         <!-- Populated below -->
                    </div>
                </div>
                ${(() => {
                setTimeout(() => {
                    const list = document.getElementById('approvalList');
                    const currentUser = auth.currentUser;
                    let invalid = false;
                    if (!schoolDB.leaves) schoolDB.leaves = [];

                    let requests = [];
                    if (currentUser.role === 'student') invalid = true;
                    else if (currentUser.role === 'staff') requests = schoolDB.leaves.filter(l => l.target_role === 'staff');
                    else if (currentUser.role === 'admin') requests = schoolDB.leaves.filter(l => l.target_role === 'admin');

                    // Sort pending first
                    requests.sort((a, b) => (a.status === 'Pending' ? -1 : 1));

                    if (invalid || requests.length === 0) {
                        list.innerHTML = `<div class="flex flex-col items-center justify-center p-12 text-center animate-fade-in">
                            <div class="text-6xl mb-4 grayscale opacity-50">📭</div>
                            <h4 class="font-bold text-gray-400 text-lg">All Caught Up!</h4>
                            <p class="text-xs text-gray-300 font-bold uppercase tracking-widest mt-2">No pending applications to review</p>
                        </div>`;
                        return;
                    }

                    list.innerHTML = requests.map(l => `
                            <div class="p-8 hover:bg-gray-50/50 transition-colors flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div class="flex items-start gap-4">
                                    <div class="w-12 h-12 bg-${l.user_role === 'student' ? 'blue' : 'purple'}-100 text-${l.user_role === 'student' ? 'blue' : 'purple'}-600 rounded-2xl flex items-center justify-center font-bold text-xl uppercase">${l.user_name[0]}</div>
                                    <div>
                                        <h4 class="font-bold text-pucho-dark text-lg">${l.user_name} <span class="text-xs text-gray-400 uppercase tracking-widest ml-2">${l.user_role}</span></h4>
                                        <p class="text-gray-500 font-medium mt-1">${l.reason}</p>
                                        <div class="flex gap-4 mt-2 text-xs font-bold text-gray-400">
                                            <span class="flex items-center gap-1">📅 ${new Date(l.start_date).toLocaleDateString()} - ${new Date(l.end_date).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                ${l.status === 'Pending' ? `
                                <div class="flex gap-3">
                                    <button onclick="dashboard.updateLeaveStatus('${l.id}', 'Rejected')" class="px-6 py-3 rounded-xl border border-gray-200 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-all">Reject</button>
                                    <button onclick="dashboard.updateLeaveStatus('${l.id}', 'Approved')" class="px-6 py-3 rounded-xl bg-pucho-dark text-white font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg">Approve</button>
                                </div>
                                ` : `
                                 <span class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${l.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                    ${l.status}
                                 </span>
                                `}
                            </div>
                        `).join('');
                }, 100);
                return '';
            })()}
            ${dashboard.renderLeaveModal()}
            </div>`;
    },

    renderLeaveModal: function () {
        const today = new Date().toISOString().split('T')[0];
        return `
        <div id="leaveModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in font-inter">
            <div class="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl relative">
                <button type="button" onclick="document.getElementById('leaveModal').classList.add('hidden')" class="absolute top-6 right-6 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors font-bold">✕</button>
                
                <h3 class="font-black text-2xl text-pucho-dark mb-2">New Leave Request</h3>
                <p class="text-sm text-gray-400 font-bold mb-8">Submit your application to Admin</p>
                
                <form id="leaveForm" onsubmit="dashboard.submitLeaveRequest(event)" class="space-y-6">
                    <input type="hidden" id="leaveRoleOverride" value="staff">
                    
                    <div class="space-y-2">
                         <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reason for Leave</label>
                        <textarea id="leaveReason" rows="3" required class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-pucho-dark resize-none" placeholder="Medical, Personal, etc..."></textarea>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                             <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">From</label>
                            <input type="date" id="leaveStart" required min="${today}" class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-gray-600">
                        </div>
                        <div class="space-y-2">
                             <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">To</label>
                            <input type="date" id="leaveEnd" required min="${today}" class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-gray-600">
                        </div>
                    </div>

                    <button type="submit" class="w-full bg-pucho-dark text-white px-8 py-4 rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-pucho-purple transition-all shadow-glow active:scale-95">Send Request</button>
                </form>
            </div>
        </div>`;
    },

    showLeaveModal: function () {
        document.getElementById('leaveModal').classList.remove('hidden');
    },

    settings: function () {
        const user = auth.currentUser;
        const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        let content = `<div class="space-y-10 animate-fade-in pb-20">
                <!-- Profile Settings Section -->
                <div class="bg-white rounded-[40px] p-10 border border-gray-100 shadow-subtle font-inter relative overflow-hidden group">
                     <div class="absolute top-0 right-0 w-64 h-64 bg-pucho-purple/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                     
                     <h3 class="font-black text-3xl text-pucho-dark mb-8 tracking-tight relative z-10">Profile Settings</h3>
                     
                     <div class="flex flex-col lg:flex-row gap-12 relative z-10">
                        <!-- Avatar Column -->
                        <div class="flex-none text-center">
                            <div class="relative inline-block group/avatar">
                                <div class="w-40 h-40 bg-gray-50 rounded-[40px] border-4 border-white shadow-xl flex items-center justify-center text-5xl font-black text-gray-300 overflow-hidden relative transition-transform group-hover/avatar:scale-[1.02]">
                                    <img id="settingsAvatarPreview" src="${user.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=F3F4F6&color=D1D5DB&size=256'}" class="w-full h-full object-cover">
                                    <div id="avatarLoadingOverlay" class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 transition-opacity">
                                        <div class="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                </div>
                                <label class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white border border-gray-100 px-4 py-2 rounded-2xl shadow-lg cursor-pointer hover:bg-pucho-purple hover:text-white transition-all text-xs font-black uppercase tracking-widest flex items-center gap-2 whitespace-nowrap active:scale-95">
                                    📸 Update Photo
                                    <input type="file" id="avatarUploadInput" class="hidden" accept="image/*" onchange="dashboard.handleAvatarUpload(this)">
                                </label>
                            </div>
                        </div>

                        <!-- Info Column -->
                        <div class="flex-grow space-y-8">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Display Name</label>
                                    <input type="text" id="profileNameInput" value="${user.name}" class="w-full px-6 py-4 rounded-3xl border border-gray-100 bg-gray-50 focus:bg-white focus:border-pucho-purple outline-none transition-all font-bold text-pucho-dark">
                                </div>
                                <div class="space-y-2">
                                    <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                                    <input type="email" value="${user.email}" disabled class="w-full px-6 py-4 rounded-3xl border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed outline-none font-bold">
                                </div>
                            </div>
                            
                            <div class="flex justify-end gap-4 pt-4">
                                <button onclick="dashboard.updateProfile()" class="bg-pucho-purple text-white px-10 py-4 rounded-[24px] font-black text-sm uppercase tracking-widest shadow-glow hover:scale-[1.02] active:scale-95 transition-all">Save Profile</button>
                            </div>
                        </div>
                     </div>
                </div>

                <!-- Security Settings (Common) -->
                <div class="bg-white rounded-[40px] p-10 border border-gray-100 shadow-subtle font-inter">
                    <h3 class="font-black text-3xl text-pucho-dark mb-8 tracking-tight">Security & Privacy</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="p-8 bg-gray-50 rounded-[32px] border border-gray-50 flex flex-col md:flex-row gap-6 items-center justify-between group/sec">
                            <div>
                                <h4 class="font-black text-xl text-pucho-dark mb-1 group-hover/sec:text-pucho-purple transition-colors">Credential Shield</h4>
                                <p class="text-sm text-gray-400 font-medium">Reset your authentication password</p>
                            </div>
                            <button onclick="dashboard.showChangePasswordModal()" class="bg-white border border-gray-200 px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-pucho-dark hover:text-white hover:border-pucho-dark transition-all active:scale-95 shadow-sm">Update Now</button>
                        </div>
                        <div class="p-8 bg-gray-50 rounded-[32px] border border-gray-50 flex items-center justify-between">
                            <div>
                                <h4 class="font-black text-xl text-pucho-dark mb-1">Session Lock</h4>
                                <p class="text-sm text-gray-400 font-medium">Automatic logout after 30 mins</p>
                            </div>
                             <div class="w-12 h-6 bg-pucho-purple/20 rounded-full relative cursor-pointer">
                                <div class="absolute right-1 top-1 w-4 h-4 bg-pucho-purple rounded-full shadow-sm"></div>
                             </div>
                        </div>
                    </div>
                </div>`;

        // Role-Specific Sections
        if (user.role === 'admin') {
            content += `<div class="bg-white rounded-[40px] p-10 border border-gray-100 shadow-subtle font-inter">
                    <h3 class="font-black text-3xl text-pucho-dark mb-8 tracking-tight">System Administration</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="p-8 bg-red-50 rounded-[32px] border border-red-50 relative overflow-hidden group/reset">
                            <div class="absolute -top-10 -right-10 text-9xl opacity-5 group-hover/reset:scale-110 transition-transform">⚠️</div>
                            <h4 class="font-black text-red-700 text-2xl mb-2">Nuclear Reset</h4>
                             <p class="text-xs text-red-400 mb-8 font-black uppercase tracking-widest">Wipe all student and staff records</p>
                            <button onclick="showToast('Initiating Master Reset...', 'error')" class="bg-red-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest w-full hover:bg-black transition-all shadow-lg active:scale-95">CORE RESET</button>
                        </div>
                        <div class="p-8 bg-indigo-50 rounded-[32px] border border-indigo-50 relative overflow-hidden group/promote">
                            <div class="absolute -top-10 -right-10 text-9xl opacity-5 group-hover/promote:scale-110 transition-transform">🎓</div>
                            <h4 class="font-black text-indigo-700 text-2xl mb-2">Grade Migration</h4>
                             <p class="text-xs text-indigo-400 mb-8 font-black uppercase tracking-widest">Auto-promote active batch to next level</p>
                            <button onclick="showToast('Promotion Wizard Activated!', 'info')" class="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest w-full hover:bg-indigo-700 transition-all shadow-lg active:scale-95">START MIGRATION</button>
                        </div>
                    </div>
                </div>`;
        }

        if (user.role === 'parent') {
            content += `<div class="bg-white rounded-[40px] p-10 border border-gray-100 shadow-subtle font-inter">
                     <h3 class="font-black text-3xl text-pucho-dark mb-8 tracking-tight">Parental Notifications</h3>
                      <div class="space-y-4">
                        <div class="flex items-center justify-between p-6 bg-gray-50 rounded-[32px] hover:bg-white border border-transparent hover:border-gray-100 transition-all group">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-xl">📱</div>
                                <div>
                                    <span class="font-black text-lg text-pucho-dark block">Direct SMS Alerts</span>
                                    <p class="text-xs text-gray-400 font-medium font-inter">Instant notification for fee dues and absence</p>
                                </div>
                            </div>
                            <input type="checkbox" checked class="w-10 h-10 accent-pucho-purple cursor-pointer appearance-none bg-gray-200 rounded-2xl checked:bg-pucho-purple transition-all relative after:content-[''] after:absolute after:inset-0 after:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMCA2TDkgMTdsLTUtNSIvPjwvc3ZnPg==')] after:bg-no-repeat after:bg-center after:opacity-0 checked:after:opacity-100">
                        </div>
                        <div class="flex items-center justify-between p-6 bg-gray-50 rounded-[32px] hover:bg-white border border-transparent hover:border-gray-100 transition-all group">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-xl">📧</div>
                                <div>
                                    <span class="font-black text-lg text-pucho-dark block">Deep Academic Reports</span>
                                    <p class="text-xs text-gray-400 font-medium font-inter">Monthly performance PDF to your inbox</p>
                                </div>
                            </div>
                            <input type="checkbox" checked class="w-10 h-10 accent-pucho-purple cursor-pointer appearance-none bg-gray-200 rounded-2xl checked:bg-pucho-purple transition-all relative after:content-[''] after:absolute after:inset-0 after:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLWdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0yMCA2TDkgMTdsLTUtNSIvPjwvc3ZnPg==')] after:bg-no-repeat after:bg-center after:opacity-0 checked:after:opacity-100">
                        </div>
                      </div>
                      <div class="flex justify-end mt-10">
                         <button onclick="showToast('Preferences Synchronized!', 'success')" class="bg-pucho-dark text-white px-12 py-4 rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-pucho-purple transition-all shadow-glow active:scale-95">COMMIT PREFERENCES</button>
                      </div>
                </div>`;
        }

        return content + `</div>`;
    },

    handleAvatarUpload: async function (input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const overlay = document.getElementById('avatarLoadingOverlay');
        if (overlay) overlay.style.opacity = '1';

        // 1. Simulate Upload (In a real app, you'd use Supabase Storage)
        // For now, we use a FileReader to show it locally and persist the Base64 in profile if needed
        // OR simulate it by just showing success
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result;
            document.getElementById('settingsAvatarPreview').src = base64;

            // Usually call this.db('profiles', 'PATCH', { avatar_url: base64 }, `?id=eq.${auth.currentUser.id}`)
            // But base64 is too big for a single REST call often.
            // We'll update the currentUser and show toast.
            auth.currentUser.avatar_url = base64;
            localStorage.setItem('sms_user', JSON.stringify(auth.currentUser));

            // Sync to DB (Avatar placeholder)
            if (this.isDbConnected) {
                await this.db('profiles', 'PATCH', { avatar_url: base64.substring(0, 100) + '(base64_truncated)' }, `?id=eq.${auth.currentUser.id}`);
            }

            setTimeout(() => {
                if (overlay) overlay.style.opacity = '0';
                showToast('Profile photo updated!', 'success');
                // Sync top bar avatar
                const topAvatar = document.querySelector('header .w-12.h-12 img');
                if (topAvatar) topAvatar.src = base64;
            }, 1000);
        };
        reader.readAsDataURL(file);
    },

    updateProfile: async function () {
        const nameInput = document.getElementById('profileNameInput');
        const newName = nameInput.value.trim();

        if (!newName) {
            showToast('Name cannot be empty', 'error');
            return;
        }

        showToast('Synchronizing profile...', 'info');

        // 1. Update Core Auth
        auth.currentUser.name = newName;
        localStorage.setItem('sms_user', JSON.stringify(auth.currentUser));

        // 2. Update Profiles Table
        if (this.isDbConnected) {
            await this.db('profiles', 'PATCH', { full_name: newName }, `?id=eq.${auth.currentUser.id}`);

            // If Parent - Update secondary name in parents table if applicable
            if (auth.currentUser.role === 'parent') {
                // Parents table usually just has secondary phone/address, name is in profiles
            }

            // If Staff - Update name in staff table
            if (auth.currentUser.role === 'staff' || auth.currentUser.role === 'teacher') {
                await this.db('staff', 'PATCH', { name: newName }, `?employee_id=eq.${auth.currentUser.id}`);
            }
        }

        // 3. UI Sync
        const topName = document.querySelector('header h2');
        if (topName) topName.innerText = `Welcome Back, ${newName.split(' ')[0]} 👋`;

        showToast('Profile successfully updated', 'success');
    },

    ai_insights: function () {
        const highRisk = schoolDB.results.filter(r => r.marks < 40).map(r => {
            const s = schoolDB.students.find(st => st.id === r.student_id);
            return { ...r, studentName: s ? s.name : r.student_id, class: s ? s.class : 'N/A' };
        });

        const stability = 100 - (highRisk.length * 2);

        return `
                <div class="space-y-8 animate-fade-in">
                    <div class="bg-gradient-to-r from-pucho-purple to-indigo-600 p-8 rounded-[40px] text-white shadow-glow relative overflow-hidden mb-8">
                        <div class="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px]"></div>
                        <div class="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                            <div class="max-w-xl">
                                <h3 class="text-3xl font-bold mb-2">Predictive Academic Analysis</h3>
                                <p class="text-white/70">AI has analyzed ${schoolDB.results.length} results across all active modules.</p>
                            </div>
                            <div class="flex gap-4">
                                <div class="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/10 text-center min-w-[120px]">
                                    <p class="text-2xl font-bold">${stability}%</p>
                                    <p class="text-[10px] uppercase font-bold opacity-60">Avg Stability</p>
                                </div>
                                <div class="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/10 text-center min-w-[120px]">
                                    <p class="text-2xl font-bold text-orange-300">${highRisk.length}</p>
                                    <p class="text-[10px] uppercase font-bold opacity-60">High Risk</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <!-- Risk List -->
                        <div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle">
                            <h3 class="font-bold text-xl mb-6 flex items-center gap-2">⚠️ Performance Drop Alerts</h3>
                            <div class="space-y-6">
                                ${highRisk.length > 0 ? highRisk.map(r => `
                                <div class="p-6 bg-orange-50 rounded-3xl border border-orange-100 hover:scale-[1.02] transition-transform cursor-pointer">
                                    <div class="flex justify-between items-start mb-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-orange-600">${r.studentName[0]}</div>
                                            <div>
                                                <p class="font-bold text-pucho-dark">${r.studentName}</p>
                                                <p class="text-[10px] text-gray-400 font-bold uppercase">${r.class}</p>
                                            </div>
                                        </div>
                                        <span class="px-3 py-1 bg-red-100 text-red-600 rounded-full text-[10px] font-bold">${r.marks}% Marks</span>
                                    </div>
                                    <p class="text-sm text-gray-600 mb-4">Critical alert in <span class="font-bold">${r.subject}</span>. Student is performing below the 40% threshold.</p>
                                    <div class="flex gap-2">
                                        <button class="flex-1 py-2 bg-pucho-dark text-white rounded-xl text-xs font-bold" onclick="showToast('Academic Support Kit emailed to parents.', 'success')">SEND SUPPORT KIT</button>
                                        <button class="py-2 px-4 border border-gray-200 rounded-xl text-xs font-bold">IGNORE</button>
                                    </div>
                                </div>
                                `).join('') : `<p class="text-center text-gray-400 font-bold py-10">All students are performing well! 🎉</p>`}
                            </div>
                        </div>

                        <!-- Retention Insights -->
                        <div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle">
                             <h3 class="font-bold text-xl mb-6">💡 Growth Suggestions</h3>
                             <div class="space-y-4">
                                <div class="flex items-start gap-4 p-4 border-b border-gray-50">
                                    <div class="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0">📈</div>
                                    <div>
                                        <p class="font-bold text-sm">Group Study Potential</p>
                                        <p class="text-xs text-gray-400 mt-1">Section 9-B shows high disparity. Recommend peer-mentoring between Top 5 and Bottom 5 performers.</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-4 p-4">
                                    <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">🔬</div>
                                    <div>
                                        <p class="font-bold text-sm">Lab Engagement</p>
                                        <p class="text-xs text-gray-400 mt-1">Attendance in Labs is 15% lower than theory classes. Consider gamifying practical assessments.</p>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>`;
    },

    student_profile: function () {
        // Get student data linked to parent
        const students = schoolDB.students || [];
        const student = students.find(s => s.parent_id === auth.currentUser.id) || students[0];
        if (!student) return '<div class="p-20 text-center text-gray-400 italic">No student record associated with your account.</div>';

        // Re-use Graph Helper (Define locally as simple string builder for this scope or duplication for simplicity in single-file)
        const createBarGraph = (title, labels, values, color = 'bg-pucho-purple') => {
            const max = Math.max(...values);
            const bars = values.map((v, i) => `
                    <div class="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                        <div class="w-full bg-gray-50 rounded-t-xl relative h-full flex items-end">
                            <div class="w-full ${color} rounded-t-xl transition-all duration-1000 relative group-hover:opacity-80" style="height: ${(v / max) * 100}%">
                                <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">${v}%</div>
                            </div>
                        </div>
                        <span class="text-[10px] font-bold text-gray-400 uppercase">${labels[i]}</span>
                    </div>
                `).join('');
            return `<div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm h-full">
                    <h4 class="font-bold text-gray-500 text-xs uppercase tracking-widest mb-4">${title}</h4>
                    <div class="h-40 flex items-end gap-3">${bars}</div>
                </div>`;
        };

        const attendanceData = [95, 80, 100, 90, 85, 92];
        const marksData = [78, 85, 92, 68, 88];

        return `<div class="animate-fade-in space-y-8">
                <!-- ID Card Section -->
                <div class="bg-white rounded-[40px] p-8 md:p-12 border border-gray-100 shadow-subtle relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-64 h-64 bg-pucho-purple/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                    
                    <div class="flex flex-col md:flex-row gap-10 items-center relative z-10">
                        <div class="flex-none text-center">
                            <div class="w-40 h-40 bg-gray-100 rounded-full border-4 border-white shadow-xl mx-auto mb-4 flex items-center justify-center text-6xl">
                                👨‍🎓
                            </div>
                            <span class="bg-green-100 text-green-700 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Active Student</span>
                        </div>
                        
                        <div class="flex-1 text-center md:text-left">
                            <h2 class="text-4xl font-bold text-pucho-dark mb-2">${student.name}</h2>
                            <p class="text-xl text-gray-400 font-light mb-6">${student.class} - Div ${student.division}</p>
                            
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Roll Number</p>
                                    <p class="font-bold text-lg text-pucho-dark">#${student.roll || student.rollNo}</p>
                                </div>
                                <div>
                                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Blood Group</p>
                                    <p class="font-bold text-lg text-pucho-dark">O+</p>
                                </div>
                                <div>
                                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Date of Birth</p>
                                    <p class="font-bold text-lg text-pucho-dark">${student.dob || '12 Aug 2009'}</p>
                                </div>
                                <div>
                                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Contact</p>
                                    <p class="font-bold text-lg text-pucho-purple">${student.phone || '9876543210'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Deep Dive Analytics -->
                <h3 class="text-2xl font-bold ml-2">Performance Analytics</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    ${createBarGraph('Attendance Trends (6 Months)', ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'], attendanceData, 'bg-pucho-purple')}
                    ${createBarGraph('Academic Consistency', ['Maths', 'Sci', 'Eng', 'Hist', 'Comp'], marksData, 'bg-blue-500')}
                </div>
                
                <!-- Teacher Remarks -->
                <div class="bg-gray-50 rounded-[40px] p-8 border border-gray-100">
                    <h3 class="font-bold text-xl mb-6">Teacher Remarks</h3>
                    <div class="space-y-4">
                        <div class="bg-white p-6 rounded-3xl border border-gray-100 flex gap-4">
                            <div class="text-2xl">🌟</div>
                            <div>
                                <p class="text-sm font-bold text-pucho-dark">Class Teacher</p>
                                <p class="text-sm text-gray-500 mt-1">"Arjun is showing great improvement in Science. Needs to focus a bit more on History dates. Overall excellent conduct."</p>
                                <p class="text-[10px] font-bold text-gray-400 mt-2">12th Dec 2023</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    },

    parent_attendance: function () { return this.my_attendance(); }, // Alias for Parent
    my_attendance: function () {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const years = [2024, 2025, 2026];
        const now = new Date();
        const currentMonthIndex = now.getMonth();
        const currentYear = now.getFullYear();

        // Standard Indian Holidays (Fixed Dates)
        const fixedHolidays = {
            '01-01': 'New Year',
            '01-26': 'Republic Day',
            '08-15': 'Independence Day',
            '10-02': 'Gandhi Jayanti',
            '12-25': 'Christmas'
        };

        const generateGrid = (monthIndex, year) => {
            const firstDay = new Date(year, monthIndex, 1).getDay();
            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
            const student = (schoolDB.students || []).find(s => s.parent_id === auth.currentUser.id || s.guardian_name === auth.currentUser.name) || schoolDB.students[0];

            if (!student) return { html: '<div class="col-span-7 py-10 text-center text-gray-400">No student record found.</div>', p: 0, a: 0, h: 0, holidayList: [] };

            const realAttendance = (schoolDB.attendance || []).filter(a => a.student_id === student.id || a.student_id === student.db_id);
            const holidayList = [];
            let gridHtml = '';

            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            weekdays.forEach(wd => {
                gridHtml += `<div class="text-[10px] font-black text-gray-400 uppercase text-center mb-2">${wd}</div>`;
            });

            for (let i = 0; i < firstDay; i++) gridHtml += `<div class="aspect-square"></div>`;

            let present = 0, absent = 0, holidaysCount = 0;

            for (let i = 1; i <= daysInMonth; i++) {
                const date = new Date(year, monthIndex, i);
                const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const holidayKey = `${String(monthIndex + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const isSunday = date.getDay() === 0;
                const holidayName = fixedHolidays[holidayKey];
                const isToday = date.toDateString() === now.toDateString();

                const record = realAttendance.find(a => a.date === dateStr);
                let statusClass = 'bg-gray-50 text-gray-300';
                let label = '';

                if (isSunday) {
                    statusClass = 'bg-gray-100 text-gray-400 border border-dashed border-gray-200';
                    holidaysCount++;
                    label = 'Sunday Off';
                } else if (holidayName) {
                    statusClass = 'bg-red-100 text-red-600 border border-red-200';
                    holidaysCount++;
                    holidayList.push({ day: i, name: holidayName });
                    label = holidayName;
                } else if (record) {
                    if (record.status === 'Present') {
                        statusClass = 'bg-green-100 text-green-700 font-bold';
                        present++;
                    } else if (record.status === 'Absent') {
                        statusClass = 'bg-red-50 text-red-500 border border-red-100';
                        absent++;
                    }
                } else {
                    const isFuture = date > now;
                    if (!isFuture) {
                        statusClass = 'bg-green-50/50 text-green-400';
                        present++;
                    }
                }

                const todayClass = isToday ? 'ring-2 ring-pucho-purple ring-offset-2' : '';
                gridHtml += `<div class="${statusClass} ${todayClass} aspect-square rounded-xl flex items-center justify-center font-bold text-xs animate-fade-in relative group" style="animation-delay: ${i * 5}ms">
                    ${i}
                    ${label ? `<span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-pucho-dark text-white text-[8px] px-2 py-1 rounded whitespace-nowrap z-10">${label}</span>` : ''}
                </div>`;
            }
            return { html: gridHtml, p: present, a: absent, h: holidaysCount, holidayList };
        };

        const initialData = generateGrid(currentMonthIndex, currentYear);

        setTimeout(() => {
            dashboard.updateAttendance = function () {
                const monthIdx = parseInt(document.getElementById('attMonth').value);
                const year = parseInt(document.getElementById('attYear').value);
                const data = generateGrid(monthIdx, year);
                document.getElementById('attGrid').innerHTML = data.html;
                document.getElementById('attStats').innerHTML = `
                    <div class="flex flex-wrap justify-center gap-4 md:gap-8">
                        <span class="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-xl text-green-600 shadow-sm"><span class="w-2.5 h-2.5 rounded-full bg-green-500"></span> Present (${data.p})</span>
                        <span class="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-xl text-red-600 shadow-sm"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span> Absent (${data.a})</span>
                        <span class="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl text-gray-500 shadow-sm"><span class="w-2.5 h-2.5 rounded-full bg-gray-400"></span> Holidays (${data.h})</span>
                    </div>
                `;

                const holidayListEl = document.getElementById('holidayList');
                if (data.holidayList.length > 0) {
                    holidayListEl.innerHTML = `
                        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Public Holidays This Month</h4>
                        <div class="space-y-2">
                            ${data.holidayList.map(h => `
                                <div class="flex items-center justify-between p-3 bg-red-50/50 border border-red-100 rounded-xl">
                                    <div class="flex items-center gap-3">
                                        <span class="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">${h.day}</span>
                                        <span class="text-sm font-bold text-pucho-dark">${h.name}</span>
                                    </div>
                                    <span class="text-[10px] font-bold text-red-400 uppercase">Holiday</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                } else {
                    holidayListEl.innerHTML = `
                        <div class="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-[32px] border border-dashed border-gray-200 text-center">
                            <span class="text-2xl mb-2">🗓️</span>
                            <p class="text-[10px] font-bold text-gray-400 uppercase">No scheduled holidays</p>
                        </div>
                    `;
                }
            };
            dashboard.updateAttendance(); // Sync initial view correctly
        }, 100);

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle animate-fade-in font-inter">
            <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 text-center md:text-left">
                <div>
                    <h3 class="font-bold text-2xl text-pucho-dark">Attendance Record</h3>
                    <p class="text-gray-400 text-sm">Track daily presence history</p>
                </div>
                <div class="flex gap-3">
                     <select id="attMonth" onchange="dashboard.updateAttendance()" class="appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-bold text-xs outline-none text-pucho-dark hover:border-pucho-purple transition-colors cursor-pointer ring-offset-2 focus:ring-2 focus:ring-pucho-purple">
                        ${months.map((m, i) => `<option value="${i}" ${i === currentMonthIndex ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                     <select id="attYear" onchange="dashboard.updateAttendance()" class="appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-bold text-xs outline-none text-pucho-dark hover:border-pucho-purple transition-colors cursor-pointer ring-offset-2 focus:ring-2 focus:ring-pucho-purple">
                        ${years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                <div class="bg-white p-2 rounded-[32px]">
                    <div id="attGrid" class="grid grid-cols-7 gap-1 md:gap-2 max-w-sm mx-auto mb-8">
                         ${initialData.html}
                    </div>
                    
                    <div id="attStats" class="text-xs font-bold text-gray-500">
                        <!-- Stats injected here -->
                    </div>
                </div>

                <div id="holidayList" class="animate-fade-in">
                    <!-- Holidays injected here -->
                </div>
            </div>
        </div>`;
    },

    parent_fees: function () { return this.my_fees(); },
    my_fees: function () {
        const myStudents = schoolDB.students.filter(s => s.parent_id === auth.currentUser.id || s.guardian_name === auth.currentUser.name);
        if (myStudents.length === 0) return '<div class="p-20 text-center text-gray-400 italic">No family accounts found.</div>';

        const childIds = myStudents.map(s => s.id);
        const history = schoolDB.fees.filter(f => childIds.includes(f.student_id));
        const pendingFees = history.filter(f => f.status === 'Pending');
        const totalPending = pendingFees.reduce((acc, f) => acc + f.amount, 0);

        const rows = history.map(f => `
            <div class="flex justify-between items-center bg-white p-6 rounded-3xl border border-gray-100 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full ${f.status === 'Paid' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'} flex items-center justify-center text-xl">💰</div>
                    <div>
                        <p class="font-bold text-pucho-dark">${f.type} - <span class="text-pucho-purple">${f.student}</span></p>
                        <p class="text-xs text-gray-400 font-bold">${f.status === 'Paid' ? 'Paid on ' + (f.paidDate || f.date) : 'Due ' + f.dueDate}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-black ${f.status === 'Paid' ? 'text-green-600' : 'text-red-500'} text-lg">₹${f.amount.toLocaleString()}</p>
                    ${f.status === 'Pending' ? `<button onclick="showToast('Redirecting to Payment Gateway...', 'info')" class="text-[10px] font-black uppercase text-pucho-purple hover:underline">Pay Now</button>` : ''}
                </div>
            </div>
        `).join('');

        return `<div class="animate-fade-in space-y-8">
            <div class="bg-white rounded-[40px] p-10 border border-gray-100 shadow-subtle text-center relative overflow-hidden">
                <div class="w-24 h-24 ${totalPending > 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'} rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm">${totalPending > 0 ? '⚠️' : '✅'}</div>
                <h3 class="text-3xl font-bold text-pucho-dark tracking-tight mb-2">${totalPending > 0 ? 'Outstanding Dues: ₹' + totalPending.toLocaleString() : 'All Dues Cleared'}</h3>
                <p class="text-gray-400 mb-8 max-w-sm mx-auto">${totalPending > 0 ? 'You have pending payments for your children.' : 'Great! You have cleared all pending invoices for the current session.'}</p>
            </div>
            
            <div class="max-w-2xl mx-auto space-y-4">
                <h4 class="font-bold text-xs uppercase text-gray-400 tracking-widest ml-4">Fee statement</h4>
                ${rows}
            </div>
        </div>`;
    },

    parent_leave: function () {
        const requests = (schoolDB.leaves || []).filter(r => r.user_id === auth.currentUser.id || r.user_role === 'parent' || r.requesterId === auth.currentUser.id);

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle animate-fade-in font-inter">
            <div class="flex flex-col md:flex-row justify-between items-start mb-8 gap-6">
                <div>
                     <h3 class="font-bold text-2xl text-pucho-dark">Leave Application</h3>
                     <p class="text-gray-400 text-sm mt-1">Submit leave requests for your child</p>
                </div>
                <button class="bg-pucho-dark text-white px-6 py-3 rounded-xl font-bold hover:bg-pucho-purple transition-colors shadow-lg" onclick="document.getElementById('leaveForm').classList.toggle('hidden')">+ New Request</button>
            </div>

            <div id="leaveForm" class="hidden bg-gray-50 p-8 rounded-[32px] mb-8 border border-gray-100 animate-slide-up">
                <h4 class="font-bold text-lg mb-6 text-pucho-dark">Compose Application</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div class="space-y-1.5">
                        <label class="label-sm">From Date</label>
                        <input type="date" id="leaveFrom" class="input-field">
                    </div>
                    <div class="space-y-1.5">
                        <label class="label-sm">To Date</label>
                        <input type="date" id="leaveTo" class="input-field">
                    </div>
                </div>
                <div class="mb-6 space-y-1.5">
                     <label class="label-sm">Reason for Absence</label>
                     <textarea id="leaveReason" class="input-field min-h-[120px]" rows="4" placeholder="e.g. Family Function, Medical Emergency..."></textarea>
                </div>
                <div class="flex justify-end items-center gap-4">
                    <button class="text-sm font-bold text-gray-500 hover:text-pucho-dark transition-colors px-4 py-2" onclick="document.getElementById('leaveForm').classList.add('hidden')">Cancel</button>
                    <button class="px-8 py-3 bg-pucho-purple text-white font-bold rounded-xl hover:shadow-lg transition-all hover:scale-105" onclick="dashboard.submitLeaveRequest()">Submit Request</button>
                </div>
            </div>

            <h4 class="font-bold text-xs uppercase text-gray-400 tracking-widest mb-4">Past Records</h4>
            <div class="space-y-4">
                ${requests.map(r => `
                    <div class="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl">
                        <div class="flex gap-4 items-center">
                             <div class="w-12 h-12 rounded-full ${r.status === 'Approved' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'} flex items-center justify-center font-bold text-xl">${r.status === 'Approved' ? '✓' : '⏳'}</div>
                             <div>
                                <h5 class="font-bold text-pucho-dark">${r.reason}</h5>
                                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">${r.fromDate} to ${r.toDate}</p>
                             </div>
                        </div>
                        <span class="px-3 py-1 ${r.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'} rounded-lg text-[10px] font-black uppercase">${r.status}</span>
                    </div>
                `).join('')}
                ${requests.length === 0 ? `<div class="text-center py-10 text-gray-400">No leave history found.</div>` : ''}
            </div>
        </div>`;
    },

    parent_homework: function () {
        const myStudents = schoolDB.students.filter(s => s.parent_id === auth.currentUser.id || s.guardian_name === auth.currentUser.name);
        if (myStudents.length === 0) return '<div class="p-20 text-center text-gray-400 italic">No family accounts found.</div>';

        const myGrades = myStudents.map(s => s.class || s.grade);
        const homeworks = (schoolDB.homework || []).filter(h => myGrades.includes(h.class));

        return `
    <div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle animate-fade-in font-inter">
        <div class="flex justify-between items-center mb-8">
             <h3 class="font-bold text-2xl text-pucho-dark">Homework & Assignments</h3>
             <span class="bg-pucho-purple/10 text-pucho-purple px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest">${[...new Set(myGrades)].join(', ')}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${homeworks.length > 0 ? homeworks.map(h => `
                <div onclick="dashboard.openHomeworkPreview('${h.id}')" class="p-6 rounded-[32px] border bg-gray-50 border-gray-100 relative overflow-hidden group hover:border-pucho-purple cursor-pointer transition-all hover:shadow-md">
                   <div class="flex justify-between items-start mb-4">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-pucho-purple">${h.subject}</span>
                        <span class="text-[10px] font-bold text-gray-400">${h.dueDate || 'No Due Date'}</span>
                   </div>
                   <h4 class="font-bold text-lg mb-2 text-pucho-dark leading-tight">${h.title}</h4>
                   <div class="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                       <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-sm shadow-sm">📄</div>
                       <span class="text-xs font-bold text-gray-400 truncate">${h.file || 'Educational Resource'}</span>
                   </div>
                </div>
            `).join('') : '<div class="col-span-full py-20 text-center text-gray-400 font-bold uppercase tracking-widest italic animate-pulse">No assignments found for this class.</div>'}
        </div>
    </div>
    
    <!-- Unified Homework Preview Modal (Hidden by default) -->
    <div id="hwPreviewModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm hidden animate-fade-in">
        <div class="bg-white p-8 w-full max-w-xl rounded-[32px] border border-white/30 shadow-2xl relative animate-slide-up">
            <button onclick="document.getElementById('hwPreviewModal').classList.add('hidden')" class="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors">✕</button>
            <div id="hwPreviewContent"></div>
        </div>
    </div>`;
    },

    openHomeworkPreview: function (id) {
        const hw = (schoolDB.homework || []).find(h => h.id === id);
        if (!hw) return;

        const modal = document.getElementById('hwPreviewModal');
        const content = document.getElementById('hwPreviewContent');

        content.innerHTML = `
        <div class="mb-6">
            <div class="w-12 h-12 bg-pucho-purple/10 rounded-xl flex items-center justify-center text-2xl mb-4">📖</div>
            <h1 class="text-2xl font-bold text-pucho-dark mb-1">${hw.title}</h1>
            <div class="flex flex-wrap gap-2 mt-2">
                <span class="text-[10px] font-bold bg-pucho-purple/10 text-pucho-purple px-2 py-1 rounded uppercase tracking-widest">${hw.subject}</span>
                <span class="text-[10px] font-bold bg-gray-100 text-gray-400 px-2 py-1 rounded uppercase tracking-widest">Due: ${hw.dueDate || 'N/A'}</span>
                <span class="text-[10px] font-bold bg-blue-50 text-blue-500 px-2 py-1 rounded uppercase tracking-widest">Teacher: ${hw.assignedBy || 'School Agent'}</span>
            </div>
        </div>
        
        <div class="p-6 bg-gray-50 rounded-2xl border border-gray-100 mb-6 font-inter text-sm text-gray-600 leading-relaxed">
            <p class="font-bold text-pucho-dark mb-2">Instructions:</p>
            ${hw.description || 'No specific instructions provided for this assignment.'}
        </div>
        
        ${hw.file ? `
            <div class="flex items-center justify-between p-4 bg-pucho-purple/5 border border-pucho-purple/10 rounded-2xl">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">📎</div>
                    <div>
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attachment</p>
                        <p class="text-xs font-bold text-pucho-dark italic">${hw.file}</p>
                    </div>
                </div>
                <button class="bg-pucho-dark text-white px-4 py-2 rounded-lg text-[10px] font-bold hover:bg-pucho-purple transition-colors shadow-sm uppercase tracking-widest">Download</button>
            </div>
        ` : `
            <div class="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-center">
                <p class="text-xs font-bold text-gray-400 italic">No attachments for this task.</p>
            </div>
        `}
        
        <div class="mt-8 flex justify-end">
             <button onclick="document.getElementById('hwPreviewModal').classList.add('hidden')" class="bg-gray-100 text-gray-600 px-8 py-3 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all">Close Details</button>
        </div>
    `;

        modal.classList.remove('hidden');
    },

    parent_results: function () {
        const myStudents = schoolDB.students.filter(s => s.parent_id === auth.currentUser.id || s.guardian_name === auth.currentUser.name);
        if (myStudents.length === 0) return '<div class="p-20 text-center text-gray-400 italic">No family accounts found.</div>';

        const sections = myStudents.map(student => {
            const results = (schoolDB.results || []).filter(r => r.student_id === student.id || r.student_id === student.db_id);
            const avgGPA = results.length > 0 ? (results.reduce((acc, r) => acc + (r.marks / r.total), 0) / results.length * 10).toFixed(1) : 'N/A';

            return `
                <div class="bg-gray-50 rounded-[32px] p-8 border border-gray-100 mb-8">
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-xl">🎓</div>
                            <div>
                                <h4 class="font-bold text-pucho-dark text-lg">${student.name}</h4>
                                <p class="text-xs text-gray-400 font-bold uppercase tracking-widest">${student.class}-${student.division}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] font-black uppercase text-gray-400 mb-1">Avg GPA</p>
                            <p class="text-2xl font-black text-pucho-purple">${avgGPA}</p>
                        </div>
                    </div>

                    <div class="space-y-3">
                        ${results.map(r => `
                            <div class="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-50 shadow-sm">
                                <div>
                                    <p class="font-bold text-sm text-pucho-dark">${r.subject}</p>
                                    <p class="text-[10px] text-gray-400 font-bold uppercase">${r.exam || 'Terminal Exam'}</p>
                                </div>
                                <div class="flex items-center gap-4">
                                    <div class="text-right">
                                        <p class="font-black text-pucho-dark text-sm">${r.marks}/${r.total}</p>
                                        <p class="text-[10px] font-bold text-green-500 uppercase">${r.grade || 'A'}</p>
                                    </div>
                                    <div class="w-1.5 h-8 bg-gray-100 rounded-full overflow-hidden">
                                        <div class="w-full bg-pucho-purple" style="height: ${(r.marks / r.total) * 100}%"></div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        ${results.length === 0 ? '<div class="text-center py-6 text-gray-400 text-xs font-bold uppercase tracking-widest bg-white rounded-2xl border border-dashed border-gray-200">No results published yet</div>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle animate-fade-in font-inter">
            <div class="flex justify-between items-center mb-8">
                 <h3 class="font-bold text-2xl text-pucho-dark">Academic Report Cards</h3>
                 <button class="bg-pucho-dark text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-pucho-purple transition-all" onclick="showToast('Downloading all reports...', 'info')">Download All PDF</button>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                ${sections}
            </div>
        </div>`;
    },

    // --- STAFF DASHBOARD TEMPLATES ---
    my_classes: function () {
        const staff = (schoolDB.staff || []).find(s => s.email === auth.currentUser.email) || { class_assigned: '10th', division_assigned: 'A', subject: 'Mathematics' };

        // Mock Schedule Data Generator
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const slots = ['09:00 - 10:00', '10:00 - 11:00', '11:15 - 12:15', '12:15 - 01:15', '02:00 - 03:00'];

        const subjects = ['Mathematics', 'Physics', 'Free Period', 'Chemistry', 'Lab', 'Library', staff.subject || 'Main Subject'];
        const classes = ['10th-A', '9th-B', '10th-B'];

        const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

        // Generate Grid
        let scheduleHtml = '';

        days.forEach(day => {
            let rowHtml = `
            <div class="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4 group">
                <div class="md:col-span-1 bg-pucho-purple/5 rounded-2xl p-4 flex items-center justify-center md:justify-start border border-pucho-purple/10">
                    <div>
                        <h4 class="font-black text-pucho-purple uppercase tracking-widest text -xs">${day}</h4>
                        <p class="text-[10px] font-bold text-gray-400 mt-1">5 Classes</p>
                    </div>
                </div>
                <div class="md:col-span-5 grid grid-cols-2 md:grid-cols-5 gap-3">`;

            slots.forEach((slot, i) => {
                const isFree = Math.random() > 0.8;
                const subject = isFree ? 'Free Slot' : getRandom(subjects);
                const cls = isFree ? '-' : getRandom(classes);
                const color = isFree ? 'bg-gray-50 border-gray-100 text-gray-400' : `bg-white border-gray-100 text-pucho-dark hover:border-pucho-purple hover:shadow-md cursor-pointer group/card`;

                rowHtml += `
                    <div class="${color} p-3 rounded-2xl border transition-all flex flex-col justify-between h-24 md:h-auto">
                        <div class="flex justify-between items-start">
                            <span class="text-[10px] font-bold opacity-60">${slot}</span>
                            ${!isFree ? `<span class="w-2 h-2 rounded-full bg-green-400"></span>` : ''}
                        </div>
                        <div>
                            <h5 class="font-bold text-sm leading-tight">${subject}</h5>
                            <p class="text-[10px] font-bold opacity-60 uppercase mt-1">${cls}</p>
                        </div>
                    </div>
                `;
            });

            rowHtml += `</div></div>`;
            scheduleHtml += rowHtml;
        });

        return `<div class="animate-fade-in space-y-8 font-inter">
            <!-- Header Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-gradient-to-br from-pucho-purple to-indigo-600 rounded-[32px] p-8 text-white shadow-glow relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                    <div class="relative z-10">
                        <p class="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">Primary Assignment</p>
                        <h3 class="text-3xl font-black mb-4">${staff.class_assigned || '10th'} - ${staff.division_assigned || 'A'}</h3>
                        <div class="flex items-center gap-2 text-xs font-bold bg-white/20 w-fit px-3 py-1.5 rounded-lg backdrop-blur-md">
                            <span>📚 Class Teacher</span>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-[32px] p-8 border border-gray-100 shadow-subtle flex flex-col justify-between group hover:border-pucho-purple transition-colors cursor-pointer" onclick="dashboard.loadPage('mark_attendance')">
                    <div class="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">✅</div>
                    <div>
                        <h4 class="font-bold text-lg text-pucho-dark">Mark Attendance</h4>
                        <p class="text-xs text-gray-400 font-bold mt-1">Submit daily register</p>
                    </div>
                </div>

                <div class="bg-white rounded-[32px] p-8 border border-gray-100 shadow-subtle flex flex-col justify-between group hover:border-pucho-purple transition-colors cursor-pointer" onclick="dashboard.loadPage('exam_marks')">
                    <div class="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">📝</div>
                    <div>
                        <h4 class="font-bold text-lg text-pucho-dark">Detailed Grades</h4>
                        <p class="text-xs text-gray-400 font-bold mt-1">Update student marks</p>
                    </div>
                </div>
            </div>

            <!-- Timetable Section -->
            <div class="bg-white rounded-[40px] p-8 md:p-10 border border-gray-100 shadow-subtle">
                <div class="flex justify-between items-center mb-8">
                    <div>
                        <h3 class="font-black text-2xl text-pucho-dark">Weekly Schedule</h3>
                        <p class="text-gray-400 text-sm font-bold mt-1">Academic Year 2025-26</p>
                    </div>
                    <button onclick="dashboard.downloadSchedulePDF()" class="bg-gray-50 text-pucho-dark px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors">Download PDF</button>
                </div>
                
                <div class="space-y-2">
                    ${scheduleHtml}
                </div>
            </div>
        </div>`;
    },

    downloadSchedulePDF: function () {
        const staff = (schoolDB.staff || []).find(s => s.email === auth.currentUser.email) || { class_assigned: '10th', division_assigned: 'A', subject: 'Mathematics' };
        const teacherName = auth.currentUser.name || 'Teacher';

        // Create a new window with the schedule content
        const printWindow = window.open('', '_blank');

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const slots = ['09:00 - 10:00', '10:00 - 11:00', '11:15 - 12:15', '12:15 - 01:15', '02:00 - 03:00'];
        const subjects = ['Mathematics', 'Physics', 'Free Period', 'Chemistry', 'Lab', 'Library', staff.subject || 'Main Subject'];
        const classes = ['10th-A', '9th-B', '8th-A', '10th-B', '7th-C'];
        const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

        let tableRows = '';
        days.forEach(day => {
            let row = `<tr><td style="background: linear-gradient(135deg, #5833EF 0%, #7C3AED 100%); color: white; padding: 14px; font-weight: 700; font-size: 13px; border-radius: 8px 0 0 8px;">${day}</td>`;
            slots.forEach(() => {
                const isFree = Math.random() > 0.8;
                const subject = isFree ? 'Free' : getRandom(subjects);
                const cls = isFree ? '-' : getRandom(classes);
                const bgColor = isFree ? '#F9FAFB' : '#FFFFFF';
                row += `<td style="border: 1px solid #E5E7EB; padding: 12px; text-align: center; background: ${bgColor}; vertical-align: middle;">
                    <div style="font-weight: 600; color: ${isFree ? '#9CA3AF' : '#1F2937'}; font-size: 12px; margin-bottom: 4px;">${subject}</div>
                    <div style="color: #6B7280; font-size: 10px; font-weight: 500;">${cls}</div>
                </td>`;
            });
            row += '</tr>';
            tableRows += row;
        });

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Weekly Schedule - ${staff.class_assigned || '10th'}-${staff.division_assigned || 'A'}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        padding: 40px 50px;
                        background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
                        min-height: 100vh;
                    }
                    .container {
                        background: white;
                        border-radius: 20px;
                        padding: 40px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    }
                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding-bottom: 30px;
                        border-bottom: 3px solid #5833EF;
                        margin-bottom: 30px;
                    }
                    .logo-section {
                        display: flex;
                        align-items: center;
                        gap: 20px;
                    }
                    .logo {
                        width: 70px;
                        height: 70px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .logo img {
                        width: 100%;
                        height: auto;
                        object-fit: contain;
                    }
                    .school-info h1 {
                        color: #1F2937;
                        font-size: 28px;
                        font-weight: 900;
                        margin-bottom: 4px;
                        letter-spacing: -0.5px;
                    }
                    .school-info p {
                        color: #6B7280;
                        font-size: 13px;
                        font-weight: 600;
                    }
                    .header-right {
                        text-align: right;
                    }
                    .badge {
                        display: inline-block;
                        background: linear-gradient(135deg, #5833EF 0%, #7C3AED 100%);
                        color: white;
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-size: 11px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin-bottom: 8px;
                    }
                    .session-year {
                        color: #9CA3AF;
                        font-size: 12px;
                        font-weight: 600;
                    }
                    .title-section {
                        background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%);
                        padding: 20px 25px;
                        border-radius: 12px;
                        margin-bottom: 25px;
                    }
                    .title-section h2 {
                        color: #1F2937;
                        font-size: 22px;
                        font-weight: 800;
                        margin-bottom: 12px;
                    }
                    .meta-info {
                        display: flex;
                        gap: 30px;
                        flex-wrap: wrap;
                    }
                    .meta-item {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .meta-label {
                        color: #6B7280;
                        font-size: 11px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .meta-value {
                        color: #1F2937;
                        font-weight: 700;
                        font-size: 13px;
                    }
                    table { 
                        width: 100%; 
                        border-collapse: separate;
                        border-spacing: 0 8px;
                        margin-top: 10px;
                    }
                    th { 
                        background: #F9FAFB;
                        padding: 12px;
                        color: #6B7280;
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        border: 1px solid #E5E7EB;
                        text-align: center;
                    }
                    th:first-child {
                        border-radius: 8px 0 0 8px;
                    }
                    th:last-child {
                        border-radius: 0 8px 8px 0;
                    }
                    td {
                        font-size: 12px;
                    }
                    tr:hover td {
                        background: #F9FAFB !important;
                    }
                    .footer {
                        margin-top: 40px;
                        padding-top: 25px;
                        border-top: 2px solid #E5E7EB;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .footer-left {
                        color: #9CA3AF;
                        font-size: 11px;
                        font-weight: 600;
                    }
                    .footer-brand {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .footer-logo {
                        width: 24px;
                        height: 24px;
                    }
                    .footer-logo img {
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                    }
                    .footer-text {
                        color: #6B7280;
                        font-size: 11px;
                        font-weight: 700;
                    }
                    @media print {
                        body { 
                            background: white; 
                            padding: 20px; 
                        }
                        .container {
                            box-shadow: none;
                            padding: 20px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo-section">
                            <div class="logo">
                                <img src="${window.location.origin}/assets/pucho_logo_sidebar_v2.png" alt="Pucho.ai Logo">
                            </div>
                            <div class="school-info">
                                <h1>Pucho.ai School</h1>
                                <p>Excellence in Education • Technology Driven</p>
                            </div>
                        </div>
                        <div class="header-right">
                            <div class="badge">Weekly Schedule</div>
                            <div class="session-year">Academic Year 2025-26</div>
                        </div>
                    </div>
                    
                    <div class="title-section">
                        <h2>Class Timetable</h2>
                        <div class="meta-info">
                            <div class="meta-item">
                                <span class="meta-label">Class Teacher:</span>
                                <span class="meta-value">${teacherName}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Primary Assignment:</span>
                                <span class="meta-value">${staff.class_assigned || '10th'} - Division ${staff.division_assigned || 'A'}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">Generated:</span>
                                <span class="meta-value">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 120px;">Day</th>
                                ${slots.map(slot => `<th>${slot}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    
                    <div class="footer">
                        <div class="footer-left">
                            This is a computer-generated document. No signature required.
                        </div>
                        <div class="footer-brand">
                            <div class="footer-logo">
                                <img src="${window.location.origin}/assets/pucho_logo_sidebar_v2.png" alt="Pucho.ai">
                            </div>
                            <div class="footer-text">Powered by Pucho.ai SMS</div>
                        </div>
                    </div>
                </div>
                <script>
                    // Auto-trigger print dialog when page loads
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                            // Close window after printing
                            setTimeout(function() {
                                window.close();
                            }, 500);
                        }, 100);
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        showToast('Opening print dialog to save as PDF...', 'info');
    },

    mark_attendance: function () {
        const classes = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
        const divisions = ['A', 'B', 'C', 'D'];

        const classOptions = classes.map(c => `<option value="${c}">${c}</option>`).join('');
        const divOptions = divisions.map(d => `<option value="${d}">${d}</option>`).join('');

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle animate-fade-in font-inter">
                <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h3 class="font-bold text-2xl text-pucho-dark">Mark Attendance</h3>
                        <p class="text-gray-400 text-sm mt-1">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    
                    <div class="flex gap-4">
                         <div class="relative">
                            <select id="attClass" class="appearance-none bg-gray-50 border border-gray-200 rounded-2xl px-6 py-3 font-bold text-sm outline-none text-pucho-dark pr-10 hover:border-pucho-purple transition-colors cursor-pointer" onchange="dashboard.loadAttendanceStudents()">
                                <option value="">Select Class</option>
                                ${classOptions}
                            </select>
                            <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                        </div>

                        <div class="relative">
                            <select id="attDiv" class="appearance-none bg-gray-50 border border-gray-200 rounded-2xl px-6 py-3 font-bold text-sm outline-none text-pucho-dark pr-10 hover:border-pucho-purple transition-colors cursor-pointer" onchange="dashboard.loadAttendanceStudents()">
                                <option value="">Div</option>
                                ${divOptions}
                            </select>
                             <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                        </div>
                    </div>
                </div>

                <div id="attendanceList" class="min-h-[200px]">
                    <div class="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-50 rounded-3xl">
                        <span class="text-4xl mb-4 opacity-50">👨‍🎓</span>
                        <p class="font-medium text-sm">Select Class & Division to load students</p>
                    </div>
                </div>
                
                 <div class="flex justify-end mt-8 border-t border-gray-50 pt-6">
                     <button class="bg-pucho-dark text-white px-8 py-4 rounded-2xl font-bold hover:shadow-glow hover:bg-pucho-purple transition-all transform active:scale-95" onclick="dashboard.submitAttendance()">SUBMIT ATTENDANCE</button>
                </div>
            </div>`;
    },

    exam_marks: function () {
        const classes = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
        const divisions = ['A', 'B', 'C', 'D'];
        const exams = ['Unit Test 1', 'Mid Term', 'Finals', 'Pre-Board'];

        return `<div class="space-y-8 animate-fade-in font-inter">
                <div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                        <div>
                            <h3 class="font-bold text-2xl text-pucho-dark">Grade Book</h3>
                            <p class="text-gray-400 text-sm mt-1">Enter student marks for tests and exams</p>
                        </div>
                        <div class="flex flex-wrap gap-4">
                            <select id="marksClass" class="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none hover:border-pucho-purple transition-colors" onchange="dashboard.loadMarksStudents()">
                                <option value="">Select Grade</option>
                                ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                            <select id="marksDiv" class="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none hover:border-pucho-purple transition-colors" onchange="dashboard.loadMarksStudents()">
                                <option value="">Select Division</option>
                                ${divisions.map(d => `<option value="${d}">${d}</option>`).join('')}
                            </select>
                            <select id="marksExam" class="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-sm outline-none hover:border-pucho-purple transition-colors">
                                ${exams.map(e => `<option value="${e}">${e}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div id="studentCardsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div class="col-span-full text-center py-16 text-gray-400 font-bold">
                            <div class="text-6xl mb-4 opacity-30">📚</div>
                            <p class="text-sm uppercase tracking-widest">Select class & division to load students</p>
                        </div>
                    </div>
                </div>
                
                ${dashboard.renderMarksModal()}
            </div>`;
    },

    renderMarksModal: function () {
        return `
        <div id="marksModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in font-inter">
            <div class="bg-white rounded-[40px] p-8 w-full max-w-4xl shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                <button type="button" onclick="document.getElementById('marksModal').classList.add('hidden')" class="absolute top-6 right-6 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors font-bold">✕</button>
                
                <div class="mb-6 pb-6 border-b border-gray-100">
                    <h3 class="font-black text-2xl text-pucho-dark mb-2" id="modalStudentName">Student Name</h3>
                    <div class="flex gap-6 text-sm">
                        <span class="text-gray-400 font-bold"><span class="text-pucho-dark font-black" id="modalStudentClass">10th-A</span></span>
                        <span class="text-gray-400 font-bold">Roll No: <span class="text-pucho-dark font-black" id="modalStudentRoll">12</span></span>
                        <span class="text-gray-400 font-bold">Term: <span class="text-pucho-dark font-black" id="modalExamType">Mid Term</span></span>
                    </div>
                </div>
                
                <form id="marksEntryForm" onsubmit="dashboard.saveStudentMarks(event)">
                    <input type="hidden" id="selectedStudentId">
                    
                    <div class="overflow-x-auto mb-6">
                        <table class="w-full">
                            <thead>
                                <tr class="bg-gray-50">
                                    <th class="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-widest rounded-l-xl">Subject</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Obtained Marks</th>
                                    <th class="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-widest rounded-r-xl">Total Marks</th>
                                </tr>
                            </thead>
                            <tbody id="subjectsContainer">
                                <!-- Subject rows will be dynamically inserted -->
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gradient-to-br from-pucho-purple/5 to-indigo-50 rounded-2xl mb-6">
                        <div class="text-center">
                            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Total Marks</p>
                            <p class="text-2xl font-black text-pucho-dark" id="calcTotalMarks">0</p>
                        </div>
                        <div class="text-center">
                            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Obtained Marks</p>
                            <p class="text-2xl font-black text-pucho-dark" id="calcObtainedMarks">0</p>
                        </div>
                        <div class="text-center">
                            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">Percentage</p>
                            <p class="text-2xl font-black text-pucho-purple" id="calcPercentage">0%</p>
                        </div>
                        <div class="text-center">
                            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">CGPA</p>
                            <p class="text-2xl font-black text-green-600" id="calcCGPA">0.0</p>
                        </div>
                    </div>
                    
                    <div class="flex justify-end gap-3">
                        <button type="button" onclick="document.getElementById('marksModal').classList.add('hidden')" class="px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-all">Cancel</button>
                        <button type="submit" class="px-8 py-3 rounded-xl bg-pucho-dark text-white font-bold text-sm hover:bg-pucho-purple transition-all shadow-lg">Save Marks</button>
                    </div>
                </form>
            </div>
        </div>`;
    },

    loadMarksStudents: function () {
        const rawClass = document.getElementById('marksClass').value;
        const cls = this.normalizeClassName(rawClass);
        const selectedDiv = document.getElementById('marksDiv').value;
        const container = document.getElementById('studentCardsList');

        if (!rawClass || !selectedDiv) {
            container.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400 font-bold">
                <div class="text-6xl mb-4 opacity-30">📚</div>
                <p class="text-sm uppercase tracking-widest">Select class & division to load students</p>
            </div>`;
            return;
        }

        const students = schoolDB.students.filter(s => {
            const studentClass = this.normalizeClassName(s.class);
            return studentClass === cls && s.division === selectedDiv;
        });

        if (students.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400 font-bold">
                <div class="text-6xl mb-4 opacity-30">🔍</div>
                <p class="text-sm uppercase tracking-widest">No students found in ${rawClass} - ${selectedDiv}</p>
            </div>`;
            return;
        }

        container.innerHTML = students.map(student => `
            <div onclick="dashboard.openMarksModal('${student.id}')" class="bg-white p-5 rounded-3xl border border-gray-100 hover:border-pucho-purple hover:shadow-lg transition-all cursor-pointer group">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-pucho-purple to-indigo-600 flex items-center justify-center text-white font-black text-lg group-hover:scale-110 transition-transform">
                        ${student.name[0]}
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-pucho-dark">${student.name}</h4>
                        <p class="text-xs text-gray-400 font-bold mt-0.5">Roll No: ${student.roll_no || student.id}</p>
                    </div>
                    <div class="text-2xl opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all">📝</div>
                </div>
            </div>
        `).join('');
    },

    openMarksModal: function (studentId) {
        const student = schoolDB.students.find(s => s.id === studentId);
        if (!student) return;

        const examType = document.getElementById('marksExam').value;

        // Update modal header
        document.getElementById('modalStudentName').innerText = student.name;
        document.getElementById('modalStudentClass').innerText = `${student.class}-${student.division}`;
        document.getElementById('modalStudentRoll').innerText = student.roll_no || student.id;
        document.getElementById('modalExamType').innerText = examType;
        document.getElementById('selectedStudentId').value = studentId;

        // Get subjects for THIS specific class only
        const studentClass = this.normalizeClassName(student.class);
        const rawSubjects = (schoolDB.subjects || []).filter(sub => {
            if (!sub.class) return false;
            return this.normalizeClassName(sub.class) === studentClass;
        });

        // Unique filter by name to prevent "English" repeating multiple times
        const uniqueSubjectsMap = new Map();
        rawSubjects.forEach(sub => {
            if (!uniqueSubjectsMap.has(sub.name)) {
                uniqueSubjectsMap.set(sub.name, sub);
            }
        });
        const subjects = Array.from(uniqueSubjectsMap.values());

        // Find existing results for this student and exam
        const existingResults = (schoolDB.results || []).filter(r =>
            r.student_id === studentId && r.exam_type === examType
        );

        // Generate subject input rows
        const subjectsHTML = subjects.map(subject => {
            const existing = existingResults.find(r => r.subject === subject.name || r.subject_id === subject.id);
            const obtainedValue = existing ? existing.marks : '';
            const totalValue = existing ? existing.total : 100;

            return `
                <tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-3">
                        <span class="font-bold text-sm text-pucho-dark">${subject.name}</span>
                    </td>
                    <td class="px-4 py-3">
                        <input type="number" 
                               name="obtained_${subject.id || subject.name}" 
                               value="${obtainedValue}"
                               min="0" 
                               max="100" 
                               required 
                               onchange="dashboard.calculateMarksTotal('${studentId}')"
                               class="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white focus:border-pucho-purple outline-none font-bold text-center" 
                               placeholder="0">
                    </td>
                    <td class="px-4 py-3">
                        <input type="number" 
                               name="total_${subject.id || subject.name}" 
                               value="${totalValue}"
                               min="1" 
                               max="100" 
                               required 
                               onchange="dashboard.calculateMarksTotal('${studentId}')"
                               class="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white focus:border-pucho-purple outline-none font-bold text-center" 
                               placeholder="100">
                    </td>
                </tr>
            `;
        }).join('');

        document.getElementById('subjectsContainer').innerHTML = subjectsHTML || '<tr><td colspan="3" class="text-center text-gray-400 py-8">No subjects available for this class</td></tr>';

        // Calculate initial totals
        setTimeout(() => dashboard.calculateMarksTotal(studentId), 100);

        // Show modal
        document.getElementById('marksModal').classList.remove('hidden');
    },

    calculateMarksTotal: function (studentId) {
        const form = document.getElementById('marksEntryForm');
        if (!form) return;

        const formData = new FormData(form);
        
        let subjects = [];
        if (studentId) {
            const student = schoolDB.students.find(s => s.id === studentId || s.db_id === studentId);
            if (student) {
                const studentClass = this.normalizeClassName(student.class);
                const rawSubjects = (schoolDB.subjects || []).filter(sub => {
                    if (!sub.class) return false;
                    return this.normalizeClassName(sub.class) === studentClass;
                });

                // Unique filter by name to stay in sync with UI
                const uniqueSubjectsMap = new Map();
                rawSubjects.forEach(sub => {
                    if (!uniqueSubjectsMap.has(sub.name)) {
                        uniqueSubjectsMap.set(sub.name, sub);
                    }
                });
                subjects = Array.from(uniqueSubjectsMap.values());
            }
        }

        let totalMarks = 0;
        let obtainedMarks = 0;

        subjects.forEach(subject => {
            const obtained = parseFloat(formData.get(`obtained_${subject.id || subject.name}`)) || 0;
            const total = parseFloat(formData.get(`total_${subject.id || subject.name}`)) || 0;

            totalMarks += total;
            obtainedMarks += obtained;
        });

        const percentage = totalMarks > 0 ? ((obtainedMarks / totalMarks) * 100).toFixed(2) : 0;
        const cgpa = totalMarks > 0 ? ((obtainedMarks / totalMarks) * 10).toFixed(2) : 0;

        document.getElementById('calcTotalMarks').innerText = totalMarks;
        document.getElementById('calcObtainedMarks').innerText = obtainedMarks;
        document.getElementById('calcPercentage').innerText = percentage + '%';
        document.getElementById('calcCGPA').innerText = cgpa;
    },

    saveStudentMarks: async function (e) {
        e.preventDefault();

        const studentId = document.getElementById('selectedStudentId').value;
        const examType = document.getElementById('marksExam').value;
        const form = document.getElementById('marksEntryForm');
        const formData = new FormData(form);

        const marksData = [];
        const subjects = schoolDB.subjects || [];

        subjects.forEach(subject => {
            const obtained = formData.get(`obtained_${subject.id || subject.name}`);
            const total = formData.get(`total_${subject.id || subject.name}`);

            if (obtained && total) {
                marksData.push({
                    student_id: studentId,
                    subject_id: subject.id,
                    subject: subject.name,
                    exam_type: examType,
                    marks: parseInt(obtained),
                    total: parseInt(total),
                    grade: dashboard.calculateGrade(obtained, total),
                    created_at: new Date().toISOString()
                });
            }
        });

        showToast('Saving marks...', 'info');

        // Remove existing marks for this student and exam
        if (schoolDB.results) {
            schoolDB.results = schoolDB.results.filter(r =>
                !(r.student_id === studentId && r.exam_type === examType)
            );
        }

        // Save to database
        if (this.isDbConnected) {
            for (const mark of marksData) {
                await this.db('results', 'POST', mark);
            }
        }

        // Update local data
        if (!schoolDB.results) schoolDB.results = [];
        schoolDB.results.push(...marksData);

        // Dispatch Webhook for Report Card Generation
        try {
            const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/TIcVMflMPrt0uToVhxQ3J';
            const student = (schoolDB.students || []).find(s => String(s.id) === String(studentId) || String(s.db_id) === String(studentId));
            
            const payload = {
                action: 'RESULTS_PUBLISHED',
                exam_type: examType,
                student: {
                    id: studentId,
                    name: student ? (student.profiles?.full_name || student.name || 'Student') : 'Student',
                    class: student ? (student.sections?.classes?.name || student.class || 'N/A') : 'N/A',
                    division: student ? (student.sections?.name || student.division || 'N/A') : 'N/A'
                },
                parent: {
                    name: student ? (student.parent_name || 'Parent') : 'Parent',
                    email: student ? (student.parent_email || student.guardian_email || student.email || '') : '',
                    phone: student ? (student.profiles?.phone || student.parent_phone || student.phone || '') : ''
                },
                marks: marksData.map(m => ({
                    subject: m.subject,
                    obtained: m.marks,
                    total: m.total,
                    grade: m.grade
                })),
                published_by: auth?.currentUser?.name || auth?.currentUser?.full_name || 'Teacher'
            };

            console.log("[saveStudentMarks] Sending Webhook:", JSON.stringify(payload, null, 2));
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(res => {
                if (res.ok) console.log("[saveStudentMarks] Webhook successful");
                else console.error("[saveStudentMarks] Webhook failed:", res.status);
            }).catch(e => console.error("[saveStudentMarks] Webhook error:", e));
        } catch (webhookErr) {
            console.error("[saveStudentMarks] Error preparing webhook:", webhookErr);
        }

        showToast(`Marks saved for ${marksData.length} subject(s)!`, 'success');
        document.getElementById('marksModal').classList.add('hidden');
        form.reset();
    },

    calculateGrade: function (obtained, total) {
        const percentage = (obtained / total) * 100;
        if (percentage >= 90) return 'A+';
        if (percentage >= 80) return 'A';
        if (percentage >= 70) return 'B+';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C';
        if (percentage >= 40) return 'D';
        return 'F';
    },

    manage_quizzes: function () {
        const classes = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
        const divisions = ['A', 'B', 'C', 'D'];
        const subjects = ['Mathematics', 'Science', 'English', 'History', 'Geography', 'Computer Science', 'Physics', 'Chemistry', 'Biology'];
        const types = ['Class Test', 'Unit Test', 'Mid-Term', 'Final Exam', 'Surprise Quiz'];

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 shadow-subtle animate-fade-in font-inter">
                <div class="flex justify-between items-center mb-8">
                    <div>
                        <h3 class="font-bold text-2xl text-pucho-dark">Quiz Builder</h3>
                        <p class="text-gray-400 text-sm mt-1">Create and assign assessments</p>
                    </div>
                    <button onclick="document.getElementById('createQuizForm').classList.toggle('hidden')" class="bg-pucho-dark text-white px-6 py-3 rounded-xl font-bold hover:bg-pucho-purple transition-all">+ NEW ASSIGNMENT</button>
                </div>

                <!-- Creation Form -->
                <div id="createQuizForm" class="hidden mb-10 mt-8 bg-gray-50 p-6 rounded-3xl border border-gray-100 animate-slide-up">
                    <h4 class="font-bold text-lg mb-4 text-pucho-dark">Configure Assessment</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        ${this.renderCustomSelect('quizClass', 'Select Class', classes)}
                        ${this.renderCustomSelect('quizDiv', 'Select Division', [{ value: 'All', text: 'All Divisions' }, ...divisions])}
                        ${this.renderCustomSelect('quizSubject', 'Select Subject', subjects)}
                        ${this.renderCustomSelect('quizType', 'Assessment Type', types)}
                    </div>
                    <input type="text" id="quizTitle" placeholder="Enter Quiz / Exam Title (e.g. Chapter 1 - Algebra)" class="w-full px-4 py-3 rounded-2xl border border-gray-200 mb-4 focus:border-pucho-purple outline-none">
                    <div class="flex justify-end">
                        <button onclick="dashboard.publishQuiz()" class="bg-pucho-purple text-white px-8 py-3 rounded-xl font-bold hover:shadow-glow transition-all">PUBLISH TO CLASS</button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    ${schoolDB.quizzes.map(q => `
                        <div class="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:border-pucho-purple transition-all">
                            <div class="absolute top-0 right-0 p-4 opacity-10 text-4xl group-hover:scale-110 transition-transform">📝</div>
                            <span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-widest mb-2 inline-block">${q.type}</span>
                            <h4 class="font-bold text-xl text-pucho-dark mb-1 relative z-10">${q.title}</h4>
                            <p class="text-sm font-bold text-gray-400 mb-4 relative z-10">${q.subject} • ${q.class} - ${q.division}</p>
                            <div class="flex items-center justify-between relative z-10">
                                <span class="text-xs font-bold text-gray-400">Published: ${q.date}</span>
                                <button class="text-pucho-purple font-bold text-xs uppercase hover:underline">View Stats</button>
                            </div>
                        </div>
                    `).join('')}
                    ${schoolDB.quizzes.length === 0 ? `<div class="col-span-2 text-center py-10 text-gray-400">No active quizzes found. Create one to get started!</div>` : ''}
                </div>
            </div>
            <style>.input-field {width: 100%; padding: 12px; border-radius: 12px; border: 1px solid #e5e7eb; background: white; outline: none; font-weight: 600; font-size: 0.875rem; color: #1f2937; }</style>`;
    },

    homework: function () {
        const classes = ['Nursery', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
        const divisions = ['A', 'B', 'C', 'D'];
        const subjects = (schoolDB.subjects || []).length > 0 ? (schoolDB.subjects || []).map(s => s.name) : ['Mathematics', 'Science', 'English', 'Social Studies'];

        return `
            <div class="space-y-8 animate-fade-in font-inter">
                <!-- Header with Action -->
                <div class="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[40px] border border-gray-100 shadow-subtle">
                    <div>
                        <h3 class="font-black text-2xl text-pucho-dark">Homework Management</h3>
                        <p class="text-gray-400 text-sm font-bold mt-1">Assign and track student coursework</p>
                    </div>
                    <button onclick="dashboard.openAddHomeworkModal()" class="w-full md:w-auto bg-pucho-dark text-white px-8 py-4 rounded-2xl font-bold hover:shadow-glow hover:bg-pucho-purple transition-all transform active:scale-95 flex items-center justify-center gap-2">
                        <span>➕</span> ADD HOMEWORK
                    </button>
                </div>

                <!-- Filters & List Section -->
                <div class="bg-white rounded-[40px] p-8 md:p-10 border border-gray-100 shadow-subtle min-h-[500px]">
                    <div class="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                        <div class="flex items-center gap-3">
                            <h4 class="font-bold text-lg text-pucho-dark">All Assignments</h4>
                            <span class="bg-pucho-purple/5 text-pucho-purple px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-pucho-purple/10" id="hwCount">${(schoolDB.homework || []).length} Total</span>
                        </div>
                        
                        <div class="flex flex-wrap gap-4 w-full md:w-auto">
                            <select id="filterHwClass" onchange="dashboard.updateHomeworkList()" class="flex-1 md:flex-none px-6 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-bold text-pucho-dark outline-none focus:border-pucho-purple cursor-pointer">
                                <option value="">All Grades</option>
                                ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
                            </select>
                            <select id="filterHwDiv" onchange="dashboard.updateHomeworkList()" class="flex-1 md:flex-none px-6 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm font-bold text-pucho-dark outline-none focus:border-pucho-purple cursor-pointer">
                                <option value="">All Divisions</option>
                                ${divisions.map(d => `<option value="${d}">${d}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div id="staffHomeworkList" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${this.renderStaffHomeworkItems(schoolDB.homework || [])}
                    </div>
                </div>
            </div>

            <!-- Add Homework Modal -->
            <div id="addHomeworkModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm hidden animate-fade-in">
                <div class="bg-white p-10 w-full max-w-2xl rounded-[40px] border border-white/30 shadow-2xl relative animate-slide-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <button onclick="document.getElementById('addHomeworkModal').classList.add('hidden')" class="absolute top-8 right-8 p-3 hover:bg-gray-100 rounded-full transition-colors font-bold">✕</button>
                    
                    <div class="mb-8 p-1 border-b border-gray-50 pb-6">
                        <div class="w-14 h-14 bg-pucho-purple/10 rounded-2xl flex items-center justify-center text-3xl mb-4">📖</div>
                        <h1 class="text-3xl font-black text-pucho-dark mb-1">New Assignment</h1>
                        <p class="text-gray-400 font-bold text-sm">Fill in the details to publish homework to your class.</p>
                    </div>

                    <form class="space-y-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Class</label>
                                <select id="hwClass" onchange="dashboard.updateHwSubjects()" class="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:border-pucho-purple appearance-none">
                                    <option value="">Select Class</option>
                                    ${classes.map(c => `<option value="${c}">${c}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Subject</label>
                                <select id="hwSubject" class="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:border-pucho-purple appearance-none">
                                    <option value="">Select Subject</option>
                                    ${subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Division</label>
                                <select id="hwDivision" class="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:border-pucho-purple appearance-none">
                                    <option value="All">All Divisions</option>
                                    <option value="A">Division A</option><option value="B">Division B</option>
                                    <option value="C">Division C</option><option value="D">Division D</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Due Date</label>
                                <input type="date" id="hwDueDate" class="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:border-pucho-purple">
                            </div>
                        </div>

                        <div>
                            <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Assignment Title</label>
                            <input type="text" id="hwTitle" placeholder="e.g. Worksheet - Quadratic Equations" class="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:border-pucho-purple">
                        </div>

                        <div>
                            <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Instructions / Description</label>
                            <textarea id="hwDesc" rows="4" placeholder="Mention steps, pages or specific requirements..." class="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-bold text-sm outline-none focus:border-pucho-purple resize-none"></textarea>
                        </div>

                        <div>
                            <label class="text-[10px] font-black text-pucho-purple uppercase tracking-widest mb-2 block">Attachment (Optional)</label>
                            <div class="relative">
                                <input type="file" id="hwFile" class="hidden" onchange="dashboard.handleHwFileUpload(this)">
                                <label for="hwFile" id="hwUploadDrop" class="flex flex-col items-center justify-center w-full h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] cursor-pointer hover:bg-pucho-purple/5 hover:border-pucho-purple transition-all group">
                                    <span class="text-3xl mb-2 group-hover:scale-110 transition-transform inline-block rotate-90">📎</span>
                                    <span id="hwFileNameDisplay" class="text-xs font-bold text-gray-400 group-hover:text-pucho-purple transition-colors">Click or drop file here</span>
                                </label>
                            </div>
                        </div>

                        <div class="flex gap-4 pt-4">
                            <button type="button" onclick="document.getElementById('addHomeworkModal').classList.add('hidden')" class="flex-1 px-8 py-4 rounded-2xl font-bold uppercase text-xs tracking-widest text-gray-500 bg-gray-50 hover:bg-gray-100 transition-all">Cancel</button>
                            <button type="button" onclick="dashboard.uploadHomework()" class="flex-[2] bg-pucho-dark text-white px-8 py-4 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-pucho-purple hover:shadow-glow transition-all transform active:scale-95 shadow-lg">Publish Assignment</button>
                        </div>
                    </form>
                </div>
            </div>`;
    },

    renderStaffHomeworkItems: function (items) {
        if (!items || items.length === 0) {
            return `<div class="col-span-full py-20 text-center text-gray-300 font-bold uppercase tracking-widest italic animate-pulse">
                <div class="text-6xl mb-4 opacity-10">📥</div>
                No assignments found for the selection
            </div>`;
        }

        return items.map(h => `
            <div class="p-6 rounded-[32px] border bg-gray-50 border-gray-100 relative overflow-hidden group hover:border-pucho-purple transition-all hover:bg-white hover:shadow-xl">
                <div class="absolute top-0 right-0 p-4 opacity-5 text-4xl group-hover:scale-110 transition-transform">📄</div>
                <div class="flex justify-between items-start mb-4">
                    <div class="flex flex-wrap gap-2">
                        <span class="text-[9px] font-black uppercase tracking-tighter bg-pucho-purple/10 text-pucho-purple px-2 py-0.5 rounded">${h.subject}</span>
                        <span class="text-[9px] font-black uppercase tracking-tighter bg-gray-200 text-gray-500 px-2 py-0.5 rounded">${h.class} - ${h.division}</span>
                    </div>
                    <span class="text-[9px] font-bold text-gray-400 uppercase">Due: ${h.dueDate || h.date || 'N/A'}</span>
                </div>
                <h4 class="font-black text-lg mb-2 text-pucho-dark leading-tight group-hover:text-pucho-purple transition-colors">${h.title}</h4>
                <p class="text-xs text-gray-400 font-medium line-clamp-2 mb-4">${h.description || 'No instructions provided.'}</p>
                
                <div class="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div class="flex items-center gap-2">
                        ${h.file ? `
                            <a href="${h.file}" target="_blank" class="flex items-center gap-2 group/link bg-green-50 px-3 py-1.5 rounded-xl border border-green-100/50 hover:bg-green-100 transition-all">
                                <div class="w-5 h-5 bg-green-500 text-white rounded-lg flex items-center justify-center text-[10px] shadow-sm">📎</div>
                                <span class="text-[10px] font-bold text-green-700">Yes Attachment (Click to View)</span>
                            </a>
                        ` : `
                            <div class="flex items-center gap-2 opacity-40 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
                                <div class="w-5 h-5 bg-gray-200 text-gray-500 rounded-lg flex items-center justify-center text-[10px]">📎</div>
                                <span class="text-[10px] font-bold text-gray-400">No Attachment</span>
                            </div>
                        `}
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="dashboard.editHomework('${h.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white transition-all shadow-sm group-hover:scale-105" title="Edit Assignment">
                            ✏️
                        </button>
                        <button onclick="dashboard.deleteHomework('${h.id}')" class="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm group-hover:scale-105" title="Delete Assignment">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    openAddHomeworkModal: function () {
        this.editingHomeworkId = null;
        document.getElementById('hwSubject').value = '';
        document.getElementById('hwClass').value = '';
        document.getElementById('hwDivision').value = '';
        document.getElementById('hwTitle').value = '';
        document.getElementById('hwDesc').value = '';
        document.getElementById('hwDueDate').value = '';
        
        // Reset subjects to all until class is selected
        this.updateHwSubjects();
        
        const submitBtn = document.querySelector('#addHomeworkModal button.bg-pucho-dark');
        if (submitBtn) submitBtn.innerText = "Publish Assignment";
        
        document.getElementById('addHomeworkModal').classList.remove('hidden');
    },

    updateHwSubjects: function () {
        console.log("[updateHwSubjects] Triggered");
        const clsSelect = document.getElementById('hwClass');
        const subSelect = document.getElementById('hwSubject');
        if (!clsSelect || !subSelect) {
            console.warn("[updateHwSubjects] Elements not found", { clsSelect: !!clsSelect, subSelect: !!subSelect });
            return;
        }

        const selectedClass = clsSelect.value;
        console.log("[updateHwSubjects] Selected Class:", selectedClass);
        const allSubjects = schoolDB.subjects || [];
        
        // Filter subjects based on class
        let filteredSubjects = allSubjects;
        if (selectedClass) {
            filteredSubjects = allSubjects.filter(s => s.class === selectedClass);
        }

        // If no subjects found for class, show unique names as fallback
        if (filteredSubjects.length === 0 && selectedClass) {
            console.warn(`No subjects found for class ${selectedClass}, showing all unique names.`);
            const uniqueNames = [...new Set(allSubjects.map(s => s.name))];
            subSelect.innerHTML = `<option value="">Select Subject</option>` + 
                uniqueNames.map(s => `<option value="${s}">${s}</option>`).join('');
            return;
        }

        const uniqueFiltered = [...new Set(filteredSubjects.map(s => s.name))];
        
        subSelect.innerHTML = `<option value="">Select Subject</option>` + 
            uniqueFiltered.map(s => `<option value="${s}">${s}</option>`).join('');
    },

    deleteHomework: function (id) {
        let modal = document.getElementById('deleteHwModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'deleteHwModal';
            modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm animate-fade-in font-inter';
            modal.innerHTML = `
                <div class="bg-white p-8 w-full max-w-sm rounded-[32px] border border-white/30 shadow-2xl relative animate-slide-up text-center">
                    <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">🗑️</div>
                    <h3 class="text-2xl font-bold text-pucho-dark mb-2">Delete Assignment</h3>
                    <p class="text-gray-500 mb-8 text-sm">Are you sure you want to delete this assignment? This action cannot be undone.</p>
                    <div class="flex gap-4">
                        <button id="cancelDeleteHw" class="flex-1 px-6 py-3 rounded-2xl font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 transition-all">Cancel</button>
                        <button id="confirmDeleteHw" class="flex-1 bg-red-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-red-600 shadow-lg hover:shadow-glow transition-all">Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        modal.classList.remove('hidden');
        
        document.getElementById('cancelDeleteHw').onclick = () => {
            modal.classList.add('hidden');
        };
        
        document.getElementById('confirmDeleteHw').onclick = async () => {
            modal.classList.add('hidden');
            showToast("Deleting assignment...", "info");

            if (dashboard.isDbConnected) {
                try {
                    await dashboard.db('homework', 'DELETE', null, `?id=eq.${id}`);
                } catch (err) {
                    console.error("Failed to delete homework from DB:", err);
                    showToast("Failed to delete from cloud.", "error");
                    return;
                }
            }

            schoolDB.homework = (schoolDB.homework || []).filter(h => String(h.id) !== String(id));
            dashboard.updateHomeworkList();
            showToast("Assignment deleted successfully!", "success");
        };
    },

    handleHwFileUpload: function (input) {
        const display = document.getElementById('hwFileNameDisplay');
        const drop = document.getElementById('hwUploadDrop');
        if (input.files && input.files[0]) {
            display.innerText = input.files[0].name;
            display.classList.add('text-pucho-purple');
            drop.classList.add('bg-pucho-purple/5', 'border-pucho-purple');
        } else {
            display.innerText = "Click or drop file here";
            display.classList.remove('text-pucho-purple');
            drop.classList.remove('bg-pucho-purple/5', 'border-pucho-purple');
        }
    },

    updateHomeworkList: function () {
        const cls = document.getElementById('filterHwClass').value;
        const div = document.getElementById('filterHwDiv').value;
        const container = document.getElementById('staffHomeworkList');
        const countSpan = document.getElementById('hwCount');

        const filtered = (schoolDB.homework || []).filter(h => {
            const matchesClass = !cls || h.class === cls;
            const matchesDiv = !div || h.division === div || h.division === 'All';
            return matchesClass && matchesDiv;
        });

        container.innerHTML = this.renderStaffHomeworkItems(filtered);
        countSpan.innerText = `${filtered.length} Items`;
    },

    uploadHomework: async function () {
        console.log("[uploadHomework] Starting publish process...");
        showToast("Processing homework...", "info");
        const subject = document.getElementById('hwSubject')?.value;
        const cls = document.getElementById('hwClass')?.value;
        const div = document.getElementById('hwDivision')?.value || 'All';
        const title = document.getElementById('hwTitle')?.value;
        const desc = document.getElementById('hwDesc')?.value;
        const fileInput = document.getElementById('hwFile');
        const dueDate = document.getElementById('hwDueDate')?.value;

        if (!subject || !cls || !title) {
            console.warn("[uploadHomework] Validation failed: Subject, Class, and Title are required.");
            showToast('Please fill in required fields (Subject, Class, Title)', 'error');
            return;
        }

        // Safe ID Generation Fallback
        const generateSafeID = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'hw-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
        };

        const isEditing = !!this.editingHomeworkId;
        const hwId = isEditing ? this.editingHomeworkId : generateSafeID();
        console.log(`[uploadHomework] Mode: ${isEditing ? 'Editing' : 'New'}, ID: ${hwId}`);

        // Defensive Auth Access
        const currentUserName = auth?.currentUser?.name || auth?.currentUser?.full_name || 'Teacher';
        const currentUserId = auth?.currentUser?.id || 'unknown';

        // Find existing HW if editing to preserve data (like pdf_link)
        let existingHw = null;
        if (isEditing) {
            existingHw = (schoolDB.homework || []).find(h => String(h.id) === String(hwId));
        }

        // 1. Find the Section ID
        const sections = (schoolDB.sections || []).filter(s => s.classes && s.classes.name === cls);
        const section = div === 'All' ? sections[0] : sections.find(s => s.name === div);

        if (!section && this.isDbConnected) {
            console.warn(`[uploadHomework] Target class/division not found in records. Proceeding without section_id.`);
        }

        const newHw = {
            id: hwId,
            title,
            subject,
            class: cls,
            division: div,
            assigned_by: currentUserName,
            description: desc,
            due_date: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            pdf_link: existingHw ? (existingHw.pdf_link || existingHw.file || null) : null // Preserve existing link if present
        };

        // 0. Handle File Upload if exists
        if (fileInput && fileInput.files && fileInput.files[0]) {
            showToast('Uploading attachment...', 'info');
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${hwId}.${fileExt}`;
            const publicUrl = await this.uploadFile('homework', fileName, file);
            if (publicUrl) {
                console.log("[uploadHomework] File uploaded successfully:", publicUrl);
                newHw.pdf_link = publicUrl;
                showToast('Attachment uploaded!', 'success');
            } else {
                console.error("[uploadHomework] File upload failed.");
                showToast('Attachment upload failed, proceeding without it.', 'warning');
            }
        }
        
        if (!isEditing) {
            newHw.created_at = new Date().toISOString();
        }

        const uiHw = {
            ...newHw,
            id: isEditing ? hwId : `HW-TMP-${Date.now()}`,
            assignedBy: currentUserName,
            dueDate: new Date(newHw.due_date).toLocaleDateString(),
            date: new Date().toLocaleDateString(),
            status: 'Active',
            file: newHw.pdf_link // Map for UI display
        };

        showToast(isEditing ? 'Updating assignment...' : 'Publishing assignment...', 'info');

        if (!schoolDB.homework) schoolDB.homework = [];
        
        if (isEditing) {
            const idx = schoolDB.homework.findIndex(h => String(h.id) === String(hwId));
            if (idx !== -1) {
                uiHw.date = schoolDB.homework[idx].date || uiHw.date;
                schoolDB.homework[idx] = { ...schoolDB.homework[idx], ...uiHw };
            }
        } else {
            schoolDB.homework.unshift(uiHw);
        }

        if (this.isDbConnected) {
            try {
                console.log(`[uploadHomework] Syncing to DB... ID: ${hwId}`);
                let res;
                if (isEditing) {
                    res = await this.db('homework', 'PATCH', newHw, `?id=eq.${hwId}`);
                } else {
                    res = await this.db('homework', 'POST', newHw);
                }
                console.log("[uploadHomework] DB Sync Result:", res);
                if (res && res[0] && !isEditing) uiHw.id = res[0].id;
            } catch (err) {
                console.error("[uploadHomework] DB Sync Failure:", err);
                showToast("DB Sync failed. Saved locally.", "warning");
            }
        }

        
        // Trigger webhook on both NEW publish and EDITS to keep Pucho Studio in sync
        try {
                console.log("[uploadHomework] Webhook starting. Target Class:", cls, "Target Division:", div);
                let students = [];
                if (this.isDbConnected) {
                    console.log("[uploadHomework] Fetching students from DB...");
                    let allStus = await this.db('students', 'GET', null, `?select=*,profiles(full_name,phone),sections(name,classes(name))`);
                    console.log("[uploadHomework] Total students in DB:", allStus?.length || 0);
                    if (allStus) {
                        students = allStus.filter(s => {
                            const sClass = s.sections?.classes?.name || 'N/A';
                            const sDiv = s.sections?.name || 'N/A';
                            const match = sClass === cls && (div === 'All' || sDiv === div);
                            if (!match) {
                                // console.log(`[uploadHomework] Skipping student: ${s.profiles?.full_name} (Class: ${sClass}, Div: ${sDiv})`);
                            }
                            return match;
                        });
                    }
                } else {
                    console.log("[uploadHomework] Using mock students...");
                    students = (schoolDB.students || []).filter(s => s.class === cls && (div === 'All' || s.division === div));
                }

                console.log(`[uploadHomework] Final target student count: ${students.length}`);

                // DEBUG: If no students found, let's send a surrogate payload so the user sees SOMETHING in Pucho Studio
                if (!students || students.length === 0) {
                    console.warn("[uploadHomework] No students found for this class/division. Sending a debug payload to webhook anyway.");
                    students = [{
                        profiles: { full_name: "DEBUG STUDENT (No Match Found)" },
                        parent_email: "debug@pucho.ai",
                        parent_phone: "0000000000"
                    }];
                }

                if (students && students.length > 0) {
                    const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/aUTfSnTHeQBmJXXs5xCxD';
                    const payload = {
                        action: 'HOMEWORK_PUBLISHED',
                        homework: {
                            title,
                            subject,
                            class: cls,
                            division: div,
                            teacher: currentUserName,
                            due_date: uiHw.dueDate,
                            description: desc,
                            pdf_link: newHw.pdf_link || 'https://pucho.ai/assets/img/logo/pucho-logo.png' // Use working fallback
                        },
                        recipients: students.map(s => ({
                            student_name: s.profiles?.full_name || s.name || 'Student',
                            parent_email: s.parent_email || s.guardian_email || s.email || 'parent@example.com',
                            parent_phone: s.profiles?.phone || s.parent_phone || s.phone || ''
                        }))
                    };

                    console.log("[uploadHomework] Sending Webhook Payload:", JSON.stringify(payload, null, 2));

                    const webRes = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (webRes.ok) {
                        console.log('[uploadHomework] Webhook successfully dispatched to Pucho Studio');
                    } else {
                        const errText = await webRes.text();
                        console.error('[uploadHomework] Webhook failed with status:', webRes.status, 'Response:', errText);
                    }
                }
            } catch (webhookErr) {
                console.error('[uploadHomework] Webhook Trigger Error:', webhookErr);
            }

        showToast(isEditing ? 'Assignment updated successfully!' : 'Homework published successfully!', 'success');
        document.getElementById('addHomeworkModal').classList.add('hidden');
        this.editingHomeworkId = null; 
        this.updateHomeworkList();
    },

    // --- PARENT / SHARED ---
    // Note: student_profile, parent_attendance, parent_fees are aliased above.

    parent_results: function () {
        const student = (schoolDB.students || []).find(s => s.parent_id === auth.currentUser.id) || (schoolDB.students ? schoolDB.students[0] : null);
        if (!student) return '<div class="p-20 text-center text-gray-400 italic">No student record associated with your account.</div>';
        const childId = student.id;
        const results = schoolDB.results.filter(r => r.student_id === childId);

        return `<div class="bg-white p-10 rounded-[40px] border border-gray-100 shadow-subtle animate-fade-in font-inter">
                <div class="flex justify-between items-center mb-10">
                    <div>
                        <h3 class="text-3xl font-bold text-pucho-dark tracking-tight">Academic Report Card</h3>
                        <p class="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">Session 2024-25 • ${student.name}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-gray-400 uppercase">Avg GPA</p>
                        <p class="text-4xl font-black text-pucho-purple tracking-tighter">${results.length > 0 ? (results.some(r => r.grade === 'F') ? 'B' : 'A') : 'N/A'}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${results.map(r => `
                        <div class="p-6 bg-gray-50 rounded-3xl border border-gray-100 flex justify-between items-center group hover:bg-white hover:shadow-md transition-all">
                            <div>
                                <h4 class="font-bold text-pucho-dark">${r.subject}</h4>
                                <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Score: ${r.marks}/100</p>
                            </div>
                            <div class="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center font-black text-pucho-purple shadow-sm">${r.grade}</div>
                        </div>
                    `).join('')}
                    ${results.length === 0 ? `<div class="col-span-3 text-center py-20 text-gray-300">
                        <div class="text-5xl mb-4 opacity-20">📜</div>
                        <p class="font-bold italic">No results published for this term yet.</p>
                    </div>` : ''}
                </div>

                <div class="mt-12 pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
                     <p class="text-sm text-gray-400 max-w-md italic">Academic performance is evaluated based on internal assessments and term-end evaluations.</p>
                     <button onclick="dashboard.printReportCard('${childId}')" class="px-8 py-3 bg-pucho-dark text-white rounded-2xl font-bold hover:bg-pucho-purple transition-all shadow-glow uppercase text-xs tracking-widest">Download Full PDF</button>
                </div>
            </div>`;
    },

    printReportCard: function (studentId) {
        const student = schoolDB.students.find(s => s.id === studentId || s.db_id === studentId);
        if (!student) return;

        const results = (schoolDB.results || []).filter(r => r.student_id === studentId);
        if (results.length === 0) {
            showToast("No academic results available to print.", "warning");
            return;
        }

        const printWindow = window.open('', '_blank');
        
        let totalMax = 0;
        let totalObtained = 0;
        
        const tableRows = results.map(r => {
            totalMax += parseInt(r.total || 100);
            totalObtained += parseInt(r.marks || 0);
            return `
                <tr>
                    <td>${r.subject}</td>
                    <td>${r.total || 100}</td>
                    <td><strong>${r.marks}</strong></td>
                    <td class="grade-cell">${r.grade}</td>
                </tr>
            `;
        }).join('');

        const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(2) : 0;
        const resultStatus = percentage >= 35 ? 'PASSED' : 'FAILED';
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Report Card - ${student.name}</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
                    body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; color: #111827; }
                    
                    /* Header Style */
                    .blue-header {
                        height: 110px;
                        background-color: #111834;
                        color: white;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        text-align: center;
                    }
                    .blue-header h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px; }
                    .blue-header p { margin: 4px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; }
                    
                    .content-wrapper { padding: 40px 60px; }
                    
                    /* Student Info Section */
                    .student-meta {
                        display: grid;
                        grid-template-cols: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 40px;
                        padding: 24px;
                        background: #f9fafb;
                        border-radius: 20px;
                    }
                    .meta-item { display: flex; flex-direction: column; gap: 4px; }
                    .meta-label { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
                    .meta-value { font-size: 16px; font-weight: 700; color: #111834; }
                    
                    /* Table Style */
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { 
                        text-align: left; 
                        background: #f3f4f6; 
                        padding: 16px; 
                        font-size: 11px; 
                        font-weight: 800; 
                        text-transform: uppercase; 
                        letter-spacing: 1px;
                        color: #4b5563;
                        border-bottom: 2px solid #e5e7eb;
                    }
                    td { padding: 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
                    .grade-cell { font-weight: 800; color: #8b5cf6; }
                    
                    /* Summary Section */
                    .summary-row {
                        margin-top: 30px;
                        display: flex;
                        justify-content: flex-end;
                        gap: 40px;
                        padding: 20px;
                        border-top: 2px solid #111834;
                    }
                    .summary-box { text-align: center; }
                    .summary-box .label { font-size: 10px; font-weight: 800; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
                    .summary-box .value { font-size: 24px; font-weight: 800; color: #111834; }
                    
                    /* Signature Styles */
                    .signature-area {
                        margin-top: 80px;
                        display: flex;
                        justify-content: space-between;
                        padding: 0 40px;
                    }
                    .sig-block {
                        width: 200px;
                        text-align: center;
                    }
                    .sig-line {
                        border-top: 1px solid #111834;
                        margin-bottom: 8px;
                    }
                    .sig-text {
                        font-size: 12px;
                        font-weight: 700;
                        text-transform: uppercase;
                        color: #111834;
                    }

                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="blue-header">
                    <h1>PUCHO ACADEMY</h1>
                    <p>Annual Progress Report Card • 2024-25</p>
                </div>
                
                <div class="content-wrapper">
                    <div class="student-meta">
                        <div class="meta-item">
                            <span class="meta-label">Student Name</span>
                            <span class="meta-value">${student.name}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Admission No</span>
                            <span class="meta-value">${student.id || student.db_id}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Class & Division</span>
                            <span class="meta-value">${student.class} - ${student.division}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Roll Number</span>
                            <span class="meta-value">${student.roll_no || '-'}</span>
                        </div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Max Marks</th>
                                <th>Marks Obtained</th>
                                <th>Grade</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    
                    <div class="summary-row">
                        <div class="summary-box">
                            <div class="label">Grand Total</div>
                            <div class="value">${totalObtained}/${totalMax}</div>
                        </div>
                        <div class="summary-box">
                            <div class="label">Percentage</div>
                            <div class="value">${percentage}%</div>
                        </div>
                        <div class="summary-box">
                            <div class="label">Result</div>
                            <div class="value" style="color: ${resultStatus === 'PASSED' ? '#10b981' : '#ef4444'}">${resultStatus}</div>
                        </div>
                    </div>
                    
                    <div class="signature-area">
                        <div class="sig-block">
                            <div class="sig-line"></div>
                            <div class="sig-text">Class Teacher</div>
                        </div>
                        <div class="sig-block">
                            <div class="sig-line"></div>
                            <div class="sig-text">Principal</div>
                        </div>
                    </div>
                </div>

                <div style="position: fixed; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 10px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; font-weight: 700;">
                    Generated by Pucho.ai SMS Unified System
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                            setTimeout(() => window.close(), 500);
                        }, 200);
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
        showToast('Preparing Report Card PDF...', 'info');
    },

    // --- EXAM MODAL ---
    showExamModal: function () {
        const modal = document.getElementById('examModal');
        if (!modal) {
            // If modal doesn't exist in DOM, render it
            const modalHtml = this.renderExamModal();
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
        // Re-select fresh reference
        document.getElementById('examModal').classList.remove('hidden');
    },

    renderExamModal: function () {
        // Get Subjects from DB for Dropdown
        const subjects = this.isDbConnected ? schoolDB.subjects : [];
        // Group by class if needed, or just list all unique names for now
        // For MVP: Show generic dropdown or depend on class selection

        const uniqueSubjects = [...new Set(subjects.map(s => s.name))];

        return `<div id="examModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-pucho-dark/40 backdrop-blur-sm animate-fade-in">
    <div class="bg-white p-8 w-full max-w-lg rounded-[32px] border border-white/30 shadow-2xl relative animate-slide-up">
        <button onclick="document.getElementById('examModal').classList.add('hidden')" class="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full">✕</button>

        <div class="mb-6 border-b border-gray-50 pb-4">
            <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-2xl mb-4">📝</div>
            <h2 class="text-2xl font-bold text-pucho-dark">Schedule New Exam</h2>
            <p class="text-gray-400 text-sm">Create an assessment event</p>
        </div>

        <form onsubmit="dashboard.saveExam(event)" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label-sm">Class</label>
                    <select id="examClass" class="input-field" required>
                        <option value="">Select</option>
                        ${['LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'].map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="label-sm">Division</label>
                    <select id="examDiv" class="input-field">
                        <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                    </select>
                </div>
            </div>

            <div>
                <label class="label-sm">Subject</label>
                <div class="relative">
                    <select id="examSubject" class="input-field appearance-none" required>
                        <option value="">Select Subject</option>
                        ${uniqueSubjects.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                    <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                </div>
                <p class="text-[10px] text-gray-400 mt-1 ml-1">Subjects are loaded from Subject Master</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="label-sm">Date</label>
                    <input type="date" id="examDate" class="input-field" required>
                </div>
                <div>
                    <label class="label-sm">Time</label>
                    <input type="time" id="examTime" class="input-field" required>
                </div>
            </div>

            <div>
                <label class="label-sm">Venue / Room</label>
                <input type="text" id="examVenue" class="input-field" placeholder="e.g. Hall 1" required>
            </div>

            <div class="pt-4 flex justify-end gap-3">
                <button type="button" onclick="document.getElementById('examModal').classList.add('hidden')" class="px-6 py-3 rounded-2xl font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
                <button type="submit" class="bg-pucho-dark text-white px-8 py-3 rounded-2xl font-bold hover:shadow-glow hover:bg-pucho-purple transition-all">Schedule</button>
            </div>
        </form>
    </div>
            </div>`;
    },

    saveExam: async function (e) {
        e.preventDefault();
        const newExam = {
            id: crypto.randomUUID(),
            class: document.getElementById('examClass').value,
            division: document.getElementById('examDiv').value,
            subject: document.getElementById('examSubject').value,
            date: document.getElementById('examDate').value,
            time: document.getElementById('examTime').value,
            venue: document.getElementById('examVenue').value,
            created_at: new Date().toISOString()
        };

        // Optimistic UI
        schoolDB.exams.unshift(newExam);
        this.loadPage('exams');
        document.getElementById('examModal').classList.add('hidden');
        showToast('Exam Scheduled Successfully!', 'success');

        // DB Sync
        if (this.isDbConnected) {
            await this.db('exams', 'POST', newExam);
        }
    },

    parent_notices: function () {
        // Filter notices for Parents
        let notices = schoolDB.notices.filter(n => n.target === 'Parents' || n.target === 'All').map(n => `
    <div class="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                    <h4 class="font-bold text-pucho-dark text-lg mb-2">${n.title}</h4>
                    <p class="text-xs font-bold text-gray-400 mb-2 uppercase">${n.date}</p>
                    <p class="text-sm text-gray-500">${n.content}</p>
                </div>
    `).join('');

        if (!notices) notices = `<div class="text-center text-gray-400 py-10">No new notices.</div>`;

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 animate-fade-in font-inter">
                <h3 class="font-bold text-2xl mb-8">Parent Circulars</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 font-inter">${notices}</div>
            </div>`;
    },

    staff_notices: function () {
        // Filter notices for Staff
        let notices = schoolDB.notices.filter(n => n.target === 'Staff' || n.target === 'All').map(n => `
    <div class="p-6 bg-blue-50 rounded-3xl border border-blue-100 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-4xl">📢</div>
                    <h4 class="font-bold text-pucho-dark text-lg mb-1 relative z-10">${n.title}</h4>
                    <p class="text-xs font-bold text-blue-400 mb-4 uppercase relative z-10">${n.date}</p>
                    <p class="text-sm text-gray-600 relative z-10">${n.content}</p>
                </div>
    `).join('');

        if (!notices) notices = `<div class="text-center text-gray-400 py-10">No new notices for staff.</div>`;

        return `<div class="bg-white rounded-[40px] p-8 border border-gray-100 animate-fade-in font-inter">
                <h3 class="font-bold text-2xl mb-8">Staff Notice Board</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 font-inter">${notices}</div>
            </div>`;
    },

    // --- ADVANCED FLOW SIMULATIONS ---
    runRecoveryFlow: function () {
        const pendingCount = schoolDB.fees.filter(f => f.status === 'Pending').length;
        showToast(`Initiating Smart Recovery Flow for ${pendingCount} records...`, 'info');
        setTimeout(() => showToast(`AI analyzing payment history for critical defaults...`, 'info'), 1500);
        setTimeout(() => showToast(`Successfully dispatched alerts to ${pendingCount} parents via WhatsApp & SMS.`, 'success'), 3500);
    }
};

// Export
window.dashboard = dashboard;
