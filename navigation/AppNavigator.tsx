// =============================================================================
// BuildUp — Final App Navigator (Chunk 6)
// =============================================================================
// State-machine navigator (no react-navigation) covering:
// - Auth flow: Splash → Welcome → Login / SignUp / AdminLogin
// - Status flow: RegistrationPending / RegistrationRejected / BlockedAccount
// - 3 role main shells, each with bottom tabs + full drilldown stack
// - All shared screens (Messages/Chat/Notifications/Support*/Settings) wired
//   role-aware
// - Notification deep-linking by NotificationType + relatedId
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { clearAllScrollMemory } from '../utils/scrollMemory';
import {
  AppNotification,
} from '../types';
import { LoginResult } from '../context/AppContext';
import { findConversation } from '../services/conversationService';

type CustomerRole = 'contractor' | 'worker';

// Auth/status screens
import SplashScreen from '../screens/SplashScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import VerifyRecoveryCodeScreen from '../screens/VerifyRecoveryCodeScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import RegistrationPendingScreen from '../screens/RegistrationPendingScreen';
import RegistrationRejectedScreen from '../screens/RegistrationRejectedScreen';
import BlockedAccountScreen from '../screens/BlockedAccountScreen';

// Worker
import WorkerDashboard from '../screens/WorkerDashboard';
import AvailableJobsScreen from '../screens/AvailableJobsScreen';
import FavoriteContractorsScreen from '../screens/FavoriteContractorsScreen';
import MyApplicationsScreen from '../screens/MyApplicationsScreen';
import WorkerInvitationsScreen from '../screens/WorkerInvitationsScreen';
import MyAssignmentsScreen from '../screens/MyAssignmentsScreen';
import AvailabilityManagementScreen from '../screens/AvailabilityManagementScreen';
import WorkerProfessionalProfileScreen from '../screens/WorkerProfessionalProfileScreen';
import WorkerProfileEditScreen from '../screens/WorkerProfileEditScreen';

// Contractor
import ContractorDashboard from '../screens/ContractorDashboard';
import MyJobsScreen from '../screens/MyJobsScreen';
import PostJobScreen from '../screens/PostJobScreen';
import ApplicationsReceivedScreen from '../screens/ApplicationsReceivedScreen';
import SentInvitationsScreen from '../screens/SentInvitationsScreen';
import SearchWorkersScreen from '../screens/SearchWorkersScreen';
import FavoriteWorkersScreen from '../screens/FavoriteWorkersScreen';
import WorkerProfileScreen from '../screens/WorkerProfileScreen';
import SmartMatchScreen from '../screens/SmartMatchScreen';
import ContractorProfileScreen from '../screens/ContractorProfileScreen';
import ContractorProfileEditScreen from '../screens/ContractorProfileEditScreen';
import JobStaffingScreen from '../screens/JobStaffingScreen';

// Admin
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import PendingRegistrationsScreen from '../screens/PendingRegistrationsScreen';
import RegistrationDetailsScreen from '../screens/RegistrationDetailsScreen';
import UserManagementScreen from '../screens/UserManagementScreen';
import AdminUserDetailsScreen from '../screens/AdminUserDetailsScreen';
import AdminContractorJobsScreen from '../screens/AdminContractorJobsScreen';
import AdminLicenseAttentionScreen from '../screens/AdminLicenseAttentionScreen';

// Shared (role-aware)
import JobDetailsScreen from '../screens/JobDetailsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ChatScreen from '../screens/ChatScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SupportTicketsScreen from '../screens/SupportTicketsScreen';
import SupportTicketDetailsScreen from '../screens/SupportTicketDetailsScreen';
import OpenSupportTicketScreen from '../screens/OpenSupportTicketScreen';
import SettingsScreen from '../screens/SettingsScreen';

// =============================================================================
// Route shape — discriminated union of every screen the navigator knows
// =============================================================================

type Route =
  // Auth / status
  | { name: 'Splash' }
  | { name: 'Welcome' }
  | { name: 'Login'; role: CustomerRole }
  | { name: 'SignUp'; role: CustomerRole }
  | { name: 'AdminLogin' }
  | { name: 'ForgotPassword' }
  // Step 2 of CODE-based recovery: enter the one-time code emailed by
  // Supabase Auth. Pushed from ForgotPassword; on success the app flips
  // `passwordRecoveryActive` and the top-level gate shows ResetPassword.
  | { name: 'VerifyRecoveryCode'; email: string }
  // Shown by the `passwordRecoveryActive` gate once a recovery session is
  // live (after the code is verified). Also kept as a plain route for
  // completeness.
  | { name: 'ResetPassword' }
  | { name: 'RegistrationPending'; registrationId: string }
  | { name: 'RegistrationRejected'; registrationId: string }
  // Worker drilldowns (Tab is implicit via WorkerTab state)
  | { name: 'WorkerJobDetails'; jobId: string }
  | { name: 'WorkerFavoriteContractors' }
  | { name: 'WorkerInvitations' }
  | { name: 'WorkerMyAssignments' }
  | { name: 'WorkerAvailability' }
  | { name: 'WorkerProfileEdit' }
  // Contractor drilldowns
  | { name: 'ContractorPostJob'; jobId?: string }
  | { name: 'ContractorJobDetails'; jobId: string }
  | { name: 'ContractorSearchWorkers' }
  | { name: 'ContractorFavoriteWorkers' }
  | { name: 'ContractorWorkerProfile'; workerId: string }
  | { name: 'ContractorSmartMatch'; initialJobId?: string }
  | { name: 'ContractorSentInvitations' }
  | { name: 'ContractorJobStaffing'; jobId: string }
  | { name: 'ContractorProfileEdit' }
  // Admin drilldowns
  | { name: 'AdminRegistrationDetails'; registrationId: string }
  | { name: 'AdminUserDetails'; userId: string }
  | { name: 'AdminContractorJobs'; contractorId: string }
  | { name: 'AdminLicenseAttention' }
  // Shared (any role)
  | { name: 'Messages' }
  | { name: 'Chat'; conversationId: string }
  | { name: 'Notifications' }
  | { name: 'SupportTickets' }
  | { name: 'SupportTicketDetails'; ticketId: string }
  | { name: 'OpenSupportTicket' }
  | { name: 'Settings' };

type RoleHome =
  | { kind: 'worker' }
  | { kind: 'contractor' }
  | { kind: 'admin' };

