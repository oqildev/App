import {useRoute} from '@react-navigation/native';
import React, {useCallback, useContext, useLayoutEffect, useRef} from 'react';
import {View} from 'react-native';
// eslint-disable-next-line no-restricted-imports
import type {ScrollView as RNScrollView, ScrollViewProps} from 'react-native';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {collapseProgress, peekProgress, useSearchSidebarCollapse} from '@components/Navigation/SearchSidebarCollapseStore';
import {ScrollOffsetContext} from '@components/ScrollOffsetContextProvider';
import ScrollView from '@components/ScrollView';
import {useSearchActionsContext} from '@components/Search/SearchContext';
import type {SearchQueryJSON} from '@components/Search/types';
import Text from '@components/Text';
import {useMemoizedLazyExpensifyIcons} from '@hooks/useLazyAsset';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useOnyx from '@hooks/useOnyx';
import useSearchTypeMenuSections from '@hooks/useSearchTypeMenuSections';
import useSingleExecution from '@hooks/useSingleExecution';
import useThemeStyles from '@hooks/useThemeStyles';
import {setSearchContext} from '@libs/actions/Search';
import Navigation from '@libs/Navigation/Navigation';
import {getItemBadgeText} from '@libs/SearchUIUtils';
import type {SearchTypeMenuSection} from '@libs/SearchUIUtils';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import todosReportCountsSelector from '@src/selectors/Todos';
import isLoadingOnyxValue from '@src/types/utils/isLoadingOnyxValue';
import SavedSearchList from './SavedSearchList';
import SearchTypeMenuItem from './SearchTypeMenuItem';
import SuggestedSearchSkeleton from './SuggestedSearchSkeleton';

type SearchTypeMenuProps = {
    queryJSON: SearchQueryJSON | undefined;
};

