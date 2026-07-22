/* global supabase */
(() => {
  const config = window.PRAYER_WALL_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey);
  const client = configured
    ? supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
    : null;

  function requireClient() {
    if (!client) throw new Error('Supabase is not configured. Add credentials to config.js.');
    return client;
  }

  async function listPosts({ includeAll = false } = {}) {
    let query = requireClient()
      .from('posts')
      .select('id,type,body,display_name,status,prayed_count,report_count,tag_id,moderation_reason,moderation_source,moderation_severity,moderation_matches,created_at,expires_at,updated_at')
      .order('created_at', { ascending: false });

    if (!includeAll) query = query.eq('status', 'active').gt('expires_at', new Date().toISOString());
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getStats() {
    const { data, error } = await requireClient().rpc('get_prayer_stats');
    if (error) throw error;
    return data || { today: 0, week: 0, month: 0, year: 0, lifetime: 0 };
  }

  async function createPost(post) {
    const { data, error } = await requireClient().rpc('submit_post', {
      submission_type: post.type,
      submission_body: post.body,
      submission_display_name: post.display_name || null,
      submission_tag_id: post.tag_id || null
    });
    if (error) throw error;
    return data;
  }

  async function recordPrayer(postId, tagId) {
    const { data, error } = await requireClient().rpc('record_prayer', {
      target_post_id: postId,
      source_tag_id: tagId || null
    });
    if (error) throw error;
    return data;
  }

  async function reportPost(postId, tagId, reporterToken) {
    const { data, error } = await requireClient().rpc('report_post', {
      target_post_id: postId,
      source_tag_id: tagId || null,
      source_reporter_token: reporterToken || null
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function updatePost(id, changes) {
    const { data, error } = await requireClient()
      .from('posts')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deletePost(id) {
  const { error } = await requireClient()
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

  window.PrayerWallDB = {
    configured,
    listPosts,
    getStats,
    createPost,
    recordPrayer,
    reportPost,
    signIn,
    signOut,
    getSession,
    updatePost
    deletePost
  };
})();
