-- =============================================================================
-- 006 · chat (conversations, participants, messages)
-- =============================================================================
-- Exactly three tables, no participant_a / participant_b columns
-- (review decision #5). A 1:1 conversation carries a deterministic `pair_key`
-- (sorted pair of profile ids) with a UNIQUE index so a pair can never end up
-- with two threads. Group threads leave pair_key NULL.
-- Unread is derived from conversation_participants.last_read_at — there is no
-- unread_count column. Realtime (Phase 8) reads this same model.
-- =============================================================================

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  is_group        boolean not null default false,
  pair_key        text,
  last_message    text not null default '',
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index conversations_pair_key_uniq
  on public.conversations (pair_key) where pair_key is not null;

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
-- drives each user's inbox listing
create index conversation_participants_profile_idx
  on public.conversation_participants (profile_id, conversation_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null,
  created_at      timestamptz not null default now()
);
-- thread load + pagination
create index messages_conversation_idx
  on public.messages (conversation_id, created_at);
