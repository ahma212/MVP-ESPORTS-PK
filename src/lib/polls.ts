import { supabase, isSupabaseConfigured } from './supabase';
import { Poll, PollOption, PollVote, PollVoter } from '../types';

export async function fetchActivePolls(): Promise<Poll[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    // 1. Fetch active polls
    const { data: pollsData, error: pollsErr } = await supabase
      .from('polls')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (pollsErr || !pollsData || pollsData.length === 0) return [];

    const pollIds = pollsData.map((p: any) => p.id);

    // 2. Fetch options
    const { data: optionsData } = await supabase
      .from('poll_options')
      .select('*')
      .in('poll_id', pollIds)
      .order('sort_order', { ascending: true });

    // 3. Fetch votes
    const { data: votesData } = await supabase
      .from('poll_votes')
      .select('*')
      .in('poll_id', pollIds);

    // 4. Fetch profiles for voters
    const userIds = Array.from(new Set((votesData || []).map((v: any) => v.user_id).filter(Boolean)));
    let profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url')
        .in('id', userIds);

      if (profilesData) {
        profilesData.forEach((p: any) => profileMap.set(p.id, p));
      }
    }

    // Assemble polls
    return pollsData.map((p: any) => {
      const pollOptions: PollOption[] = (optionsData || [])
        .filter((o: any) => o.poll_id === p.id)
        .map((o: any) => ({
          id: o.id,
          poll_id: o.poll_id,
          option_text: o.option_text || o.text || '',
          sort_order: o.sort_order ?? 0
        }));

      const pollVotes: PollVote[] = (votesData || [])
        .filter((v: any) => v.poll_id === p.id)
        .map((v: any) => ({
          id: v.id,
          poll_id: v.poll_id,
          option_id: v.option_id,
          user_id: v.user_id,
          created_at: v.created_at
        }));

      const voters: PollVoter[] = pollVotes.map((v) => {
        const prof = profileMap.get(v.user_id);
        const opt = pollOptions.find((o) => o.id === v.option_id);
        return {
          user_id: v.user_id,
          username: prof?.username || prof?.name || 'Player',
          name: prof?.name || prof?.username || 'Player',
          avatar_url: prof?.avatar_url,
          option_id: v.option_id,
          option_text: opt?.option_text || ''
        };
      });

      return {
        id: p.id,
        question: p.question,
        is_active: p.is_active,
        created_by: p.created_by,
        created_at: p.created_at,
        options: pollOptions,
        votes: pollVotes,
        voters,
        total_votes: pollVotes.length
      };
    });
  } catch (err) {
    console.error('Error fetching active polls:', err);
    return [];
  }
}

export async function fetchAllPollsAdmin(): Promise<Poll[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    const { data: pollsData, error: pollsErr } = await supabase
      .from('polls')
      .select('*')
      .order('created_at', { ascending: false });

    if (pollsErr || !pollsData || pollsData.length === 0) return [];

    const pollIds = pollsData.map((p: any) => p.id);

    const { data: optionsData } = await supabase
      .from('poll_options')
      .select('*')
      .in('poll_id', pollIds)
      .order('sort_order', { ascending: true });

    const { data: votesData } = await supabase
      .from('poll_votes')
      .select('*')
      .in('poll_id', pollIds);

    const userIds = Array.from(new Set((votesData || []).map((v: any) => v.user_id).filter(Boolean)));
    let profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url')
        .in('id', userIds);

      if (profilesData) {
        profilesData.forEach((p: any) => profileMap.set(p.id, p));
      }
    }

    return pollsData.map((p: any) => {
      const pollOptions: PollOption[] = (optionsData || [])
        .filter((o: any) => o.poll_id === p.id)
        .map((o: any) => ({
          id: o.id,
          poll_id: o.poll_id,
          option_text: o.option_text || o.text || '',
          sort_order: o.sort_order ?? 0
        }));

      const pollVotes: PollVote[] = (votesData || [])
        .filter((v: any) => v.poll_id === p.id)
        .map((v: any) => ({
          id: v.id,
          poll_id: v.poll_id,
          option_id: v.option_id,
          user_id: v.user_id,
          created_at: v.created_at
        }));

      const voters: PollVoter[] = pollVotes.map((v) => {
        const prof = profileMap.get(v.user_id);
        const opt = pollOptions.find((o) => o.id === v.option_id);
        return {
          user_id: v.user_id,
          username: prof?.username || prof?.name || 'Player',
          name: prof?.name || prof?.username || 'Player',
          avatar_url: prof?.avatar_url,
          option_id: v.option_id,
          option_text: opt?.option_text || ''
        };
      });

      return {
        id: p.id,
        question: p.question,
        is_active: p.is_active,
        created_by: p.created_by,
        created_at: p.created_at,
        options: pollOptions,
        votes: pollVotes,
        voters,
        total_votes: pollVotes.length
      };
    });
  } catch (err) {
    console.error('Error fetching all polls for admin:', err);
    return [];
  }
}