// A blocked user never enters the route stack — the navigator's blocked guard
// short-circuits before it. This tiny state machine is the ONLY navigation
// available to them: the block screen itself, plus the shared support-ticket
// screens (reused as-is, never a parallel "blocked support" system).
type BlockedView =
  | { name: 'root' }
  | { name: 'tickets' }
  | { name: 'ticket'; ticketId: string }
  | { name: 'newTicket' };

// A password-verified user whose registration was REJECTED runs a CONFINED
// session (no profile, no currentUser). This state machine is the ONLY
// navigation available to them: the rejected screen itself, plus the shared
// support screens wired to the registration-support island (migration 052).
type RejectedView =
  | { name: 'root' }
  | { name: 'tickets' }
  | { name: 'ticket'; ticketId: string }
  | { name: 'newTicket' };

// Tabs per role — tab is just a string label tracking which dashboard pane shows
type WorkerTab =
  | 'dashboard'
  | 'available-jobs'
  | 'my-applications'
  | 'profile';
type ContractorTab =
  | 'dashboard'
  | 'my-jobs'
  | 'applications-received'
  | 'profile';
type AdminTab =
  | 'dashboard'
  | 'pending-registrations'
  | 'user-management'
  | 'support-tickets';

// =============================================================================
// Navigator
// =============================================================================

