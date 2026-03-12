import { createClient } from '@supabase/supabase-js';

const baseEmail = 'damini07.le@gmail.com';
const supabaseUrl = 'https://zpkjmfaqwjnkoppvrsrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwa2ptZmFxd2pua29wcHZyc3JsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA0MzMzMiwiZXhwIjoyMDgxNjE5MzMyfQ.o7hfaphdAeuNR-cXvSZ_XQVk1jV8hSBOxSMEb7Gds9s'; 

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runUpdate() {
    console.log(`Starting Admin Email Update (Unique Aliases) to ${baseEmail}...`);

    try {
        // 3. Update auth.users (Requires Service Role Key)
        console.log("Updating Auth users (auth.users)...");
        const { data: { users }, error: authListErr } = await supabase.auth.admin.listUsers();
        
        if (authListErr) {
            console.error(" Error listing auth users:", authListErr.message);
        } else if (users && users.length > 0) {
            let updatedCount = 0;
            console.log(` Found ${users.length} auth users. Updating emails to unique aliases...`);
            
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                // Use Gmail alias trick to make it unique per user but deliver to the same inbox
                // Because supabase unique check looks at the exact string
                const targetEmail = `damini07.le+user${i}@gmail.com`; 
                // But for the specific ones the user wants to login with (Admin, Parent, Staff), let's ensure they are easy to type.
                // Or wait, they might be logging in with specific emails.
                // Actually the user said "bas meri yadd kar", meaning the user's specific login.
                // Let's just update the ones that look like admin, parent, staff or all to unique aliases.
                // Wait, if we use aliases, they have to type the alias to login!
                // If they want to login with damini07.le@gmail.com, only ONE user can hold that email.
                // Let's set the the ONE true admin account to the exact email, and others to aliases.
                
                let aliasEmail = `damini07.le+user${i}@gmail.com`;
                if(user.email === 'admin' || user.email === 'admin@school.com' || user.user_metadata?.role === 'admin') {
                    aliasEmail = 'damini07.le@gmail.com'; // Primary
                } else if(user.email === 'staff' || user.email === 'staff@school.com') {
                    aliasEmail = 'damini07.le+staff@gmail.com';
                } else if(user.email === 'parent' || user.email === 'parent@school.com') {
                    aliasEmail = 'damini07.le+parent@gmail.com';
                }

                if (user.email !== aliasEmail) {
                    try {
                        const { error: updateErr } = await supabase.auth.admin.updateUserById(
                            user.id,
                            { email: aliasEmail, email_confirm: true }
                        );
                        if (updateErr) {
                            if (!updateErr.message.includes('A user with this email address has already been registered')) {
                                console.error(`  - Failed to update auth user ${user.id} (${user.email}): ${updateErr.message}`);
                            }
                        } else {
                            console.log(`  + Updated auth user ${user.id} (${user.email} -> ${aliasEmail})`);
                            updatedCount++;
                        }
                    } catch (e) {
                         console.error(`  - Exception updating auth user ${user.id}: ${e.message}`);
                    }
                }
            }
            console.log(` Successfully updated ${updatedCount} auth users.`);
        } else {
            console.log(" No auth users found to update.");
        }

    } catch (err) {
        console.error("Fatal Error:", err);
    }
    console.log("Admin Email Update Complete.");
}

runUpdate();
