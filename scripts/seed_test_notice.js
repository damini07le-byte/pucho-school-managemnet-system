
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedNotice() {
    const notice = {
        title: "Experimental Notice with Image",
        content: "This notice contains an embedded image for verification purposes.\n\n[[IMG:https://pucho.ai/wp-content/uploads/2024/09/pucho-logo.png]]",
        target: "Parent",
        date: new Date().toISOString().split('T')[0]
    };

    console.log("Seeding notice...");
    const { data, error } = await supabase.from('notices').insert([notice]).select();

    if (error) {
        console.error("Error seeding notice:", error);
    } else {
        console.log("Notice seeded successfully:", data);
        console.log("Triggering manual webhook simulation...");
        
        // Simulate webhook call to Pucho Studio to ensure payload is correct
        const webhookUrl = 'https://studio.pucho.ai/api/v1/webhooks/5CznwQbSkKQThvK62x5g9';
        const payload = {
            action: 'NOTICE_PUBLISHED',
            notice: {
                title: notice.title,
                description: notice.content,
                target: notice.target,
                date: notice.date,
                image_url: notice.image_url
            },
            recipients: [],
            timestamp: new Date().toISOString()
        };

        try {
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("Webhook Response Status:", res.status);
        } catch (whErr) {
            console.error("Webhook Error:", whErr);
        }
    }
}

seedNotice();
