import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontSize, Radius, Spacing } from '../theme/colors';
import { JobPost } from '../types';
import { jobProfessions } from '../utils/normalize';

interface Props {
  visible: boolean;
  jobs: JobPost[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
  onClose: () => void;
}

/** "בחר משרה" — a plain single-select sheet, replacing the old cramped
 *  horizontal chip carousel. */
const SmartMatchJobPicker: React.FC<Props> = ({
  visible,
  jobs,
  selectedJobId,
  onSelect,
  onClose,
}) => {
  const pick = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>בחר משרה</Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {jobs.map((j) => {
              const active = j.id === selectedJobId;
              return (
                <TouchableOpacity
                  key={j.id}
                  style={styles.row}
                  onPress={() => pick(j.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowBody}>
                    <Text
                      style={[styles.rowTitle, active && styles.rowTitleActive]}
                      numberOfLines={1}
                    >
                      {j.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {jobProfessions(j).join(' · ')} · {j.city}
                    </Text>
                  </View>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? Colors.primary : Colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    maxHeight: '72%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.xs,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowTitleActive: { color: Colors.primaryDark },
  rowMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default SmartMatchJobPicker;
