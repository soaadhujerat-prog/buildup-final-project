// =============================================================================
// BuildUp – Rejected-registration support: pure row -> UI mappers
// =============================================================================
// Kept in a DEPENDENCY-FREE module (no supabaseClient / react-native import) so
// the projection onto the shared `SupportTicket` shape is unit-testable in
// isolation. `supportService.ts` re-exports these.
// =============================================================================

import type {
  SupportMessageSenderRole,
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketType,
} from '../types';

export interface RegTicketRow {
  id: string;
  registration_id: string;
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

export interface RegMessageRow {
  id: string;
  ticket_id: string;
  sender_is_admin: boolean;
  sender_id: string | null;
  message: string;
  status_change: SupportTicketStatus | null;
  created_at: string;
}

export const REG_TICKET_SELECT =
  'id, registration_id, type, subject, description, status, assigned_admin_id, resolved_at, is_closed, closed_at, closed_by, created_at, updated_at';

/** Pure. Applicant messages map to the registrant's role; admin messages to
 *  'admin'. `sender_id` is null for the applicant (no profile). */
export const mapRegMessage = (
  r: RegMessageRow,
  requesterRole: SupportMessageSenderRole
): SupportTicketMessage => ({
  id: r.id,
  ticketId: r.ticket_id,
  senderId: r.sender_id ?? '',
  senderRole: r.sender_is_admin ? 'admin' : requesterRole,
  message: r.message,
  createdAt: r.created_at,
  ...(r.status_change ? { statusChange: r.status_change } : {}),
});

/** Pure. Maps a registration_support_tickets row (+ its thread) to the shared
 *  `SupportTicket` UI shape, tagged `source: 'registration'`. */
export const mapRegTicket = (
  r: RegTicketRow,
  messages: SupportTicketMessage[]
): SupportTicket => {
  const adminMsgs = messages.filter((m) => m.senderRole === 'admin');
  return {
    id: r.id,
    // No profile behind this ticket — use the registration id as the stable
    // identifier. Admin screens that call getUserById() on it simply find
    // nothing and fall back gracefully.
    userId: r.registration_id,
    // The rejected applicant registered AS a worker or contractor; the Support
    // display bucket only distinguishes admin vs non-admin, so a safe default
    // keeps the thread rendering. (The exact trade is not shown for a
    // rejected-registration ticket.)
    userRole: 'worker',
    type: r.type,
    subject: r.subject,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    assignedAdminId: r.assigned_admin_id ?? undefined,
    adminResponse:
      adminMsgs.length > 0 ? adminMsgs[adminMsgs.length - 1].message : undefined,
    resolvedAt: r.resolved_at ?? undefined,
    messages,
    isClosed: r.is_closed,
    closedAt: r.closed_at ?? undefined,
    closedBy: r.closed_by ?? undefined,
    source: 'registration',
    registrationId: r.registration_id,
  };
};
