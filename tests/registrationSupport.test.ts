// =============================================================================
// Unit tests — services/supportService registration-support mappers (pure)
// =============================================================================
// Locks in how a rejected-registration support ticket (migration 052) is
// projected onto the SHARED `SupportTicket` UI shape:
//   • it is always tagged `source: 'registration'` + carries `registrationId`,
//     so AppContext routes admin reply / close / reopen to the 052 RPCs and
//     the shared screens can label it "רישום שנדחה";
//   • `userId` is the registration id (there is NO profile behind it);
//   • an admin message maps to senderRole 'admin'; an applicant message
//     (sender_is_admin = false, sender_id = null) maps to the registrant role.
// No credential / UUID / key appears in this file.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  mapRegTicket,
  mapRegMessage,
  type RegTicketRow,
  type RegMessageRow,
} from '../services/registrationSupportMappers';

const REG_ID = 'reg-1';

const ticketRow = (over: Partial<RegTicketRow> = {}): RegTicketRow => ({
  id: 't-1',
  registration_id: REG_ID,
  type: 'question',
  subject: 'why was I rejected',
  description: 'I believe this was a mistake, please review my documents again.',
  status: 'open',
  assigned_admin_id: null,
  resolved_at: null,
  is_closed: false,
  closed_at: null,
  closed_by: null,
  created_at: '2026-09-04T10:00:00.000Z',
  updated_at: '2026-09-04T10:00:00.000Z',
  ...over,
});

const msgRow = (over: Partial<RegMessageRow> = {}): RegMessageRow => ({
  id: 'm-1',
  ticket_id: 't-1',
  sender_is_admin: false,
  sender_id: null,
  message: 'any update?',
  status_change: null,
  created_at: '2026-09-04T11:00:00.000Z',
  ...over,
});

describe('supportService — registration-support mappers', () => {
  it('tags the ticket as a registration-source ticket', () => {
    const t = mapRegTicket(ticketRow(), []);
    expect(t.source).toBe('registration');
    expect(t.registrationId).toBe(REG_ID);
    // no profile behind it -> userId is the registration id
    expect(t.userId).toBe(REG_ID);
  });

  it('carries lifecycle + status fields through unchanged', () => {
    const t = mapRegTicket(
      ticketRow({
        status: 'resolved',
        is_closed: true,
        closed_at: '2026-09-04T12:00:00.000Z',
        closed_by: 'admin-x',
        resolved_at: '2026-09-04T11:30:00.000Z',
      }),
      []
    );
    expect(t.status).toBe('resolved');
    expect(t.isClosed).toBe(true);
    expect(t.closedAt).toBe('2026-09-04T12:00:00.000Z');
    expect(t.closedBy).toBe('admin-x');
    expect(t.resolvedAt).toBe('2026-09-04T11:30:00.000Z');
  });

  it('maps an applicant message to the registrant role, admin message to admin', () => {
    const applicant = mapRegMessage(msgRow(), 'worker');
    expect(applicant.senderRole).toBe('worker');
    expect(applicant.senderId).toBe(''); // sender_id is null for the applicant

    const admin = mapRegMessage(
      msgRow({ sender_is_admin: true, sender_id: 'admin-x', message: 'reviewing' }),
      'worker'
    );
    expect(admin.senderRole).toBe('admin');
    expect(admin.senderId).toBe('admin-x');
  });

  it('surfaces the latest admin reply on the legacy adminResponse mirror', () => {
    const msgs = [
      mapRegMessage(msgRow({ id: 'm-1' }), 'worker'),
      mapRegMessage(
        msgRow({ id: 'm-2', sender_is_admin: true, sender_id: 'a', message: 'first admin reply' }),
        'worker'
      ),
      mapRegMessage(
        msgRow({ id: 'm-3', sender_is_admin: true, sender_id: 'a', message: 'latest admin reply' }),
        'worker'
      ),
    ];
    const t = mapRegTicket(ticketRow(), msgs);
    expect(t.adminResponse).toBe('latest admin reply');
    expect(t.messages).toHaveLength(3);
  });

  it('propagates an admin status change onto the message', () => {
    const m = mapRegMessage(
      msgRow({ sender_is_admin: true, sender_id: 'a', status_change: 'in_progress' }),
      'contractor'
    );
    expect(m.statusChange).toBe('in_progress');
  });
});
