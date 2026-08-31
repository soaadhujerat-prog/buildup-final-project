import React from 'react';
import { StyleProp, ViewStyle, ImageStyle } from 'react-native';
import WorkerAvatar from './WorkerAvatar';
import ContractorAvatar from './ContractorAvatar';
import type { Admin, Contractor, Worker } from '../types';

type ChatParty = Worker | Contractor | Admin;

interface Props {
  /** The person on the other side of the conversation, resolved from the
   *  AppContext user list. `undefined` only while data is loading / a user
   *  can't be found. */
  user: ChatParty | undefined;
  size: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
}

/** The single way BuildUp's messaging UI draws the other party's face —
 *  used identically in the conversations list and the chat header, on both
 *  the worker and the contractor side.
 *
 *  contractor → ContractorAvatar (uploaded logo/photo, else the building
 *  mark). everyone else (worker, admin, or an unresolved user) → WorkerAvatar
 *  (real photo, else initials on a deterministic colour).
 *
 *  There is deliberately NO tool/hammer icon here: a trade is not a person's
 *  identity, and the old messaging screens using one was the bug this
 *  component removes. */
const ChatAvatar: React.FC<Props> = ({ user, size, style }) => {
  if (user?.role === 'contractor') {
    return <ContractorAvatar contractor={user} size={size} style={style} />;
  }
  return (
    <WorkerAvatar
      worker={user ?? { id: 'unknown', fullName: 'משתמש' }}
      size={size}
      style={style}
    />
  );
};

export default ChatAvatar;