const AppNavigator: React.FC = () => {
  const {
    currentUser,
    sessionLoading,
    passwordRecoveryActive,
    beginPasswordRecovery,
    clearPasswordRecovery,
    logout,
    getOrCreateConversation,
    getJobById,
    getUserById,
    conversations,
    refreshConversations,
    supportTickets,
    registrations,
    rejectedRegistration,
    registrationSupportTickets,
    openRegistrationSupportTicket,
    replyToRegistrationSupportTicket,
  } = useApp();

  // History stack for the post-login drilldown area — the last entry is the
  // active screen; popping it (goBack) reveals whatever the user actually
  // came from instead of always bouncing to the tab root or a hardcoded
  // screen. Pre-login auth screens use `resetTo`, which behaves exactly like
  // the old single-value `setRoute` (always a 1-item stack), so that flow is
  // unchanged.
  const [routeStack, setRouteStack] = useState<Route[]>([]);
  const route = routeStack.length > 0 ? routeStack[routeStack.length - 1] : null;
  const [home, setHome] = useState<RoleHome | null>(null);
  const [workerTab, setWorkerTab] = useState<WorkerTab>('dashboard');
  const [contractorTab, setContractorTab] =
    useState<ContractorTab>('dashboard');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  // Which status tab "בקשות רישום" opens on — the navigator points this at
  // the tab that matches the last admin decision (approve → 'approved',
  // reject → 'rejected', undo → 'pending') so the just-processed request is
  // right there when the screen re-appears. No timeout hacks.
  const [adminRegStatus, setAdminRegStatus] = useState<
    'pending' | 'approved' | 'rejected'
  >('pending');
  // Sub-navigation for a blocked session (see BlockedView). Reset to 'root'
  // whenever the session user changes, so a stale ticket id never carries
  // over into a different person's blocked view.
  const [blockedView, setBlockedView] = useState<BlockedView>({ name: 'root' });
  // Sub-navigation for a confined rejected-registration session (see
  // RejectedView). Reset whenever the rejected registration changes.
  const [rejectedView, setRejectedView] = useState<RejectedView>({ name: 'root' });

  // ---- Route-stack helpers ----------------------------------------------------

  // Drill deeper — back will return to the screen we came from.
  const push = useCallback((r: Route) => {
    setRouteStack((prev) => [...prev, r]);
  }, []);

  // Replace the current screen (e.g. after a submit) — back skips the
  // now-irrelevant form/source screen and returns to whatever was before it.
  const replaceTop = useCallback((r: Route) => {
    setRouteStack((prev) => (prev.length > 0 ? [...prev.slice(0, -1), r] : [r]));
  }, []);

  // Pop one screen off the stack (real "back").
  const goBack = useCallback(() => {
    setRouteStack((prev) => prev.slice(0, -1));
  }, []);

  // Reset the whole stack — used for auth-flow transitions and for leaving a
  // drilldown back to the tab root (r === null).
  const resetTo = useCallback((r: Route | null) => {
    setRouteStack(r ? [r] : []);
  }, []);

  // Auth fallback: route into the correct shell ONLY when the session user
  // actually changes (login / logout / a different person). `currentUser` is a
  // fresh object on every profile mutation (updateWorkerProfile /
  // updateContractorProfile call setCurrentUser); reacting to those would
  // reset the drilldown stack and drop the user on the dashboard after a
  // simple profile save. Keying on role:id makes same-user updates a no-op,
  // so "Profile → Edit → Save" returns to Profile via the screen's own goBack.
  const sessionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = currentUser ? `${currentUser.role}:${currentUser.id}` : null;
    if (key === sessionKeyRef.current) return;
    sessionKeyRef.current = key;
    setBlockedView({ name: 'root' });

    if (!currentUser) {
      // logged out — only push to Welcome if we're already past Splash/auth
      if (home !== null) {
        setHome(null);
        resetTo({ name: 'Welcome' });
      }
      return;
    }
    if (currentUser.role === 'admin') {
      setHome({ kind: 'admin' });
      resetTo(null);
      setAdminTab('dashboard');
    } else if (currentUser.role === 'contractor') {
      setHome({ kind: 'contractor' });
      resetTo(null);
      setContractorTab('dashboard');
    } else if (currentUser.role === 'worker') {
      setHome({ kind: 'worker' });
      resetTo(null);
      setWorkerTab('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Reset the confined rejected-registration sub-view whenever the rejected
  // registration changes (login of a different person, or logout), so a stale
  // ticket id never carries over.
  useEffect(() => {
    setRejectedView({ name: 'root' });
  }, [rejectedRegistration?.id]);

  // Initial route = Splash (kicks off the app)
  useEffect(() => {
    if (route === null && home === null) {
      resetTo({ name: 'Splash' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android hardware back button: pop the drilldown stack while inside a
  // logged-in role's area, matching the on-screen back arrow. Pre-login
  // auth screens keep relying on their own onBack (goWelcome etc.), and at
  // the tab root (empty stack) we let the OS handle it (default behavior).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Blocked session: walk the BlockedView machine back one step; only
      // fall through to the OS at its root.
      const isBlocked =
        !!currentUser &&
        currentUser.role !== 'admin' &&
        currentUser.status === 'blocked';
      if (isBlocked) {
        if (blockedView.name === 'root') return false;
        setBlockedView((prev) =>
          prev.name === 'ticket' ? { name: 'tickets' } : { name: 'root' }
        );
        return true;
      }
      // Confined rejected-registration session: walk the RejectedView machine
      // back one step; only fall through to the OS at its root.
      if (rejectedRegistration) {
        if (rejectedView.name === 'root') return false;
        setRejectedView((prev) =>
          prev.name === 'ticket' ? { name: 'tickets' } : { name: 'root' }
        );
        return true;
      }
      if (home !== null && routeStack.length > 0) {
        setRouteStack((prev) => prev.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    home,
    routeStack.length,
    currentUser,
    blockedView.name,
    rejectedRegistration,
    rejectedView.name,
  ]);

  // ---- Helpers ----------------------------------------------------------------

  const goWelcome = useCallback(() => {
    setHome(null);
    resetTo({ name: 'Welcome' });
  }, [resetTo]);

  // Find-or-create THE conversation with `otherUserId` and push straight
  // into it — used by every "שלח הודעה" button (worker/contractor profile,
  // job details, staffing screen, ...) so the same pair always lands in the
  // exact same WhatsApp-style thread, no matter which screen it was opened
  // from. Conversations only store participantIds, so no name/profession
  // needs to travel through here — each screen resolves the other
  // participant's details itself via getUserById.
  const openChatWith = useCallback(
    async (otherUserId: string) => {
      if (!currentUser) return;

      // Account status has UI priority over any "send message" affordance.
      // A blocked counterpart: never (re)create a thread — `send_message` /
      // `get_or_create_direct_conversation` (046/038) reject it server-side and
      // the tap would look unresponsive. If a historical thread is already in
      // the loaded inbox, open it read-only (ChatScreen shows the inactive
      // banner + disabled composer); otherwise explain, don't fail silently.
      const other = getUserById(otherUserId) as { status?: string } | undefined;
      if (other?.status === 'blocked') {
        const existing = findConversation(
          conversations,
          currentUser.id,
          otherUserId
        );
        if (existing) {
          push({ name: 'Chat', conversationId: existing.id });
        } else {
          Alert.alert('לא ניתן לשלוח הודעה', 'החשבון אינו פעיל במערכת');
        }
        return;
      }

      try {
        const conversation = await getOrCreateConversation(
          currentUser.id,
          otherUserId
        );
        push({ name: 'Chat', conversationId: conversation.id });
      } catch {
        // Could not open/create the thread (offline, or a disallowed pair on
        // the backend path). Stay put — the caller screen is unchanged.
      }
    },
    [currentUser, getOrCreateConversation, push, getUserById, conversations]
  );

  const handleLogout = useCallback(() => {
    clearAllScrollMemory();
    logout();
    goWelcome();
  }, [logout, goWelcome]);

  const handleLoginResult = (r: LoginResult) => {
    if (r.ok && r.user) {
      // useEffect on currentUser will route into the right home shell
      return;
    }
    if (r.reason === 'pending') {
      // With the mock backend `r.registration` carries the full snapshot; with
      // Supabase (Phase 2, no registration table wired yet) it's absent and the
      // status screen simply renders without the reference-number box.
      resetTo({
        name: 'RegistrationPending',
        registrationId: r.registration?.id ?? '',
      });
    }
    // reason === 'rejected': loginAsCustomer has set `rejectedRegistration`
    // (a confined session, no currentUser); the navigator's rejected guard
    // takes over from here (no route needed).
    // reason === 'blocked': loginAsCustomer has already set the session user;
    // the navigator's blocked guard takes over from here (no route needed).
  };

  // -------------------------------------------------------------------------
  // Notification deep-linking — the SINGLE place a notification tap turns into
  // navigation. Every branch routes off stable entity IDs only (never a
  // title, a person's name, or the body text). `notification.relatedId` holds
  // the PRIMARY entity id for its type; any secondary id the target screen
  // needs (e.g. an application's jobId) is resolved here from the live
  // collections, so we always hand a screen the exact id it looks up.
  //
  // Resolution has two failure modes, kept distinct:
  //   • target is a list / tab  -> just go there (nothing to "not find").
  //   • target needs one entity that no longer exists -> `entityGone()`:
  //     a calm message, and we stay on the notifications list. This never
  //     masks a wrong-id bug, because every id below is resolved, not
  //     assumed.
  // -------------------------------------------------------------------------
  const navigateFromNotification = useCallback(
    (notification: AppNotification) => {
      const role = currentUser?.role;
      if (!role) return;
      const relatedId = notification.relatedId;

      const entityGone = () =>
        Alert.alert('לא זמין', 'הפריט שאליו ההתראה מפנה אינו זמין עוד.');

      switch (notification.type) {
        // Worker applied to (or re-applied for) one of the contractor's jobs.
        // relatedId = the JOB id (server payload: migrations 032 / 033 / 034
        // pass `v_job.id::text`, NOT an application id — the old
        // `applications.find(id === relatedId)` here always missed and hit
        // `entityGone()`). Destination is the "בקשות שהתקבלו" tab, which lists
        // every candidate across the contractor's jobs (it has no per-job
        // filter, so nothing to scope). That tab always exists, so a valid
        // notification never shows "לא זמין"; a later accept/reject just means
        // the row now appears under a different status chip.
        case 'job_application':
        case 'job_request': {
          if (role !== 'contractor') break;
          setContractorTab('applications-received');
          resetTo(null);
          break;
        }

        // A decision landed on the worker's application → worker opens THAT
        // job, where their application row shows the new status.
        // relatedId = the JOB id (server payload: 032_staffing_notifications
        // passes `v_job.id::text`, NOT an application id — the old
        // `applications.find(id === relatedId)` here always missed and fell to
        // the tab). `getJobById` resolves it (open pool or the hydrated
        // `relatedJobs` side-cache, which the worker's own application fills).
        case 'application_accepted':
        case 'application_rejected': {
          if (role !== 'worker') break;
          const job = relatedId ? getJobById(relatedId) : undefined;
          if (job) {
            push({ name: 'WorkerJobDetails', jobId: job.id });
          } else {
            // Job no longer resolvable — the applications list is a real
            // screen, so land there rather than nag.
            setWorkerTab('my-applications');
            resetTo(null);
          }
          break;
        }

        // Invitation lifecycle → the relevant list for each side. No
        // per-invitation detail screen exists, so a missing row is harmless.
        case 'invitation_received':
        case 'invitation_cancelled':
          if (role === 'worker') push({ name: 'WorkerInvitations' });
          break;
        case 'invitation_accepted':
        case 'invitation_declined':
          if (role === 'contractor')
            push({ name: 'ContractorSentInvitations' });
          break;

        // A staffed worker left / was removed. relatedId = job id.
        case 'assignment_cancelled': {
          if (role === 'worker') {
            push({ name: 'WorkerMyAssignments' });
          } else if (role === 'contractor') {
            const job = relatedId ? getJobById(relatedId) : undefined;
            if (job) push({ name: 'ContractorJobStaffing', jobId: job.id });
            else entityGone();
          }
          break;
        }

        // Contractor marked the worker as having finished their part. Only the
        // worker is notified. relatedId = job id.
        case 'assignment_completed': {
          if (role === 'worker') push({ name: 'WorkerMyAssignments' });
          break;
        }

        // New chat message (Phase 7C). relatedId = conversation id → open that
        // exact thread. If it isn't in the local inbox yet (Realtime lag / cold
        // start), still push straight into it and kick a refresh — ChatScreen
        // renders once `conversations` catches up, and shows its own clean
        // "השיחה לא נמצאה" state if the caller genuinely can't access it. Never
        // create a conversation from a notification. Only bail to the inbox
        // when there's no id at all.
        case 'new_message': {
          if (!relatedId) {
            push({ name: 'Messages' });
            break;
          }
          if (!conversations.some((c) => c.id === relatedId)) {
            void refreshConversations();
          }
          push({ name: 'Chat', conversationId: relatedId });
          break;
        }

        // Support-ticket activity (reply / status change / closed / reopened),
        // for the requester OR an admin. relatedId = ticket id.
        case 'support_response': {
          const ticket = relatedId
            ? supportTickets.find((t) => t.id === relatedId)
            : undefined;
          if (ticket)
            push({ name: 'SupportTicketDetails', ticketId: ticket.id });
          else entityGone();
          break;
        }

        // Admin: a new ticket was opened. relatedId = ticket id.
        case 'new_support_ticket': {
          if (role !== 'admin') break;
          const ticket = relatedId
            ? supportTickets.find((t) => t.id === relatedId)
            : undefined;
          if (ticket) {
            push({ name: 'SupportTicketDetails', ticketId: ticket.id });
          } else {
            setAdminTab('support-tickets');
            resetTo(null);
          }
          break;
        }

        // Admin: a registration is waiting for review. relatedId =
        // registration id (records are never deleted, only re-statused).
        case 'new_pending_registration': {
          if (role !== 'admin') break;
          const reg = relatedId
            ? registrations.find((r) => r.id === relatedId)
            : undefined;
          if (reg) {
            push({
              name: 'AdminRegistrationDetails',
              registrationId: reg.id,
            });
          } else {
            setAdminTab('pending-registrations');
            resetTo(null);
          }
          break;
        }

        // Admin: contractor licence needs attention / an update was
        // submitted. relatedId = the contractor's user id.
        case 'license_update_submitted':
        case 'license_attention': {
          if (role !== 'admin') break;
          const contractor = relatedId ? getUserById(relatedId) : undefined;
          if (contractor && relatedId)
            push({ name: 'AdminUserDetails', userId: relatedId });
          else entityGone();
          break;
        }

        // Contractor: the outcome of their licence-update request, or an admin
        // manually editing their registration number — their own profile
        // (licence area) shows the updated details.
        case 'license_update_approved':
        case 'license_update_rejected':
        case 'contractor_registration_number_updated':
          if (role === 'contractor') {
            setContractorTab('profile');
            resetTo(null);
          }
          break;

        // Contractor: asked to upload a renewed licence — straight into the
        // profile-edit screen's licence section.
        case 'license_renewal_requested':
          if (role === 'contractor') {
            setContractorTab('profile');
            push({ name: 'ContractorProfileEdit' });
          }
          break;

        // Informational only — nothing to open. Dismiss the notifications
        // screen back to wherever the user was.
        case 'registration_approved':
        case 'registration_rejected':
        case 'account_blocked':
        case 'account_unblocked':
        case 'review':
        case 'system':
        default:
          resetTo(null);
          break;
      }
    },
    [
      currentUser,
      push,
      resetTo,
      conversations,
      supportTickets,
      registrations,
      getJobById,
      getUserById,
    ]
  );

  // ---- Auth/status screens --------------------------------------------------

  // Backend session restore in flight — hold on the
  // splash so we never flash Login or a dashboard before we know who, if
  // anyone, is signed in. `onFinish` is a no-op: AppContext flips
  // `sessionLoading` off when the restore settles.
  //
  // The explicit `key` is load-bearing: this element and the `route === 'Splash'`
  // one below are both <SplashScreen>, so without distinct keys React reuses the
  // SAME instance when `sessionLoading` flips false. SplashScreen captures
  // `onFinish` in a mount-only effect + a `finishedRef` latch, so the reused
  // instance keeps firing THIS no-op forever and never navigates to Welcome.
  // Distinct keys force a fresh mount of the real splash with the real onFinish.
  if (sessionLoading) {
    return <SplashScreen key="auth-bootstrap-splash" onFinish={() => {}} />;
  }

  // A Supabase PASSWORD_RECOVERY session is active (app opened from the emailed
  // reset link) — go straight to the reset screen, regardless of the stack.
  if (passwordRecoveryActive) {
    return (
      <ResetPasswordScreen
        onBack={() => {
          clearPasswordRecovery();
          handleLogout();
        }}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Confined rejected-registration shell. A password-verified user whose
  // registration was rejected has a session but NO profile and NO currentUser,
  // so this guard runs BEFORE every pre-auth route AND before the "need a role"
  // gate. They can reach ONLY: the rejected screen + the shared support screens
  // (wired to the registration-support island, migration 052) + logout. Back
  // navigation stays inside the RejectedView machine.
  // -------------------------------------------------------------------------
  if (rejectedRegistration) {
    const rr = rejectedRegistration;

    if (rejectedView.name === 'tickets') {
      return (
        <SupportTicketsScreen
          onBack={() => setRejectedView({ name: 'root' })}
          onOpenTicket={(ticketId) =>
            setRejectedView({ name: 'ticket', ticketId })
          }
          onOpenNewTicket={() => setRejectedView({ name: 'newTicket' })}
          ticketsOverride={registrationSupportTickets}
        />
      );
    }
    if (rejectedView.name === 'ticket') {
      return (
        <SupportTicketDetailsScreen
          ticketId={rejectedView.ticketId}
          onBack={() => setRejectedView({ name: 'tickets' })}
          onOpenNewTicket={() => setRejectedView({ name: 'newTicket' })}
          ticketsOverride={registrationSupportTickets}
          onReplyOverride={(id, msg) => replyToRegistrationSupportTicket(id, msg)}
        />
      );
    }
    if (rejectedView.name === 'newTicket') {
      return (
        <OpenSupportTicketScreen
          initialSubject="ערעור על דחיית רישום"
          onBack={() => setRejectedView({ name: 'root' })}
          onSubmitted={(ticketId) =>
            setRejectedView({ name: 'ticket', ticketId })
          }
          onCreateOverride={(type, subject, description) =>
            openRegistrationSupportTicket(type, subject, description).then(
              (t) => t.id
            )
          }
        />
      );
    }
    return (
      <RegistrationRejectedScreen
        registrationId={rr.id}
        rejectionReason={rr.rejectionReason}
        processedAt={rr.processedAt}
        tickets={registrationSupportTickets}
        onOpenNewTicket={() => setRejectedView({ name: 'newTicket' })}
        onOpenTicket={(ticketId) =>
          setRejectedView({ name: 'ticket', ticketId })
        }
        onOpenAllTickets={() => setRejectedView({ name: 'tickets' })}
        onBackToWelcome={handleLogout}
      />
    );
  }

  if (route?.name === 'Splash') {
    return (
      <SplashScreen
        key="app-splash"
        onFinish={() => resetTo({ name: 'Welcome' })}
      />
    );
  }
  if (route?.name === 'Welcome') {
    return (
      <WelcomeScreen
        onLogin={(role) => resetTo({ name: 'Login', role })}
        onSignUp={(role) => resetTo({ name: 'SignUp', role })}
        onAdminLogin={() => resetTo({ name: 'AdminLogin' })}
      />
    );
  }
  if (route?.name === 'Login') {
    return (
      <LoginScreen
        role={route.role}
        onLoginResult={handleLoginResult}
        onBack={goWelcome}
        onGoSignUp={() => resetTo({ name: 'SignUp', role: route.role })}
        onForgotPassword={() => push({ name: 'ForgotPassword' })}
      />
    );
  }
  if (route?.name === 'ForgotPassword') {
    return (
      <ForgotPasswordScreen
        onBack={goBack}
        onCodeSent={(email) => push({ name: 'VerifyRecoveryCode', email })}
      />
    );
  }
  if (route?.name === 'VerifyRecoveryCode') {
    return (
      <VerifyRecoveryCodeScreen
        email={route.email}
        onBack={goBack}
        onVerified={beginPasswordRecovery}
      />
    );
  }
  if (route?.name === 'ResetPassword') {
    return <ResetPasswordScreen onBack={goWelcome} />;
  }
  if (route?.name === 'SignUp') {
    return (
      <SignUpScreen
        role={route.role}
        onRegistered={(registrationId) =>
          resetTo({ name: 'RegistrationPending', registrationId })
        }
        onBack={goWelcome}
        onGoLogin={() => resetTo({ name: 'Login', role: route.role })}
      />
    );
  }
  if (route?.name === 'AdminLogin') {
    return <AdminLoginScreen onBack={goWelcome} />;
  }
  if (route?.name === 'RegistrationPending') {
    return (
      <RegistrationPendingScreen
        registrationId={route.registrationId}
        onBackToWelcome={goWelcome}
      />
    );
  }
  if (route?.name === 'RegistrationRejected') {
    return (
      <RegistrationRejectedScreen
        registrationId={route.registrationId}
        onBackToWelcome={goWelcome}
      />
    );
  }
  // ---- Need a logged-in role to render any role shell -----------------------
  if (!currentUser || home === null) {
    // Should be impossible after auth flow, but guard
    return null;
  }

  // Blocked guard (frontend/UX only — real enforcement comes with the
  // backend). If the session user's status is 'blocked' — whether they signed
  // in that way, or an admin blocked them mid-session and the currentUser
  // state updated — they never see the normal app shells. The ONLY thing they
  // can reach is the block screen and the shared support-ticket flow, wired
  // through the BlockedView machine (never the route stack).
  if (currentUser.role !== 'admin' && currentUser.status === 'blocked') {
    if (blockedView.name === 'tickets') {
      return (
        <SupportTicketsScreen
          onBack={() => setBlockedView({ name: 'root' })}
          onOpenTicket={(ticketId) =>
            setBlockedView({ name: 'ticket', ticketId })
          }
          onOpenNewTicket={() => setBlockedView({ name: 'newTicket' })}
        />
      );
    }
    if (blockedView.name === 'ticket') {
      return (
        <SupportTicketDetailsScreen
          ticketId={blockedView.ticketId}
          onBack={() => setBlockedView({ name: 'tickets' })}
          onOpenNewTicket={() => setBlockedView({ name: 'newTicket' })}
        />
      );
    }
    if (blockedView.name === 'newTicket') {
      return (
        <OpenSupportTicketScreen
          initialSubject="בירור חסימת חשבון"
          onBack={() => setBlockedView({ name: 'root' })}
          onSubmitted={(ticketId) =>
            setBlockedView({ name: 'ticket', ticketId })
          }
        />
      );
    }
    return (
      <BlockedAccountScreen
        blockedReason={currentUser.blockedReason}
        onBackToWelcome={handleLogout}
        onOpenNewTicket={() => setBlockedView({ name: 'newTicket' })}
        onOpenTicket={(ticketId) =>
          setBlockedView({ name: 'ticket', ticketId })
        }
        onOpenAllTickets={() => setBlockedView({ name: 'tickets' })}
      />
    );
  }

  // ---- Drilldown routes (overlay on top of current home) --------------------

  if (route !== null) {
    switch (route.name) {
      // Worker
      case 'WorkerJobDetails':
        return (
          <JobDetailsScreen
            jobId={route.jobId}
            onBack={goBack}
            onOpenWorkerProfile={() => {
              /* worker viewing job — N/A */
            }}
            onOpenSmartMatchForJob={() => {
              /* contractor-only */
            }}
            onOpenChatWithContractor={(contractorId) =>
              openChatWith(contractorId)
            }
          />
        );
      case 'WorkerFavoriteContractors':
        return (
          <FavoriteContractorsScreen
            onBack={goBack}
            onOpenAvailableJobs={() => {
              goBack();
              setWorkerTab('available-jobs');
            }}
          />
        );
      case 'WorkerInvitations':
        return (
          <WorkerInvitationsScreen
            onBack={goBack}
            onOpenJobDetails={(jobId) =>
              push({ name: 'WorkerJobDetails', jobId })
            }
          />
        );
      case 'WorkerMyAssignments':
        return (
          <MyAssignmentsScreen
            onBack={goBack}
            onOpenJobDetails={(jobId) =>
              push({ name: 'WorkerJobDetails', jobId })
            }
            onOpenChat={(contractorId) => openChatWith(contractorId)}
          />
        );
      case 'WorkerAvailability':
        return <AvailabilityManagementScreen onBack={goBack} />;
      case 'WorkerProfileEdit':
        return <WorkerProfileEditScreen onBack={goBack} />;

      // Contractor
      case 'ContractorPostJob':
        return (
          <PostJobScreen
            jobId={route.jobId}
            onBack={goBack}
            onPosted={(jobId) =>
              replaceTop({ name: 'ContractorJobDetails', jobId })
            }
            onSaved={(jobId) =>
              replaceTop({ name: 'ContractorJobDetails', jobId })
            }
          />
        );
      case 'ContractorJobDetails':
        return (
          <JobDetailsScreen
            jobId={route.jobId}
            onBack={goBack}
            onOpenWorkerProfile={(workerId) =>
              push({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenSmartMatchForJob={(jobId) =>
              push({ name: 'ContractorSmartMatch', initialJobId: jobId })
            }
            onOpenSentInvitations={() =>
              push({ name: 'ContractorSentInvitations' })
            }
            onOpenStaffing={(jobId) =>
              push({ name: 'ContractorJobStaffing', jobId })
            }
            onOpenEditJob={(jobId) =>
              push({ name: 'ContractorPostJob', jobId })
            }
          />
        );
      case 'ContractorJobStaffing':
        return (
          <JobStaffingScreen
            jobId={route.jobId}
            onBack={goBack}
            onOpenWorkerProfile={(workerId) =>
              push({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenChat={(workerId) => openChatWith(workerId)}
            onOpenSearchWorkers={() =>
              push({ name: 'ContractorSearchWorkers' })
            }
            onOpenSmartMatch={() =>
              push({ name: 'ContractorSmartMatch', initialJobId: route.jobId })
            }
          />
        );
      case 'ContractorProfileEdit':
        return <ContractorProfileEditScreen onBack={goBack} />;
      case 'ContractorSearchWorkers':
        return (
          <SearchWorkersScreen
            onBack={goBack}
            onOpenWorkerProfile={(workerId) =>
              push({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenFavoriteWorkers={() => push({ name: 'ContractorFavoriteWorkers' })}
          />
        );
      case 'ContractorFavoriteWorkers':
        return (
          <FavoriteWorkersScreen
            onBack={goBack}
            onOpenWorkerProfile={(workerId) =>
              push({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenSearchWorkers={() => push({ name: 'ContractorSearchWorkers' })}
          />
        );
      case 'ContractorWorkerProfile':
        return (
          <WorkerProfileScreen
            workerId={route.workerId}
            onBack={goBack}
            onOpenJobDetails={(jobId) =>
              push({ name: 'ContractorJobDetails', jobId })
            }
            onOpenChat={(workerId) => openChatWith(workerId)}
          />
        );
      case 'ContractorSmartMatch':
        return (
          <SmartMatchScreen
            initialJobId={route.initialJobId}
            onBack={goBack}
            onOpenWorkerProfile={(workerId) =>
              push({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenJobDetails={(jobId) =>
              push({ name: 'ContractorJobDetails', jobId })
            }
            onOpenSearchWorkers={() =>
              push({ name: 'ContractorSearchWorkers' })
            }
          />
        );
      case 'ContractorSentInvitations':
        return (
          <SentInvitationsScreen
            onBack={goBack}
            onOpenWorkerProfile={(workerId) =>
              push({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenJobDetails={(jobId) =>
              push({ name: 'ContractorJobDetails', jobId })
            }
          />
        );

      // Admin
      case 'AdminRegistrationDetails':
        return (
          <RegistrationDetailsScreen
            registrationId={route.registrationId}
            onBack={goBack}
            onResolved={(status) => {
              setAdminRegStatus(status);
              setAdminTab('pending-registrations');
              resetTo(null);
            }}
            onOpenUser={(userId) =>
              push({ name: 'AdminUserDetails', userId })
            }
          />
        );
      case 'AdminUserDetails':
        return (
          <AdminUserDetailsScreen
            userId={route.userId}
            onBack={goBack}
            onOpenContractorJobs={(contractorId) =>
              push({ name: 'AdminContractorJobs', contractorId })
            }
          />
        );
      case 'AdminContractorJobs':
        return (
          <AdminContractorJobsScreen
            contractorId={route.contractorId}
            onBack={goBack}
            onOpenUser={(userId) =>
              push({ name: 'AdminUserDetails', userId })
            }
          />
        );
      case 'AdminLicenseAttention':
        return (
          <AdminLicenseAttentionScreen
            onBack={goBack}
            onOpenUser={(userId) =>
              push({ name: 'AdminUserDetails', userId })
            }
          />
        );

      // Shared
      case 'Messages':
        return (
          <MessagesScreen
            onBack={goBack}
            onOpenConversation={(conversationId) =>
              push({ name: 'Chat', conversationId })
            }
          />
        );
      case 'Chat':
        return (
          <ChatScreen
            conversationId={route.conversationId}
            onBack={goBack}
          />
        );
      case 'Notifications':
        return (
          <NotificationsScreen
            onBack={goBack}
            onNavigate={navigateFromNotification}
          />
        );
      case 'SupportTickets':
        return (
          <SupportTicketsScreen
            onBack={goBack}
            onOpenTicket={(ticketId) =>
              push({ name: 'SupportTicketDetails', ticketId })
            }
            onOpenNewTicket={
              currentUser.role !== 'admin'
                ? () => push({ name: 'OpenSupportTicket' })
                : undefined
            }
          />
        );
      case 'SupportTicketDetails':
        return (
          <SupportTicketDetailsScreen
            ticketId={route.ticketId}
            onBack={goBack}
            onOpenUser={
              currentUser.role === 'admin'
                ? (userId) => push({ name: 'AdminUserDetails', userId })
                : undefined
            }
            onViewRegistration={
              currentUser.role === 'admin'
                ? (registrationId) =>
                    push({ name: 'AdminRegistrationDetails', registrationId })
                : undefined
            }
            onOpenNewTicket={
              currentUser.role !== 'admin'
                ? () => push({ name: 'OpenSupportTicket' })
                : undefined
            }
          />
        );
      case 'OpenSupportTicket':
        return (
          <OpenSupportTicketScreen
            onBack={goBack}
            onSubmitted={(ticketId) =>
              replaceTop({ name: 'SupportTicketDetails', ticketId })
            }
          />
        );
      case 'Settings':
        return (
          <SettingsScreen
            onBack={goBack}
            onEditProfile={
              currentUser.role === 'worker'
                ? () => push({ name: 'WorkerProfileEdit' })
                : undefined
            }
            onLogout={handleLogout}
          />
        );
    }
  }

  // ---- Home shells with bottom tabs -----------------------------------------

  if (home.kind === 'worker') {
    return (
      <WorkerHome
        tab={workerTab}
        setTab={setWorkerTab}
        navigate={push}
        onLogout={handleLogout}
      />
    );
  }
  if (home.kind === 'contractor') {
    return (
      <ContractorHome
        tab={contractorTab}
        setTab={setContractorTab}
        navigate={push}
        onLogout={handleLogout}
      />
    );
  }
  if (home.kind === 'admin') {
    return (
      <AdminHome
        tab={adminTab}
        setTab={setAdminTab}
        navigate={push}
        onLogout={handleLogout}
        regInitialStatus={adminRegStatus}
      />
    );
  }

  return null;
};

// =============================================================================
// Worker home shell
// =============================================================================

const WorkerHome: React.FC<{
  tab: WorkerTab;
  setTab: (t: WorkerTab) => void;
  navigate: (r: Route) => void;
  onLogout: () => void;
}> = ({ tab, setTab, navigate, onLogout }) => {
  const body = useMemo(() => {
    switch (tab) {
      case 'dashboard':
        return (
          <WorkerDashboard
            onOpenProProfile={() => setTab('profile')}
            onOpenAvailableJobs={() => setTab('available-jobs')}
            onOpenFavoriteContractors={() =>
              navigate({ name: 'WorkerFavoriteContractors' })
            }
            onOpenMyApplications={(initialFilter) => {
              // dashboard sometimes preselects a filter, but the tab body
              // creates its own MyApplicationsScreen — for cross-cuts we
              // navigate via the tab; if a filter is needed, drilldown route
              // would be used. Here we just go to the tab.
              void initialFilter;
              setTab('my-applications');
            }}
            onOpenInvitations={() => navigate({ name: 'WorkerInvitations' })}
            onOpenAvailability={() => navigate({ name: 'WorkerAvailability' })}
            onOpenMessages={() => navigate({ name: 'Messages' })}
            onOpenNotifications={() => navigate({ name: 'Notifications' })}
            onOpenSupport={() => navigate({ name: 'SupportTickets' })}
            onOpenJobDetails={(jobId) =>
              navigate({ name: 'WorkerJobDetails', jobId })
            }
            onOpenMyAssignments={() => navigate({ name: 'WorkerMyAssignments' })}
          />
        );
      case 'available-jobs':
        return (
          <AvailableJobsScreen
            onBack={() => setTab('dashboard')}
            onOpenJobDetails={(jobId) =>
              navigate({ name: 'WorkerJobDetails', jobId })
            }
            onOpenFavoriteContractors={() =>
              navigate({ name: 'WorkerFavoriteContractors' })
            }
          />
        );
      case 'my-applications':
        return (
          <MyApplicationsScreen
            onBack={() => setTab('dashboard')}
            onOpenJobDetails={(jobId) =>
              navigate({ name: 'WorkerJobDetails', jobId })
            }
          />
        );
      case 'profile':
        return (
          <WorkerProfessionalProfileScreen
            onBack={() => setTab('dashboard')}
            onOpenEdit={() => navigate({ name: 'WorkerProfileEdit' })}
            onOpenAvailability={() => navigate({ name: 'WorkerAvailability' })}
            onOpenSettings={() => navigate({ name: 'Settings' })}
          />
        );
    }
  }, [tab, setTab, navigate]);
  void onLogout;

  return (
    <View style={styles.shell}>
      <View style={styles.body}>{body}</View>
      <BottomTabs
        items={[
          {
            key: 'dashboard',
            label: 'בית',
            icon: 'home-outline',
            iconActive: 'home',
          },
          {
            key: 'available-jobs',
            label: 'משרות',
            icon: 'briefcase-outline',
            iconActive: 'briefcase',
          },
          {
            key: 'my-applications',
            label: 'בקשות',
            icon: 'document-text-outline',
            iconActive: 'document-text',
          },
          {
            key: 'profile',
            label: 'פרופיל',
            icon: 'person-outline',
            iconActive: 'person',
          },
        ]}
        active={tab}
        onChange={(k) => setTab(k as WorkerTab)}
      />
    </View>
  );
};

// =============================================================================
// Contractor home shell
// =============================================================================

const ContractorHome: React.FC<{
  tab: ContractorTab;
  setTab: (t: ContractorTab) => void;
  navigate: (r: Route) => void;
  onLogout: () => void;
}> = ({ tab, setTab, navigate, onLogout }) => {
  const body = useMemo(() => {
    switch (tab) {
      case 'dashboard':
        return (
          <ContractorDashboard
            onOpenMyJobs={() => setTab('my-jobs')}
            onOpenApplicationsReceived={() => setTab('applications-received')}
            onOpenSentInvitations={() =>
              navigate({ name: 'ContractorSentInvitations' })
            }
            onOpenContractorProfile={() => setTab('profile')}
            onOpenPostJob={() => navigate({ name: 'ContractorPostJob' })}
            onOpenSearchWorkers={() =>
              navigate({ name: 'ContractorSearchWorkers' })
            }
            onOpenFavoriteWorkers={() =>
              navigate({ name: 'ContractorFavoriteWorkers' })
            }
            onOpenSmartMatch={() => navigate({ name: 'ContractorSmartMatch' })}
            onOpenMessages={() => navigate({ name: 'Messages' })}
            onOpenNotifications={() => navigate({ name: 'Notifications' })}
            onOpenSupport={() => navigate({ name: 'SupportTickets' })}
            onOpenJobDetails={(jobId) =>
              navigate({ name: 'ContractorJobDetails', jobId })
            }
          />
        );
      case 'my-jobs':
        return (
          <MyJobsScreen
            onBack={() => setTab('dashboard')}
            onOpenJobDetails={(jobId) =>
              navigate({ name: 'ContractorJobDetails', jobId })
            }
            onOpenPostJob={() => navigate({ name: 'ContractorPostJob' })}
          />
        );
      case 'applications-received':
        return (
          <ApplicationsReceivedScreen
            onBack={() => setTab('dashboard')}
            onOpenWorkerProfile={(workerId) =>
              navigate({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenJobDetails={(jobId) =>
              navigate({ name: 'ContractorJobDetails', jobId })
            }
          />
        );
      case 'profile':
        return (
          <ContractorProfileScreen
            onBack={() => setTab('dashboard')}
            onOpenSettings={() => navigate({ name: 'Settings' })}
            onOpenEdit={() => navigate({ name: 'ContractorProfileEdit' })}
            onLogout={onLogout}
          />
        );
    }
  }, [tab, setTab, navigate, onLogout]);

  return (
    <View style={styles.shell}>
      <View style={styles.body}>{body}</View>
      <BottomTabs
        items={[
          {
            key: 'dashboard',
            label: 'בית',
            icon: 'home-outline',
            iconActive: 'home',
          },
          {
            key: 'my-jobs',
            label: 'משרות',
            icon: 'briefcase-outline',
            iconActive: 'briefcase',
          },
          {
            key: 'applications-received',
            label: 'בקשות',
            icon: 'people-outline',
            iconActive: 'people',
          },
          {
            key: 'profile',
            label: 'פרופיל',
            icon: 'person-outline',
            iconActive: 'person',
          },
        ]}
        active={tab}
        onChange={(k) => setTab(k as ContractorTab)}
      />
    </View>
  );
};

// =============================================================================
// Admin home shell
// =============================================================================

const AdminHome: React.FC<{
  tab: AdminTab;
  setTab: (t: AdminTab) => void;
  navigate: (r: Route) => void;
  onLogout: () => void;
  regInitialStatus: 'pending' | 'approved' | 'rejected';
}> = ({ tab, setTab, navigate, onLogout, regInitialStatus }) => {
  // Which status filter "ניהול משתמשים" opens with. Set from the dashboard
  // KPI that was tapped (e.g. "משתמשים חסומים" → 'blocked'); always reset to
  // 'all' when the user opens the tab from the bottom bar, so a normal entry
  // never gets stuck on a previous filter. Local (not global) on purpose.
  const [userMgmtStatus, setUserMgmtStatus] = useState<
    'all' | 'approved' | 'blocked'
  >('all');

  const body = useMemo(() => {
    switch (tab) {
      case 'dashboard':
        return (
          <AdminDashboardScreen
            onOpenPendingRegistrations={() => setTab('pending-registrations')}
            onOpenUserManagement={(filter) => {
              setUserMgmtStatus(
                filter === 'blocked'
                  ? 'blocked'
                  : filter === 'approved'
                  ? 'approved'
                  : 'all'
              );
              setTab('user-management');
            }}
            onOpenSupportTickets={() => setTab('support-tickets')}
            onOpenLicenseAttention={() =>
              navigate({ name: 'AdminLicenseAttention' })
            }
            onOpenNotifications={() => navigate({ name: 'Notifications' })}
            onOpenSettings={() => navigate({ name: 'Settings' })}
            onOpenRegistrationDetails={(registrationId) =>
              navigate({
                name: 'AdminRegistrationDetails',
                registrationId,
              })
            }
            onOpenTicketDetails={(ticketId) =>
              navigate({ name: 'SupportTicketDetails', ticketId })
            }
            onLogout={onLogout}
          />
        );
      case 'pending-registrations':
        return (
          <PendingRegistrationsScreen
            initialStatus={regInitialStatus}
            onBack={() => setTab('dashboard')}
            onOpenRegistration={(registrationId) =>
              navigate({
                name: 'AdminRegistrationDetails',
                registrationId,
              })
            }
          />
        );
      case 'user-management':
        return (
          <UserManagementScreen
            initialStatus={userMgmtStatus}
            onBack={() => setTab('dashboard')}
            onOpenUser={(userId) =>
              navigate({ name: 'AdminUserDetails', userId })
            }
          />
        );
      case 'support-tickets':
        return (
          <SupportTicketsScreen
            onBack={() => setTab('dashboard')}
            onOpenTicket={(ticketId) =>
              navigate({ name: 'SupportTicketDetails', ticketId })
            }
          />
        );
    }
  }, [tab, setTab, navigate, onLogout, regInitialStatus, userMgmtStatus]);

  return (
    <View style={styles.shell}>
      <View style={styles.body}>{body}</View>
      <BottomTabs
        items={[
          {
            key: 'dashboard',
            label: 'מרכז',
            icon: 'shield-outline',
            iconActive: 'shield',
          },
          {
            key: 'pending-registrations',
            label: 'הרשמות',
            icon: 'document-text-outline',
            iconActive: 'document-text',
          },
          {
            key: 'user-management',
            label: 'משתמשים',
            icon: 'people-outline',
            iconActive: 'people',
          },
          {
            key: 'support-tickets',
            label: 'תמיכה',
            icon: 'help-buoy-outline',
            iconActive: 'help-buoy',
          },
        ]}
        active={tab}
        onChange={(k) => {
          // A plain tap on "משתמשים" always opens the default (all) filter —
          // it never inherits a filter a dashboard KPI set earlier.
          if (k === 'user-management') setUserMgmtStatus('all');
          setTab(k as AdminTab);
        }}
      />
    </View>
  );
};

// =============================================================================
// Bottom tabs component
// =============================================================================

interface TabItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const BottomTabs: React.FC<{
  items: TabItem[];
  active: string;
  onChange: (k: string) => void;
}> = ({ items, active, onChange }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <TouchableOpacity
            key={it.key}
            style={styles.tabBtn}
            onPress={() => onChange(it.key)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isActive ? it.iconActive : it.icon}
              size={22}
              color={isActive ? Colors.primary : Colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                isActive && { color: Colors.primary, fontWeight: '700' },
              ]}
            >
              {it.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// =============================================================================

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    fontWeight: '600',
  },
});

export default AppNavigator;