export async function createPoll(question: string, optionsText: string[], adminUserId?: string): Promise<Poll> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase client is not initialized');
  }

  const cleanQuestion = question.trim();
  const validOptions = optionsText.map(o => o.trim()).filter(Boolean);

  if (!cleanQuestion) {
    throw new Error('Poll question is required');
  }
  if (validOptions.length < 2) {
    throw new Error('At least 2 poll options are required');
  }
  if (validOptions.length > 6) {
    throw new Error('Maximum 6 poll options allowed');
  }

  // 1. Insert poll
  const { data: pollData, error: pollErr } = await supabase
    .from('polls')
    .insert([{
      question: cleanQuestion,
      is_active: true,
      created_by: adminUserId || null
    }])
    .select()
    .single();

  if (pollErr || !pollData) {
    console.error('Failed to insert poll into Supabase:', pollErr);
    throw new Error(pollErr?.message || 'Failed to create poll');
  }

  // 2. Insert poll options with sort_order
  const optionsPayload = validOptions.map((optText, index) => ({
    poll_id: pollData.id,
    option_text: optText,
    sort_order: index
  }));

  const { data: optionsData, error: optErr } = await supabase
    .from('poll_options')
    .insert(optionsPayload)
    .select();

  if (optErr) {
    console.error('Failed to insert poll options:', optErr);
    await supabase.from('polls').delete().eq('id', pollData.id);
    throw new Error(optErr.message || 'Failed to save poll options');
  }

  const pollOptions: PollOption[] = (optionsData || []).map((o: any) => ({
    id: o.id,
    poll_id: o.poll_id,
    option_text: o.option_text || o.text || '',
    sort_order: o.sort_order ?? 0
  }));

  return {
    id: pollData.id,
    question: pollData.question,
    is_active: pollData.is_active,
    created_by: pollData.created_by,
    created_at: pollData.created_at,
    options: pollOptions,
    votes: [],
    voters: [],
    total_votes: 0
  };
}

export async function deactivatePoll(pollId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase
    .from('polls')
    .update({ is_active: false })
    .eq('id', pollId);

  if (error) {
    console.error('Failed to deactivate poll:', error);
    throw new Error(error.message);
  }
}

export async function deletePoll(pollId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase client is not initialized');
  }

  console.log('[POLL DELETE] starting', pollId);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[POLL DELETE] auth session:', !!session, session?.user?.id);
  } catch (e) {
    console.log('[POLL DELETE] session check caught error:', e);
  }

  const { data, error } = await supabase
    .from('polls')
    .delete()
    .eq('id', pollId)
    .select();

  console.log('[POLL DELETE] Supabase response', {
    data,
    error
  });

  if (error) {
    console.error('[POLL DELETE] ERROR', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    throw new Error(`${error.message} (Code: ${error.code}) ${error.details || ''}`);
  }
}

export async function castPollVote(pollId: string, optionId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase client is not initialized');
  }

  // Check if user already voted on this poll
  const { data: existingVote, error: findErr } = await supabase
    .from('poll_votes')
    .select('id')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .maybeSingle();

  if (findErr) {
    console.warn('Error checking existing vote:', findErr);
  }

  if (existingVote) {
    // Update existing vote
    const { error: updateErr } = await supabase
      .from('poll_votes')
      .update({ option_id: optionId })
      .eq('id', existingVote.id);

    if (updateErr) {
      console.error('Failed to update vote:', updateErr);
      throw new Error(updateErr.message);
    }
  } else {
    // Insert new vote
    const { error: insertErr } = await supabase
      .from('poll_votes')
      .insert([{
        poll_id: pollId,
        option_id: optionId,
        user_id: userId,
        created_at: new Date().toISOString()
      }]);

    if (insertErr) {
      console.error('Failed to insert vote:', insertErr);
      throw new Error(insertErr.message);
    }
  }
}
