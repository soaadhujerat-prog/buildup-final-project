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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { clearAllScrollMemory } from '../utils/scrollMemory';
import {
  NotificationType,
} from '../types';
import { LoginResult } from '../context/AppContext';

type CustomerRole = 'contractor' | 'worker';

// Auth/status screens
import SplashScreen from '../screens/SplashScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
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
  // Reached from the emailed password-recovery deep link once a real
  // backend exists — no in-app screen navigates here yet.
  | { name: 'ResetPassword' }
  | { name: 'RegistrationPending'; registrationId: string }
  | { name: 'RegistrationRejected'; registrationId: string }
  | { name: 'BlockedAccount'; userOrRegistrationId: string }
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
  const { currentUser, logout, getOrCreateConversation, getUserById } = useApp();

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
      if (home !== null && routeStack.length > 0) {
        setRouteStack((prev) => prev.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [home, routeStack.length]);

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
    (otherUserId: string) => {
      if (!currentUser) return;
      const conversation = getOrCreateConversation(currentUser.id, otherUserId);
      push({ name: 'Chat', conversationId: conversation.id });
    },
    [currentUser, getOrCreateConversation, push]
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
    if (r.reason === 'pending' && r.registration) {
      resetTo({
        name: 'RegistrationPending',
        registrationId: r.registration.id,
      });
    } else if (r.reason === 'rejected' && r.registration) {
      resetTo({
        name: 'RegistrationRejected',
        registrationId: r.registration.id,
      });
    } else if (r.reason === 'blocked' && r.user) {
      resetTo({
        name: 'BlockedAccount',
        userOrRegistrationId: r.user.id,
      });
    }
  };

  // Notification deep-linking: route based on type + relatedId
  const navigateFromNotification = useCallback(
    (type: NotificationType, relatedId?: string) => {
      const role = currentUser?.role;
      if (!role) return;
      switch (type) {
        case 'job_application':
        case 'job_request':
          // Contractor: open the job (its details show candidates)
          if (role === 'contractor' && relatedId)
            push({ name: 'ContractorJobDetails', jobId: relatedId });
          break;
        case 'application_accepted':
        case 'application_rejected':
        case 'job_accepted':
        case 'job_rejected':
          // Worker: open MyApplications (relatedId = applicationId, not used directly)
          if (role === 'worker') setWorkerTab('my-applications');
          resetTo(null);
          break;
        case 'invitation_received':
        case 'invitation_cancelled':
          // Worker: open invitations list
          if (role === 'worker') push({ name: 'WorkerInvitations' });
          break;
        case 'invitation_accepted':
        case 'invitation_declined':
          // Contractor: open sent invitations
          if (role === 'contractor')
            push({ name: 'ContractorSentInvitations' });
          break;
        case 'assignment_cancelled':
          // relatedId = jobId. Worker -> their assignments list;
          // contractor -> that job's staffing screen.
          if (role === 'worker') {
            push({ name: 'WorkerMyAssignments' });
          } else if (role === 'contractor' && relatedId) {
            push({ name: 'ContractorJobStaffing', jobId: relatedId });
          }
          break;
        case 'new_message':
          push({ name: 'Messages' });
          break;
        case 'support_response':
          if (relatedId)
            push({ name: 'SupportTicketDetails', ticketId: relatedId });
          else push({ name: 'SupportTickets' });
          break;
        case 'new_pending_registration':
          if (role === 'admin' && relatedId) {
            push({
              name: 'AdminRegistrationDetails',
              registrationId: relatedId,
            });
          } else if (role === 'admin') {
            setAdminTab('pending-registrations');
            resetTo(null);
          }
          break;
        case 'new_support_ticket':
          if (role === 'admin' && relatedId) {
            push({ name: 'SupportTicketDetails', ticketId: relatedId });
          } else if (role === 'admin') {
            setAdminTab('support-tickets');
            resetTo(null);
          }
          break;
        case 'license_update_submitted':
        case 'license_attention':
          // relatedId = contractorId → open that contractor's admin card
          // (its licence / "בקשת עדכון רישיון" section).
          if (role === 'admin' && relatedId) {
            push({ name: 'AdminUserDetails', userId: relatedId });
          }
          break;
        case 'license_update_approved':
        case 'license_update_rejected':
          // Contractor: land on their own profile, where the licence section
          // reflects the outcome.
          if (role === 'contractor') {
            setContractorTab('profile');
            resetTo(null);
          }
          break;
        case 'license_renewal_requested':
          // Contractor: straight into the profile-edit screen, where the
          // "עדכון רישיון קבלן" area lets them upload the renewed licence.
          if (role === 'contractor') {
            setContractorTab('profile');
            push({ name: 'ContractorProfileEdit' });
          }
          break;
        case 'registration_approved':
        case 'registration_rejected':
        case 'account_blocked':
        case 'account_unblocked':
        case 'review':
        case 'system':
        default:
          // Default: just dismiss the notifications screen
          resetTo(null);
          break;
      }
    },
    [currentUser, push, resetTo]
  );

  // ---- Auth/status screens --------------------------------------------------

  if (route?.name === 'Splash') {
    return <SplashScreen onFinish={() => resetTo({ name: 'Welcome' })} />;
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
    return <ForgotPasswordScreen onBack={goBack} />;
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
  if (route?.name === 'BlockedAccount') {
    const blocked = getUserById(route.userOrRegistrationId);
    return (
      <BlockedAccountScreen
        userOrRegistrationId={route.userOrRegistrationId}
        blockedReason={
          blocked && 'blockedReason' in blocked
            ? blocked.blockedReason
            : undefined
        }
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
  // backend). If the session user's status is 'blocked' — whether they got
  // here somehow at login, or an admin blocked them mid-session and the
  // currentUser state updated — they never see the normal app shells.
  if (currentUser.role !== 'admin' && currentUser.status === 'blocked') {
    return (
      <BlockedAccountScreen
        userOrRegistrationId={currentUser.id}
        blockedReason={currentUser.blockedReason}
        onBackToWelcome={handleLogout}
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
