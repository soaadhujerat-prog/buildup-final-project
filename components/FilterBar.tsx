import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { PROFESSION_CATEGORIES, CITIES_ISRAEL } from '../data/mockData';

interface FilterBarProps {
  onFilterChange: (filters: {
    profession: string;
    city: string;
    availableOnly: boolean;
  }) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ onFilterChange }) => {
  const [selectedProfession, setSelectedProfession] = useState('כל המקצועות');
  const [selectedCity, setSelectedCity] = useState('כל הערים');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [showProfessionModal, setShowProfessionModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);

  const applyFilter = (
    profession = selectedProfession,
    city = selectedCity,
    available = availableOnly
  ) => {
    onFilterChange({
      profession,
      city,
      availableOnly: available,
    });
  };

  const selectProfession = (p: string) => {
    setSelectedProfession(p);
    setShowProfessionModal(false);
    applyFilter(p, selectedCity, availableOnly);
  };

  const selectCity = (c: string) => {
    setSelectedCity(c);
    setShowCityModal(false);
    applyFilter(selectedProfession, c, availableOnly);
  };

  const toggleAvailable = () => {
    const next = !availableOnly;
    setAvailableOnly(next);
    applyFilter(selectedProfession, selectedCity, next);
  };

  const clearAll = () => {
    setSelectedProfession('כל המקצועות');
    setSelectedCity('כל הערים');
    setAvailableOnly(false);
    onFilterChange({
      profession: 'כל המקצועות',
      city: 'כל הערים',
      availableOnly: false,
    });
  };

  const hasFilters =
    selectedProfession !== 'כל המקצועות' ||
    selectedCity !== 'כל הערים' ||
    availableOnly;

  const isActiveProfession = selectedProfession !== 'כל המקצועות';
  const isActiveCity = selectedCity !== 'כל הערים';

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              isActiveProfession && styles.filterChipActive,
            ]}
            onPress={() => setShowProfessionModal(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterText,
                isActiveProfession && styles.filterTextActive,
              ]}
            >
              {isActiveProfession ? selectedProfession : 'מקצוע'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={isActiveProfession ? Colors.white : Colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, isActiveCity && styles.filterChipActive]}
            onPress={() => setShowCityModal(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterText,
                isActiveCity && styles.filterTextActive,
              ]}
            >
              {isActiveCity ? selectedCity : 'עיר'}
            </Text>
            <Ionicons
              name="location-outline"
              size={16}
              color={isActiveCity ? Colors.white : Colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              availableOnly && styles.filterChipActive,
            ]}
            onPress={toggleAvailable}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterText,
                availableOnly && styles.filterTextActive,
              ]}
            >
              זמינים עכשיו
            </Text>
            <Ionicons
              name={
                availableOnly
                  ? 'checkmark-circle'
                  : 'checkmark-circle-outline'
              }
              size={16}
              color={availableOnly ? Colors.white : Colors.textSecondary}
            />
          </TouchableOpacity>

          {hasFilters && (
            <TouchableOpacity
              style={styles.resetChip}
              onPress={clearAll}
              activeOpacity={0.7}
            >
              <Text style={styles.resetText}>נקה</Text>
              <Ionicons name="close" size={14} color={Colors.danger} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <Modal visible={showProfessionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowProfessionModal(false)}
          />

          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>בחר מקצוע</Text>

            <ScrollView>
              {PROFESSION_CATEGORIES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.modalItem,
                    p === selectedProfession && styles.modalItemSelected,
                  ]}
                  onPress={() => selectProfession(p)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      p === selectedProfession && styles.modalItemTextSelected,
                    ]}
                  >
                    {p}
                  </Text>

                  {p === selectedProfession && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={Colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showCityModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCityModal(false)}
          />

          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>בחר עיר</Text>

            <ScrollView>
              {CITIES_ISRAEL.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.modalItem,
                    c === selectedCity && styles.modalItemSelected,
                  ]}
                  onPress={() => selectCity(c)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      c === selectedCity && styles.modalItemTextSelected,
                    ]}
                  >
                    {c}
                  </Text>

                  {c === selectedCity && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={Colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },

  scroll: {
    minWidth: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },

  filterChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  filterText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  filterTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  resetChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    backgroundColor: Colors.danger + '10',
  },

  resetText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },

  modalBackdrop: {
    flex: 1,
  },

  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    maxHeight: '70%',
  },

  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.gray300,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },

  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  modalItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  modalItemSelected: {
    backgroundColor: Colors.primaryFaint,
  },

  modalItemText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  modalItemTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
});

export default FilterBar;