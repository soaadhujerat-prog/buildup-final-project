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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
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
import RegistrationPendingScreen from '../screens/RegistrationPendingScreen';
import RegistrationRejectedScreen from '../screens/RegistrationRejectedScreen';
import BlockedAccountScreen from '../screens/BlockedAccountScreen';

// Worker
import WorkerDashboard from '../screens/WorkerDashboard';
import AvailableJobsScreen from '../screens/AvailableJobsScreen';
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
import WorkerProfileScreen from '../screens/WorkerProfileScreen';
import SmartMatchScreen from '../screens/SmartMatchScreen';
import ContractorProfileScreen from '../screens/ContractorProfileScreen';

// Admin
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import PendingRegistrationsScreen from '../screens/PendingRegistrationsScreen';
import RegistrationDetailsScreen from '../screens/RegistrationDetailsScreen';
import UserManagementScreen from '../screens/UserManagementScreen';
import AdminUserDetailsScreen from '../screens/AdminUserDetailsScreen';

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
  | { name: 'RegistrationPending'; registrationId: string }
  | { name: 'RegistrationRejected'; registrationId: string }
  | { name: 'BlockedAccount'; userOrRegistrationId: string }
  // Worker drilldowns (Tab is implicit via WorkerTab state)
  | { name: 'WorkerJobDetails'; jobId: string }
  | { name: 'WorkerInvitations' }
  | { name: 'WorkerMyAssignments' }
  | { name: 'WorkerAvailability' }
  | { name: 'WorkerProfileEdit' }
  // Contractor drilldowns
  | { name: 'ContractorPostJob' }
  | { name: 'ContractorJobDetails'; jobId: string }
  | { name: 'ContractorSearchWorkers' }
  | { name: 'ContractorWorkerProfile'; workerId: string }
  | { name: 'ContractorSmartMatch'; initialJobId?: string }
  | { name: 'ContractorSentInvitations' }
  // Admin drilldowns
  | { name: 'AdminRegistrationDetails'; registrationId: string }
  | { name: 'AdminUserDetails'; userId: string }
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
  const { currentUser, logout } = useApp();

  const [route, setRoute] = useState<Route | null>(null); // null = on a tab
  const [home, setHome] = useState<RoleHome | null>(null);
  const [workerTab, setWorkerTab] = useState<WorkerTab>('dashboard');
  const [contractorTab, setContractorTab] =
    useState<ContractorTab>('dashboard');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  // Auth fallback: when currentUser changes, route into the correct shell
  useEffect(() => {
    if (!currentUser) {
      // logged out — only push to Welcome if we're already past Splash/auth
      if (home !== null) {
        setHome(null);
        setRoute({ name: 'Welcome' });
      }
      return;
    }
    if (currentUser.role === 'admin') {
      setHome({ kind: 'admin' });
      setRoute(null);
      setAdminTab('dashboard');
    } else if (currentUser.role === 'contractor') {
      setHome({ kind: 'contractor' });
      setRoute(null);
      setContractorTab('dashboard');
    } else if (currentUser.role === 'worker') {
      setHome({ kind: 'worker' });
      setRoute(null);
      setWorkerTab('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Initial route = Splash (kicks off the app)
  useEffect(() => {
    if (route === null && home === null) {
      setRoute({ name: 'Splash' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Helpers ----------------------------------------------------------------

  const goWelcome = useCallback(() => {
    setHome(null);
    setRoute({ name: 'Welcome' });
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    goWelcome();
  }, [logout, goWelcome]);

  const handleLoginResult = (r: LoginResult) => {
    if (r.ok && r.user) {
      // useEffect on currentUser will route into the right home shell
      return;
    }
    if (r.reason === 'pending' && r.registration) {
      setRoute({
        name: 'RegistrationPending',
        registrationId: r.registration.id,
      });
    } else if (r.reason === 'rejected' && r.registration) {
      setRoute({
        name: 'RegistrationRejected',
        registrationId: r.registration.id,
      });
    } else if (r.reason === 'blocked' && r.user) {
      setRoute({
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
            setRoute({ name: 'ContractorJobDetails', jobId: relatedId });
          break;
        case 'application_accepted':
        case 'application_rejected':
        case 'job_accepted':
        case 'job_rejected':
          // Worker: open MyApplications (relatedId = applicationId, not used directly)
          if (role === 'worker') setWorkerTab('my-applications');
          setRoute(null);
          break;
        case 'invitation_received':
          // Worker: open invitations list
          if (role === 'worker') setRoute({ name: 'WorkerInvitations' });
          break;
        case 'invitation_accepted':
        case 'invitation_declined':
          // Contractor: open sent invitations
          if (role === 'contractor')
            setRoute({ name: 'ContractorSentInvitations' });
          break;
        case 'new_message':
          setRoute({ name: 'Messages' });
          break;
        case 'support_response':
          if (relatedId)
            setRoute({ name: 'SupportTicketDetails', ticketId: relatedId });
          else setRoute({ name: 'SupportTickets' });
          break;
        case 'new_pending_registration':
          if (role === 'admin' && relatedId)
            setRoute({
              name: 'AdminRegistrationDetails',
              registrationId: relatedId,
            });
          else if (role === 'admin') setAdminTab('pending-registrations');
          break;
        case 'new_support_ticket':
          if (role === 'admin' && relatedId)
            setRoute({ name: 'SupportTicketDetails', ticketId: relatedId });
          else if (role === 'admin') setAdminTab('support-tickets');
          break;
        case 'registration_approved':
        case 'registration_rejected':
        case 'account_blocked':
        case 'account_unblocked':
        case 'review':
        case 'system':
        default:
          // Default: just dismiss the notifications screen
          setRoute(null);
          break;
      }
    },
    [currentUser]
  );

  // ---- Auth/status screens --------------------------------------------------

  if (route?.name === 'Splash') {
    return <SplashScreen onFinish={() => setRoute({ name: 'Welcome' })} />;
  }
  if (route?.name === 'Welcome') {
    return (
      <WelcomeScreen
        onLogin={(role) => setRoute({ name: 'Login', role })}
        onSignUp={(role) => setRoute({ name: 'SignUp', role })}
        onAdminLogin={() => setRoute({ name: 'AdminLogin' })}
      />
    );
  }
  if (route?.name === 'Login') {
    return (
      <LoginScreen
        role={route.role}
        onLoginResult={handleLoginResult}
        onBack={goWelcome}
        onGoSignUp={() => setRoute({ name: 'SignUp', role: route.role })}
      />
    );
  }
  if (route?.name === 'SignUp') {
    return (
      <SignUpScreen
        role={route.role}
        onRegistered={(registrationId) =>
          setRoute({ name: 'RegistrationPending', registrationId })
        }
        onBack={goWelcome}
        onGoLogin={() => setRoute({ name: 'Login', role: route.role })}
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
    return (
      <BlockedAccountScreen
        userOrRegistrationId={route.userOrRegistrationId}
        onBackToWelcome={goWelcome}
      />
    );
  }

  // ---- Need a logged-in role to render any role shell -----------------------
  if (!currentUser || home === null) {
    // Should be impossible after auth flow, but guard
    return null;
  }

  // ---- Drilldown routes (overlay on top of current home) --------------------

  if (route !== null) {
    switch (route.name) {
      // Worker
      case 'WorkerJobDetails':
        return (
          <JobDetailsScreen
            jobId={route.jobId}
            onBack={() => setRoute(null)}
            onOpenWorkerProfile={() => {
              /* worker viewing job — N/A */
            }}
            onOpenSmartMatchForJob={() => {
              /* contractor-only */
            }}
          />
        );
      case 'WorkerInvitations':
        return (
          <WorkerInvitationsScreen
            onBack={() => setRoute(null)}
            onOpenJobDetails={(jobId) =>
              setRoute({ name: 'WorkerJobDetails', jobId })
            }
          />
        );
      case 'WorkerMyAssignments':
        return (
          <MyAssignmentsScreen
            onBack={() => setRoute(null)}
            onOpenJobDetails={(jobId) =>
              setRoute({ name: 'WorkerJobDetails', jobId })
            }
          />
        );
      case 'WorkerAvailability':
        return <AvailabilityManagementScreen onBack={() => setRoute(null)} />;
      case 'WorkerProfileEdit':
        return <WorkerProfileEditScreen onBack={() => setRoute(null)} />;

      // Contractor
      case 'ContractorPostJob':
        return (
          <PostJobScreen
            onBack={() => setRoute(null)}
            onPosted={(jobId) =>
              setRoute({ name: 'ContractorJobDetails', jobId })
            }
          />
        );
      case 'ContractorJobDetails':
        return (
          <JobDetailsScreen
            jobId={route.jobId}
            onBack={() => setRoute(null)}
            onOpenWorkerProfile={(workerId) =>
              setRoute({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenSmartMatchForJob={(jobId) =>
              setRoute({ name: 'ContractorSmartMatch', initialJobId: jobId })
            }
            onOpenSentInvitations={() =>
              setRoute({ name: 'ContractorSentInvitations' })
            }
          />
        );
      case 'ContractorSearchWorkers':
        return (
          <SearchWorkersScreen
            onBack={() => setRoute(null)}
            onOpenWorkerProfile={(workerId) =>
              setRoute({ name: 'ContractorWorkerProfile', workerId })
            }
          />
        );
      case 'ContractorWorkerProfile':
        return (
          <WorkerProfileScreen
            workerId={route.workerId}
            onBack={() => setRoute(null)}
            onOpenJobDetails={(jobId) =>
              setRoute({ name: 'ContractorJobDetails', jobId })
            }
          />
        );
      case 'ContractorSmartMatch':
        return (
          <SmartMatchScreen
            initialJobId={route.initialJobId}
            onBack={() => setRoute(null)}
            onOpenWorkerProfile={(workerId) =>
              setRoute({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenJobDetails={(jobId) =>
              setRoute({ name: 'ContractorJobDetails', jobId })
            }
          />
        );
      case 'ContractorSentInvitations':
        return (
          <SentInvitationsScreen
            onBack={() => setRoute(null)}
            onOpenWorkerProfile={(workerId) =>
              setRoute({ name: 'ContractorWorkerProfile', workerId })
            }
            onOpenJobDetails={(jobId) =>
              setRoute({ name: 'ContractorJobDetails', jobId })
            }
          />
        );

      // Admin
      case 'AdminRegistrationDetails':
        return (
          <RegistrationDetailsScreen
            registrationId={route.registrationId}
            onBack={() => setRoute(null)}
          />
        );
      case 'AdminUserDetails':
        return (
          <AdminUserDetailsScreen
            userId={route.userId}
            onBack={() => setRoute(null)}
          />
        );

      // Shared
      case 'Messages':
        return (
          <MessagesScreen
            onBack={() => setRoute(null)}
            onOpenConversation={(conversationId) =>
              setRoute({ name: 'Chat', conversationId })
            }
          />
        );
      case 'Chat':
        return (
          <ChatScreen
            conversationId={route.conversationId}
            onBack={() => setRoute({ name: 'Messages' })}
          />
        );
      case 'Notifications':
        return (
          <NotificationsScreen
            onBack={() => setRoute(null)}
            onNavigate={navigateFromNotification}
          />
        );
      case 'SupportTickets':
        return (
          <SupportTicketsScreen
            onBack={() => setRoute(null)}
            onOpenTicket={(ticketId) =>
              setRoute({ name: 'SupportTicketDetails', ticketId })
            }
            onOpenNewTicket={
              currentUser.role !== 'admin'
                ? () => setRoute({ name: 'OpenSupportTicket' })
                : undefined
            }
          />
        );
      case 'SupportTicketDetails':
        return (
          <SupportTicketDetailsScreen
            ticketId={route.ticketId}
            onBack={() => setRoute({ name: 'SupportTickets' })}
          />
        );
      case 'OpenSupportTicket':
        return (
          <OpenSupportTicketScreen
            onBack={() => setRoute({ name: 'SupportTickets' })}
            onSubmitted={(ticketId) =>
              setRoute({ name: 'SupportTicketDetails', ticketId })
            }
          />
        );
      case 'Settings':
        return (
          <SettingsScreen
            onBack={() => setRoute(null)}
            onEditProfile={
              currentUser.role === 'worker'
                ? () => setRoute({ name: 'WorkerProfileEdit' })
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
        navigate={setRoute}
        onLogout={handleLogout}
      />
    );
  }
  if (home.kind === 'contractor') {
    return (
      <ContractorHome
        tab={contractorTab}
        setTab={setContractorTab}
        navigate={setRoute}
        onLogout={handleLogout}
      />
    );
  }
  if (home.kind === 'admin') {
    return (
      <AdminHome
        tab={adminTab}
        setTab={setAdminTab}
        navigate={setRoute}
        onLogout={handleLogout}
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
}> = ({ tab, setTab, navigate, onLogout }) => {
  const body = useMemo(() => {
    switch (tab) {
      case 'dashboard':
        return (
          <AdminDashboardScreen
            onOpenPendingRegistrations={() => setTab('pending-registrations')}
            onOpenUserManagement={(filter) => {
              void filter;
              setTab('user-management');
            }}
            onOpenSupportTickets={() => setTab('support-tickets')}
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
  }, [tab, setTab, navigate, onLogout]);

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
        onChange={(k) => setTab(k as AdminTab)}
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
