const targetEmail = 'damini07.le@gmail.com';
const supabaseUrl = 'https://zpkjmfaqwjnkoppvrsrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2ptZmFxd2pua29wcHZyc3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA0MzMzMiwiZXhwIjoyMDgxNjE5MzMyfQ.o7hfaphdAeuNR-cXvSZ_XQVk1jV8hSBOxSMEb7Gds9s'; 

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

async function updateTableNulls(table, column) {
    console.log(`Updating NULL/empty values in ${table}.${column} to ${targetEmail}...`);
    // update where column is null
    const urlNull = `${supabaseUrl}/rest/v1/${table}?${column}=is.null`;
    // update where column is empty string
    const urlEmpty = `${supabaseUrl}/rest/v1/${table}?${column}=eq.`;

    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    try {
        const responseNull = await fetchWithRetry(urlNull, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ [column]: targetEmail })
        });
        const dataNull = await responseNull.json();
        console.log(` -> Successfully updated ${dataNull.length} NULL records in ${table}.${column}`);
    } catch (err) {
        console.error(` -> Failed to update NULLs in ${table}.${column}: ${err.message}`);
    }

    try {
        const responseEmpty = await fetchWithRetry(urlEmpty, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ [column]: targetEmail })
        });
        const dataEmpty = await responseEmpty.json();
        console.log(` -> Successfully updated ${dataEmpty.length} empty string records in ${table}.${column}`);
    } catch (err) {
        console.error(` -> Failed to update empty strings in ${table}.${column}: ${err.message}`);
    }
}

async function runUpdate() {
    console.log("Starting DB email update for NULLs/Empty strings via REST...");
    const updates = [
        { table: 'profiles', column: 'email' },
        { table: 'students', column: 'parent_email' },
        { table: 'students', column: 'email' },
        { table: 'staff', column: 'email' },
        { table: 'admissions', column: 'parent_email' },
        { table: 'admissions', column: 'email' }
    ];

    for (const u of updates) {
        await updateTableNulls(u.table, u.column);
    }
    console.log("Database update for NULLs complete.");
}

runUpdate();
