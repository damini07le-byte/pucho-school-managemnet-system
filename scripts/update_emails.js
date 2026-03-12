import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zpkjmfaqwjnkoppvrsrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2ptZmFxd2pua29wcHZyc3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA0MzMzMiwiZXhwIjoyMDgxNjE5MzMyfQ.zUjQ_u7yS8iN3Lh5J-Qv5R83i_2E3p9tX654n2X66_Y';
const supabase = createClient(supabaseUrl, supabaseKey);

const targetEmail = 'damii07.le#gmail.com'; 

async function updateEmails() {
    console.log(`Starting bulk email update to: ${targetEmail}`);

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

    for (const { table, column } of updates) {
        console.log(`Trying to update ${table}.${column}...`);
        try {
            const { data, error } = await supabase
                .from(table)
                .update({ [column]: targetEmail })
                .neq(column, targetEmail)
                .select('id');
            
            if (error) {
                // It's expected that some tables or columns might not exist
                console.log(`  -> Skipped or Error on ${table}.${column} (might not exist)`);
            } else {
                console.log(`  -> Successfully updated ${data.length} records in ${table}.${column}`);
            }
        } catch (e) {
            console.log(`  -> Exception on ${table}.${column}: ${e.message}`);
        }
    }

    // Now update auth.users via admin API
    console.log("Updating Auth Users...");
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
        console.error("Error listing users:", listErr);
    } else if (users && users.length > 0) {
        let updatedCount = 0;
        for (const user of users) {
             if (user.email !== targetEmail) {
                  // We might not be able to update to the same email for multiple users due to unique constraints
                  // But the user requested "sare database mai jaha bhi email id hai waha sab jagah damii07.le#gmail.com hey id add kr plzz"
                  // Warning: if auth.users has a unique constraint on email, this will fail for the second user.
                  console.log(`Attempting to update auth user: ${user.id} (${user.email}) -> ${targetEmail}`);
                  const { error: updateErr } = await supabase.auth.admin.updateUserById(
                      user.id,
                      { email: targetEmail }
                   );
                   if (updateErr) {
                       console.error(`  -> Failed to update auth user ${user.id}: ${updateErr.message}`);
                   } else {
                       updatedCount++;
                   }
             }
        }
        console.log(`  -> Updated ${updatedCount} auth users.`);
    }

    console.log("Finished bulk update.");
}

updateEmails();
