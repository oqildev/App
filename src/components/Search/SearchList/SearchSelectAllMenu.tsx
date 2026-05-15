import React, {useCallback, useMemo, useRef, useState} from 'react';
import {View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import Checkbox from '@components/Checkbox';
import type {PopoverMenuItem} from '@components/PopoverMenu';
import PopoverMenu from '@components/PopoverMenu';
import {PressableWithFeedback} from '@components/Pressable';
import {useSearchActionsContext, useSearchStateContext} from '@components/Search/SearchContext';
import Text from '@components/Text';
import {useMemoizedLazyExpensifyIcons} from '@hooks/useLazyAsset';
import useLocalize from '@hooks/useLocalize';
import usePopoverPosition from '@hooks/usePopoverPosition';
import useThemeStyles from '@hooks/useThemeStyles';
import CONST from '@src/CONST';

type SearchSelectAllMenuProps = {
    /** Whether the checkbox is in the checked state */
    isSelectAllChecked: boolean;

    /** Whether the checkbox is in the indeterminate state */
    isIndeterminate: boolean;

    /** Number of items currently selected on screen */
    selectedItemsLength: number;

    /** Total selectable items currently loaded */
    totalItems: number;

    /** Whether the narrow-screen "Select all" text button should render */
    shouldShowTextButton: boolean;

    /** Toggles selection of every currently loaded row */
    onAllCheckboxPress: () => void;

    /** Style overrides for the checkbox container */
    checkboxContainerStyle?: StyleProp<ViewStyle>;
};

function SearchSelectAllMenu({
    isSelectAllChecked,
    isIndeterminate,
    selectedItemsLength,
    totalItems,
    shouldShowTextButton,
    onAllCheckboxPress,
    checkboxContainerStyle,
}: SearchSelectAllMenuProps) {
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const expensifyIcons = useMemoizedLazyExpensifyIcons(['Checkmark', 'CheckSquare']);

    const {currentSearchResults} = useSearchStateContext();
    const {selectAllMatchingItems} = useSearchActionsContext();
    const {calculatePopoverPosition} = usePopoverPosition();

    const anchorRef = useRef<View>(null);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{horizontal: number; vertical: number}>({horizontal: 0, vertical: 0});

    const hasMoreResults = !!currentSearchResults?.search?.hasMoreResults;
    const shouldOpenMenu = selectedItemsLength === 0 && hasMoreResults;

    const openMenu = useCallback(() => {
        calculatePopoverPosition(anchorRef, {
            horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.LEFT,
            vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
        }).then((position) => {
            setMenuPosition(position);
            setIsMenuVisible(true);
        });
    }, [calculatePopoverPosition]);

    const closeMenu = useCallback(() => setIsMenuVisible(false), []);

    const handlePress = useCallback(() => {
        if (shouldOpenMenu) {
            openMenu();
            return;
        }
        onAllCheckboxPress();
    }, [shouldOpenMenu, openMenu, onAllCheckboxPress]);

    const menuItems = useMemo(
        (): PopoverMenuItem[] => [
            {
                icon: expensifyIcons.Checkmark,
                text: translate('search.exportAll.selectAllOnThisPage'),
                onSelected: onAllCheckboxPress,
            },
            {
                icon: expensifyIcons.CheckSquare,
                text: translate('workspace.people.selectAll'),
                onSelected: () => selectAllMatchingItems(true),
            },
        ],
        [expensifyIcons.Checkmark, expensifyIcons.CheckSquare, translate, onAllCheckboxPress, selectAllMatchingItems],
    );

    return (
        <>
            <View ref={anchorRef}>
                <Checkbox
                    accessibilityLabel={translate('accessibilityHints.selectAllItems')}
                    isChecked={isSelectAllChecked}
                    isIndeterminate={isIndeterminate}
                    onPress={handlePress}
                    disabled={totalItems === 0}
                    containerStyle={[styles.m0, checkboxContainerStyle]}
                    sentryLabel={CONST.SENTRY_LABEL.SEARCH.SELECT_ALL_CHECKBOX}
                />
            </View>
            {shouldShowTextButton && (
                <PressableWithFeedback
                    style={[styles.userSelectNone, styles.alignItemsCenter]}
                    onPress={handlePress}
                    accessibilityLabel={translate('accessibilityHints.selectAllItems')}
                    role="button"
                    accessibilityState={{checked: isSelectAllChecked}}
                    sentryLabel={CONST.SENTRY_LABEL.SEARCH.SELECT_ALL_BUTTON}
                    dataSet={{[CONST.SELECTION_SCRAPER_HIDDEN_ELEMENT]: true}}
                >
                    <Text style={[styles.textMicroSupporting, styles.ph3]}>{translate('workspace.people.selectAll')}</Text>
                </PressableWithFeedback>
            )}
            <PopoverMenu
                isVisible={isMenuVisible}
                onClose={closeMenu}
                onItemSelected={closeMenu}
                menuItems={menuItems}
                anchorRef={anchorRef}
                anchorPosition={menuPosition}
                anchorAlignment={{
                    horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.LEFT,
                    vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.TOP,
                }}
            />
        </>
    );
}

SearchSelectAllMenu.displayName = 'SearchSelectAllMenu';

export default SearchSelectAllMenu;
