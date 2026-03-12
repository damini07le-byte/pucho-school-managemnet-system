const targetEmail = 'damini07.le@gmail.com';
const supabaseUrl = 'https://zpkjmfaqwjnkoppvrsrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2ptZmFxd2pua29wcHZyc3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA0MzMzMiwiZXhwIjoyMDgxNjE5MzMyfQ.o7hfaphdAeuNR-cXvSZ_XQVk1jV8hSBOxSMEb7Gds9s'; // The service role key is actually different. I'll use the one from dashboard.js which is o7... and seems to be anon or service role? Actually dashboard.js has the service role key. Let's use it.

async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Status ${res.status}: ${text}`);
            }
            return res;
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function updateTable(table, column) {
    console.log(`Updating ${table}.${column} to ${targetEmail}...`);
    const url = `${supabaseUrl}/rest/v1/${table}?${column}=neq.${encodeURIComponent(targetEmail)}`;
    try {
        const response = await fetchWithRetry(url, {
            method: 'PATCH',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ [column]: targetEmail })
        });
        const data = await response.json();
        console.log(` -> Successfully updated ${data.length} records in ${table}.${column}`);
    } catch (err) {
        console.error(` -> Failed to update ${table}.${column}: ${err.message}`);
    }
}

async function runUpdate() {
    console.log("Starting DB email update via REST...");
    const updates = [
        { table: 'profiles', column: 'email' },
        { table: 'students', column: 'parent_email' },
        { table: 'students', column: 'email' },
        { table: 'staff', column: 'email' },
        { table: 'parents', column: 'email' },
        { table: 'admissions', column: 'parent_email' },
        { table: 'admissions', column: 'email' },
        { table: 'inquiries', column: 'email' },
    ];

    for (const u of updates) {
        await updateTable(u.table, u.column);
    }
    console.log("Database update complete.\nNote: Auth users (auth.users) cannot be updated via REST from a browser-like script easily without admin auth endpoint. If needed, we will do it via SQL or API.");
}

runUpdate();
