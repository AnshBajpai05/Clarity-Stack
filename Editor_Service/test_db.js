require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY);

async function test() {
    console.log("Checking fetching logs from a9fa4326...");
    const { data: fetch1, error: err1 } = await supabase
        .from('activity_logs')
        .select('id, action, content_preview, cursor_position, created_at, user_id, users:auth.users!user_id (email)')
        .eq('workspace_id', 'a9fa4326');
        
    console.log("Fetch Error schema 1:", err1 || "No error");
    console.log("Fetch Data schema 1:", fetch1);

    console.log("Checking fetching logs via fallback...");
    const { data: fetch2, error: err2 } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('workspace_id', 'a9fa4326');

    console.log("Fetch Error schema 2:", err2 || "No error");
    console.log("Fetch Data schema 2:", fetch2);
}

test();
