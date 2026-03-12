/**
 * CONCURRENT Seed Script: 10 Students per Class
 * Creates auth users concurrently (in parallel batches of 5) for speed.
 * Then inserts profiles and student records in a single batch.
 */

const supabaseUrl = 'https://zpkjmfaqwjnkoppvrsrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2ptZmFxd2pua29wcHZyc3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA0MzMzMiwiZXhwIjoyMDgxNjE5MzMyfQ.o7hfaphdAeuNR-cXvSZ_XQVk1jV8hSBOxSMEb7Gds9s';

const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

async function db(table, method = 'GET', body, query = '') {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
        method, headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    if (!res.ok) return { error: text, status: res.status };
    try { return { data: JSON.parse(text) }; } catch { return { data: text }; }
}

async function createAuthUser(email, password = 'Pucho@123') {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: 'student' } })
    });
    const data = await res.json();
    if (!res.ok) {
        // If user already exists, fetch their ID
        if (JSON.stringify(data).includes('already registered') || JSON.stringify(data).includes('exists')) {
            const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            });
            const listData = await listRes.json();
            const users = listData.users || [];
            const existing = users.find(u => u.email === email);
            if (existing) return existing;
        }
        return null;
    }
    return data;
}

// Student data (10 unique names)
const studentData = [
    { first: 'Aarav', last: 'Sharma', parentFirst: 'Rajesh', gender: 'Male' },
    { first: 'Ishani', last: 'Das', parentFirst: 'Sunita', gender: 'Female' },
    { first: 'Aryan', last: 'Verma', parentFirst: 'Vikram', gender: 'Male' },
    { first: 'Anaya', last: 'Khan', parentFirst: 'Priya', gender: 'Female' },
    { first: 'Kabir', last: 'Singh', parentFirst: 'Amit', gender: 'Male' },
    { first: 'Diya', last: 'Patel', parentFirst: 'Neha', gender: 'Female' },
    { first: 'Rohan', last: 'Reddy', parentFirst: 'Suresh', gender: 'Male' },
    { first: 'Sana', last: 'Gupta', parentFirst: 'Anita', gender: 'Female' },
    { first: 'Reyansh', last: 'Joshi', parentFirst: 'Ramesh', gender: 'Male' },
    { first: 'Meera', last: 'Nair', parentFirst: 'Kavita', gender: 'Female' }
];

function randPhone() {
    return `9${Math.floor(Math.random() * 899999999 + 100000000)}`;
}

async function seedClass(className, sectionId) {
    const classCode = className.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const classNum = className === 'LKG' ? 0 : className === 'UKG' ? 1 : parseInt(className.replace('Grade ', '')) || 5;
    const birthYear = 2025 - 4 - classNum;

    // Create auth users CONCURRENTLY (all 10 at once for this class)
    const authTasks = studentData.map((s, i) => {
        const email = `${s.first.toLowerCase()}.${s.last.toLowerCase()}.${classCode}@pucho.edu`;
        return createAuthUser(email);
    });

    const authResults = await Promise.all(authTasks);

    // Now build profile + student batch inserts
    const profiles = [];
    const studentRows = [];

    for (let i = 0; i < 10; i++) {
        const s = studentData[i];
        const authUser = authResults[i];

        if (!authUser || !authUser.id) continue;

        const parentEmail = `${s.parentFirst.toLowerCase()}.${s.last.toLowerCase()}.${classCode}@pucho.edu`;
        const parentPhone = randPhone();
        const month = String((i % 12) + 1).padStart(2, '0');
        const day = String((i * 3 % 28) + 1).padStart(2, '0');

        profiles.push({
            id: authUser.id,
            full_name: `${s.first} ${s.last}`,
            role: 'student',
            phone: randPhone()
        });

        studentRows.push({
            id: authUser.id,
            admission_no: `ADM-${classCode.toUpperCase()}-${i + 1}`,
            roll_no: i + 1,
            section_id: sectionId,
            status: 'Active',
            gender: s.gender,
            dob: `${birthYear}-${month}-${day}`,
            guardian_name: `${s.parentFirst} ${s.last}`,
            parent_email: parentEmail,
            parent_phone: parentPhone
        });
    }

    // Batch insert profiles (ignore duplicates)
    if (profiles.length > 0) {
        const pRes = await db('profiles', 'POST', profiles);
        if (pRes.error && !pRes.error.includes('23505')) {
            // Individual insert fallback
            for (const p of profiles) {
                const r = await db('profiles', 'POST', p);
                if (r.error && !r.error.includes('23505')) {
                    await db('profiles', 'PATCH', p, `?id=eq.${p.id}`);
                }
            }
        }
    }

    // Batch insert students (ignore duplicates, try without guardian_name if column missing)
    if (studentRows.length > 0) {
        let sRes = await db('students', 'POST', studentRows);
        if (sRes.error && sRes.error.includes('guardian_name')) {
            // Column doesn't exist — remove it
            const fallback = studentRows.map(r => { const f = { ...r }; delete f.guardian_name; return f; });
            sRes = await db('students', 'POST', fallback);
        }
        if (sRes.error && !sRes.error.includes('23505')) {
            // Individual insert fallback
            for (const row of studentRows) {
                const r = await db('students', 'POST', row);
                if (r.error && r.error.includes('guardian_name')) {
                    const f = { ...row }; delete f.guardian_name;
                    await db('students', 'POST', f);
                } else if (r.error && !r.error.includes('23505')) {
                    // Try update
                    await db('students', 'PATCH', {
                        parent_email: row.parent_email, parent_phone: row.parent_phone, roll_no: row.roll_no
                    }, `?id=eq.${row.id}`);
                }
            }
        }
    }

    const successCount = profiles.filter(Boolean).length;
    console.log(`  ✅ ${className}: ${authResults.filter(Boolean).length}/10 auth users, ${successCount} records ready`);
    return authResults.filter(Boolean).length;
}

async function seed() {
    console.log('\n🚀 CONCURRENT Student Seeder — 10 per class\n');

    // Fetch sections
    const sectionRes = await db('sections', 'GET', null, '?select=id,name,classes(name)');
    if (sectionRes.error || !sectionRes.data || !sectionRes.data.length) {
        console.error('❌ No sections found! Run master_seed.js first.'); return;
    }

    // Find first section per class
    const classSectionMap = new Map();
    for (const s of sectionRes.data) {
        if (!s.classes) continue;
        const cn = s.classes.name;
        if (!classSectionMap.has(cn)) classSectionMap.set(cn, s.id);
    }

    const classList = [...classSectionMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    console.log(`📚 Processing ${classList.length} classes:\n`);

    let totalStudents = 0;

    // Process classes in groups of 3 for controlled concurrency
    for (let i = 0; i < classList.length; i += 3) {
        const batch = classList.slice(i, i + 3);
        const results = await Promise.all(
            batch.map(([className, sectionId]) => seedClass(className, sectionId))
        );
        totalStudents += results.reduce((sum, n) => sum + n, 0);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✨ SEEDING COMPLETE! Auth users created: ${totalStudents}`);
    console.log('='.repeat(60));

    const verify = await db('students', 'GET', null, '?select=id');
    console.log(`\n📊 Total students in DB: ${verify.data ? verify.data.length : 'error'}\n`);
}

seed();
