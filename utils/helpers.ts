export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
  });
};

/** For conversation-list / chat timestamps — never show a raw ISO string.
 *  Today → "HH:mm", yesterday → "אתמול", anything older → "DD/MM/YYYY". */
export const formatConversationTime = (isoString: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'אתמול';

  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const formatCurrency = (amount: number): string => {
  return `${amount.toLocaleString('he-IL')} ₪`;
};

export const getInitials = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  return name[0] || '?';
};

export const getRatingStars = (rating: number): string => {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
};

export const getMatchColor = (score: number): string => {
  if (score >= 85) return '#22C55E';
  if (score >= 65) return '#F97316';
  return '#EF4444';
};

export const getMatchLabel = (score: number): string => {
  if (score >= 85) return 'התאמה מצוינת';
  if (score >= 70) return 'התאמה טובה';
  if (score >= 50) return 'התאמה בינונית';
  return 'התאמה חלשה';
};

export const getRequestStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'ממתין',
    accepted: 'אושר',
    rejected: 'נדחה',
    withdrawn: 'בוטל',
  };
  return labels[status] || status;
};

export const getNotificationIcon = (type: string): string => {
  const icons: Record<string, string> = {
    job_request: 'briefcase',
    job_accepted: 'checkmark-circle',
    job_rejected: 'close-circle',
    new_message: 'chatbubble',
    review: 'star',
    system: 'information-circle',
  };
  return icons[type] || 'notifications';
};

export const getTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'עכשיו';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return formatShortDate(dateString);
};

export const getAvatarBackground = (name: string): string => {
  const colors = [
    '#F97316', '#1E3A5F', '#22C55E', '#3B82F6',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};
