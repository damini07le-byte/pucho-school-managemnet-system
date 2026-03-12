// AUTHENTICATION LOGIC
const auth = {
    currentUser: JSON.parse(localStorage.getItem('sms_user')) || null,

    // Static Credentials
    credentials: {
        admin: { email: "admin", password: "123", role: "admin", name: "Supreme Admin" },
        staff: { email: "staff", password: "123", role: "staff", name: "Teacher Rahul" },
        admin: { email: "admin", password: "123", role: "admin", name: "Supreme Admin" },
        staff: { email: "staff", password: "123", role: "staff", name: "Teacher Rahul" },
        parent: { email: "parent", password: "123", role: "parent", name: "Vikram Das" }
    },

    login: async function (email, password, role) {
        // 1. Check Static Credentials FIRST (for backward compatibility/demo)
        let user = this.credentials[email.toLowerCase().trim()];
        if (!user) {
            user = Object.values(this.credentials).find(u => u.email === email && u.role === role);
        }

        if (user && user.password === String(password)) {
            if (user.role === role) {
                console.log("Static Login Success:", user);
                this.currentUser = user;
                localStorage.setItem('sms_user', JSON.stringify(user));
                return true;
            }
        }

        // 2. REAL Supabase Auth Logic
        const supabase = window.dashboard.supabase;
        if (!supabase) {
            window.dashboard.initSupabase();
        }

        if (window.dashboard.supabase) {
            const { data, error } = await window.dashboard.supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (data?.user) {
                console.log("Supabase Auth Success:", data.user);
                // Extract metadata (role, name) from user_metadata
                const metadata = data.user.user_metadata || {};
                this.currentUser = {
                    id: data.user.id,
                    email: data.user.email,
                    role: metadata.role || role,
                    name: metadata.full_name || metadata.name || data.user.email.split('@')[0]
                };
                localStorage.setItem('sms_user', JSON.stringify(this.currentUser));
                return true;
            }
            if (error) {
                console.error("Supabase Auth Error:", error.message);
                throw error;
            }
        }

        return false;
    },

    logout: async function () {
        if (window.dashboard.supabase) {
            await window.dashboard.supabase.auth.signOut();
        }
        this.currentUser = null;
        localStorage.removeItem('sms_user');
        window.location.reload();
    },

    showDashboard: function () {
        if (!this.currentUser) return;

        // Hide Landing & Modal
        if (document.getElementById('landingSection')) document.getElementById('landingSection').classList.add('hidden');
        if (document.getElementById('loginModal')) {
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('loginModal').classList.remove('flex');
        }

        // Show App Shell
        const appShell = document.getElementById('appShell');
        if (appShell) appShell.classList.remove('hidden');

        document.body.classList.remove('overflow-hidden');

        // Populate and Init
        populateUserInfo(this.currentUser);
        window.dashboard.init();

        // Ensure hash is set if we are on root or home
        if (!window.location.hash || window.location.hash === '#home' || window.location.hash === '#') {
            window.location.hash = '#overview';
        }
    },

    checkSession: function () {
        // We ALWAYS show the landing page first as per user request
        if (document.getElementById('landingSection')) document.getElementById('landingSection').classList.remove('hidden');
        if (document.getElementById('appShell')) document.getElementById('appShell').classList.add('hidden');
        
        // ONLY show dashboard if there is a specific dashboard hash (e.g. from a deep link/refresh)
        const hash = window.location.hash.substring(1);
        const dashboardPages = ['overview', 'students', 'staff', 'fees', 'exams', 'attendance_all', 'ai_insights', 'communication', 'reports', 'settings', 'my_classes', 'mark_attendance', 'exam_marks', 'manage_quizzes', 'homework', 'staff_notices', 'parent_attendance', 'parent_homework', 'parent_fees', 'parent_results', 'parent_leave', 'parent_notices', 'subjects', 'leave_approvals'];
        
        if (this.currentUser && dashboardPages.includes(hash)) {
            this.showDashboard();
        }
    },

    showForgotPass: function () {
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('forgotModal').classList.remove('hidden');
    },

    handleForgotSubmit: async function (e) {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const submitBtn = document.querySelector('#forgotModal button[type="submit"]');
        const originalText = submitBtn.innerText;

        submitBtn.disabled = true;
        submitBtn.innerText = "Sending Link...";

        try {
            const supabase = window.dashboard.supabase;
            if (!supabase) window.dashboard.initSupabase();

            if (window.dashboard.supabase) {
                const { error } = await window.dashboard.supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/#settings',
                });

                if (error) throw error;
                
                showToast(`Reset link successfully sent to ${email}`, 'success');
                document.getElementById('forgotModal').classList.add('hidden');
                document.getElementById('loginModal').classList.remove('hidden');
            } else {
                throw new Error("Auth service unavailable");
            }
        } catch (err) {
            console.error("Forgot Pass Error:", err);
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    },

    signUp: async function (name, email, password, role = 'parent') {
        try {
            const supabase = window.dashboard.supabase;
            if (!supabase) window.dashboard.initSupabase();

            if (window.dashboard.supabase) {
                const { data, error } = await window.dashboard.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: name,
                            role: role
                        }
                    }
                });

                if (error) throw error;

                if (data?.user?.identities?.length === 0) {
                    showToast("User already exists. Please login.", 'warning');
                } else {
                    showToast(`Success! Verification email sent to: ${email}`, 'success');
                }
                return true;
            }
        } catch (err) {
            console.error("SignUp Error:", err);
            showToast(err.message, 'error');
            return false;
        }
    }
};

