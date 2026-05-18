const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://xfbzaslkmtyrdqrdmhyh.supabase.co',
  'sb_publishable_9tXWlF8tRwnJw3RVUCP71w_5cgn11YV'
);

async function test() {
  const { data, error } = await supabase.from('homes').select('*').limit(1);
  console.log("HOMES ROW:", data, error);
}
test();
