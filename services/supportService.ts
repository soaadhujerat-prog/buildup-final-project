// =============================================================================
// BuildUp – Support service (real backend READ + write layer)
// =============================================================================
// Support tickets are a private 1:many thread: one `support_tickets` row + an
// append-only `support_ticket_messages` conversation (migration 007).
//
// SELECT surface (RLS 008, untouched by 042): a ticket and its messages are
// visible to the ticket owner OR public.is_admin(). So one plain SELECT per
// table, RLS-scoped by the DB, gives:
//   • worker / contractor -> only their own tickets + messages
//   • admin               -> every ticket + message
//
// WRITE surface (042): the client has NO insert/update/delete on either table.
// Every write goes through a narrow SECURITY DEFINER RPC that derives the caller
// from auth.uid(), forces the trusted columns, validates text and raises the
// in-app notification in the same transaction:
//   • create_support_ticket(type, subject, description)          -> support_tickets
//   • reply_to_support_ticket(ticket_id, message, status?)       -> support_ticket_messages
//       status honoured for an admin only (open|in_progress|resolved)
//   • set_support_ticket_closed(ticket_id, closed)               -> support_tickets  (admin only)
//
// No realtime channel here (Support is not live chat): AppContext re-reads via
// refreshSupportTickets() after every write and when a support notification
// arrives.
// =============================================================================

import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketType,
  SupportMessageSenderRole,
} from '../types';

import { getSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// row shapes
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  user_id: string;
  user_role: 'worker' | 'contractor';
  type: SupportTicketType;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  assigned_admin_id: string | null;
  resolved_at: string | null;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: SupportMessageSenderRole;
  message: string;
  status_change: SupportTicketStatus | null;
  created_at: string;
}

const mapMessage = (r: MessageRow): SupportTicketMessage => ({
  id: r.id,
  ticketId: r.ticket_id,
  senderId: r.sender_id,
  senderRole: r.sender_role,
  message: r.message,
  createdAt: r.created_at,
  ...(r.status_change ? { statusChange: r.status_change } : {}),
});

const mapTicket = (
  r: TicketRow,
  messages: SupportTicketMessage[]
): SupportTicket => {
  const adminMsgs = messages.filter((m) => m.senderRole === 'admin');
  return {
    id: r.id,
    userId: r.user_id,
    userRole: r.user_role,
    type: r.type,
    subject: r.subject,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    assignedAdminId: r.assigned_admin_id ?? undefined,
    // Legacy mirror only — the thread in `messages` is the source of truth.
    adminResponse:
      adminMsgs.length > 0 ? adminMsgs[adminMsgs.length - 1].message : undefined,
    resolvedAt: r.resolved_at ?? undefined,
    messages,
    isClosed: r.is_closed,
    closedAt: r.closed_at ?? undefined,
    closedBy: r.closed_by ?? undefined,
  };
};

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

/**
 * Every support ticket the signed-in user may see, newest-updated first, each
 * with its full `messages` thread (oldest first). RLS scopes the rows: a
 * worker / contractor gets only their own; an admin gets all.
 */
export async function listMyTickets(): Promise<SupportTicket[]> {
  const sb = getSupabase();

  const [{ data: tRows, error: tErr }, { data: mRows, error: mErr }] =
    await Promise.all([
      sb
        .from('support_tickets')
        .select(
          'id, user_id, user_role, type, subject, description, status, assigned_admin_id, resolved_at, is_closed, closed_at, closed_by, created_at, updated_at'
        )
        .order('updated_at', { ascending: false }),
      sb
        .from('support_ticket_messages')
        .select(
          'id, ticket_id, sender_id, sender_role, message, status_change, created_at'
        )
        .order('created_at', { ascending: true }),
    ]);

  if (tErr) throw tErr;
  if (mErr) throw mErr;

  const byTicket = new Map<string, SupportTicketMessage[]>();
  for (const row of (mRows as MessageRow[] | null) ?? []) {
    const list = byTicket.get(row.ticket_id) ?? [];
    list.push(mapMessage(row));
    byTicket.set(row.ticket_id, list);
  }

  return ((tRows as TicketRow[] | null) ?? []).map((r) =>
    mapTicket(r, byTicket.get(r.id) ?? [])
  );
}

// ---------------------------------------------------------------------------
// write (all via SECURITY DEFINER RPCs — server derives the caller)
// ---------------------------------------------------------------------------

/** Open a ticket for the signed-in worker / contractor. `user_id`, `user_role`,
 *  `status` and timestamps are all set server-side. Returns the new ticket id. */
export async function createTicket(
  type: SupportTicketType,
  subject: string,
  description: string
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_support_ticket', {
    p_type: type,
    p_subject: subject,
    p_description: description,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as TicketRow | null;
  if (!row?.id) throw new Error('create_support_ticket returned no row');
  return row.id;
}

/** Append one message to a ticket's thread. `status` is honoured only when the
 *  caller is an admin (open | in_progress | resolved); the requester path
 *  ignores it server-side. */
export async function replyToTicket(
  ticketId: string,
  message: string,
  status?: SupportTicketStatus
): Promise<void> {
  const { error } = await getSupabase().rpc('reply_to_support_ticket', {
    p_ticket_id: ticketId,
    p_message: message,
    p_status: status ?? null,
  });
  if (error) throw error;
}

/** Admin-only: close or reopen a ticket's conversation. Idempotent server-side
 *  (a call that does not change `is_closed` is a no-op with no notification). */
export async function setTicketClosed(
  ticketId: string,
  closed: boolean
): Promise<void> {
  const { error } = await getSupabase().rpc('set_support_ticket_closed', {
    p_ticket_id: ticketId,
    p_closed: closed,
  });
  if (error) throw error;
}