// UI Helpers
function populateUserInfo(user) {
    if (document.getElementById('userName')) document.getElementById('userName').innerText = user.name;
    if (document.getElementById('userRole')) document.getElementById('userRole').innerText = user.role;
    const avatar = document.getElementById('userAvatar');
    if (avatar) avatar.innerText = user.name.charAt(0);
}

// Initial session check
document.addEventListener('DOMContentLoaded', () => {
    try {
        auth.checkSession();
    } catch (err) {
        console.error("Session Check Failed:", err);
    }

    // Login Form Listener
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const isSignup = !document.getElementById('signupFields').classList.contains('hidden');
                const errorDiv = document.getElementById('loginError');

                const emailInput = document.getElementById('username');
                const passInput = document.getElementById('password');
                const email = emailInput.value.trim();
                const pass = passInput.value.trim();

                const roleSelect = document.getElementById('loginRole');
                const role = roleSelect ? roleSelect.value.toLowerCase().trim() : 'parent';

                if (isSignup) {
                    const name = document.getElementById('regName').value.trim();
                    if (!name || !email || !pass) {
                        showToast("Please fill all fields.", 'error');
                        return;
                    }
                    
                    const success = await auth.signUp(name, email, pass, role);
                    if (success) {
                        document.getElementById('signupFields').classList.add('hidden');
                        document.querySelector('#loginForm button[type="submit"]').innerText = "Sign In";
                        document.getElementById('toggleSignup').innerText = "Create New Account";
                    }
                    return;
                }

                try {
                    const success = await auth.login(email, pass, role);
                    if (success) {
                        errorDiv.classList.add('hidden');
                        auth.showDashboard();
                    } else {
                        errorDiv.classList.remove('hidden');
                        loginForm.classList.add('animate-shake');
                        setTimeout(() => loginForm.classList.remove('animate-shake'), 500);
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                }
            } catch (err) {
                console.error("Login Error:", err);
                alert("Login Error: " + err.message); // Visible feedback for user/debug
            }
        });
    }

    // Toggle Sidebar for mobile
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            const sb = document.getElementById('sidebar');
            if (sb) sb.classList.toggle('-translate-x-full');
        });
    }
});

// Export
window.auth = auth;