function SectionHeader({title}: {title: string}) {
    const styles = useThemeStyles();

    // Label fades + slides out as the sidebar collapses; opacite is mirrored on the divider.
    const labelAnimatedStyle = useAnimatedStyle(() => {
        const visualExpansion = 1 - collapseProgress.get() * (1 - peekProgress.get());
        return {
            opacity: visualExpansion,
            transform: [{translateX: -8 * (1 - visualExpansion)}],
        };
    });

    const dividerAnimatedStyle = useAnimatedStyle(() => {
        const visualExpansion = 1 - collapseProgress.get() * (1 - peekProgress.get());
        return {
            opacity: 1 - visualExpansion,
        };
    });

    return (
        <View style={{position: 'relative'}}>
            <Animated.View style={labelAnimatedStyle}>
                <Text
                    style={styles.sectionTitle}
                    accessibilityRole={CONST.ROLE.HEADER}
                    numberOfLines={1}
                >
                    {title}
                </Text>
            </Animated.View>
            <Animated.View
                style={[{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 8}, dividerAnimatedStyle]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
            >
                <View style={styles.borderTop} />
            </Animated.View>
        </View>
    );
}

function SearchTypeMenuWide({queryJSON}: SearchTypeMenuProps) {
    const {hash, similarSearchHash, sortBy, sortOrder, type} = queryJSON ?? {};

    const styles = useThemeStyles();
    const {isOffline} = useNetwork();
    const {translate} = useLocalize();
    const {singleExecution} = useSingleExecution();
    const {typeMenuSections, activeItemIndex} = useSearchTypeMenuSections({hash, similarSearchHash, sortBy, sortOrder, type});
    const expensifyIcons = useMemoizedLazyExpensifyIcons([
        'Basket',
        'CalendarSolid',
        'Receipt',
        'MoneyBag',
        'CreditCard',
        'MoneyHourglass',
        'CreditCardHourglass',
        'Bank',
        'User',
        'Folder',
        'Document',
        'Pencil',
        'ThumbsUp',
        'CheckCircle',
    ]);
    const {clearSelectedTransactions} = useSearchActionsContext();
    const {isVisuallyCollapsed} = useSearchSidebarCollapse();
    const [isSearchDataLoaded, isSearchDataLoadedResult] = useOnyx(ONYXKEYS.IS_SEARCH_PAGE_DATA_LOADED);
    const [reportCounts = CONST.EMPTY_TODOS_REPORT_COUNTS] = useOnyx(ONYXKEYS.DERIVED.TODOS, {selector: todosReportCountsSelector});

    const route = useRoute();
    const scrollViewRef = useRef<RNScrollView>(null);
    const {saveScrollOffset, getScrollOffset} = useContext(ScrollOffsetContext);
    const onScroll = useCallback<NonNullable<ScrollViewProps['onScroll']>>(
        (e) => {
            // If the layout measurement is 0, it means the flash list is not displayed but the onScroll may be triggered with offset value 0.
            // We should ignore this case.
            if (e.nativeEvent.layoutMeasurement.height === 0) {
                return;
            }
            saveScrollOffset(route, e.nativeEvent.contentOffset.y);
        },
        [route, saveScrollOffset],
    );

    useLayoutEffect(() => {
        const scrollOffset = getScrollOffset(route);
        if (!scrollOffset || !scrollViewRef.current) {
            return;
        }
        scrollViewRef.current.scrollTo({y: scrollOffset, animated: false});
    }, [getScrollOffset, route]);

    const sectionStartIndices = [0];
    for (const section of typeMenuSections) {
        sectionStartIndices.push((sectionStartIndices.at(-1) ?? 0) + section.menuItems.length);
    }
    const expenseReportsSection = typeMenuSections.find((section) => section.translationPath === 'search.tabs.expenseReports');
    const nonExpenseReportsSections = typeMenuSections.filter((section) => section.translationPath !== 'search.tabs.expenseReports');

    const handleTypeMenuItemPress = singleExecution((searchQuery: string) => {
        clearSelectedTransactions();
        setSearchContext(false);
        Navigation.navigate(ROUTES.SEARCH_ROOT.getRoute({query: searchQuery}));
    });

    const areSuggestedSearchesLoading = !isOffline && !isSearchDataLoaded && !isLoadingOnyxValue(isSearchDataLoadedResult);

    const renderSection = (section: SearchTypeMenuSection, sectionIndex: number) => {
        const isSavedSearchSection = section.translationPath === 'search.savedSearchesMenuItemTitle';
        // SavedSearchList renders full MenuItemList rows that have no collapsed-mode rendering,
        // so they'd overflow / clip behind the 76px rail. Skip the entire section in that case
        // — users can hover-peek or expand to access saved searches.
        if (isSavedSearchSection && isVisuallyCollapsed) {
            return null;
        }
        return (
            <View key={section.translationPath}>
                <SectionHeader title={translate(section.translationPath)} />

                {isSavedSearchSection ? (
                    <SavedSearchList hash={hash} />
                ) : (
                    <>
                        {section.menuItems.map((item, itemIndex) => {
                            const flattenedIndex = (sectionStartIndices?.at(sectionIndex) ?? 0) + itemIndex;
                            const focused = activeItemIndex === flattenedIndex;
                            const icon = typeof item.icon === 'string' ? expensifyIcons[item.icon] : item.icon;

                            return (
                                <SearchTypeMenuItem
                                    key={item.key}
                                    title={translate(item.translationPath)}
                                    icon={icon}
                                    badgeText={getItemBadgeText(item.key, reportCounts)}
                                    focused={focused}
                                    onPress={() => handleTypeMenuItemPress(item.searchQuery)}
                                />
                            );
                        })}
                    </>
                )}
            </View>
        );
    };

    return (
        <ScrollView
            onScroll={onScroll}
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
        >
            <View style={[styles.pb4, styles.mh3, styles.gap4]}>
                {!!expenseReportsSection && renderSection(expenseReportsSection, 0)}

                {areSuggestedSearchesLoading ? (
                    <SuggestedSearchSkeleton sectionCount={nonExpenseReportsSections.length || 2} />
                ) : (
                    nonExpenseReportsSections.map((section, index) => renderSection(section, index + (expenseReportsSection ? 1 : 0)))
                )}
            </View>
        </ScrollView>
    );
}

export default SearchTypeMenuWide;
