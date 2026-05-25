import type {ParamListBase} from '@react-navigation/native';
import React, {useEffect} from 'react';
import {View} from 'react-native';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import SidebarLeftIcon from '@assets/images/sidebar-left.svg';
import SidebarRightIcon from '@assets/images/sidebar-right.svg';
import Hoverable from '@components/Hoverable';
import Icon from '@components/Icon';
import {PressableWithoutFeedback} from '@components/Pressable';
import {useSearchActionsContext, useSearchStateContext} from '@components/Search/SearchContext';
import useLoadingBarVisibility from '@hooks/useLoadingBarVisibility';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import type {PlatformStackNavigationState} from '@libs/Navigation/PlatformStackNavigation/types';
import SearchTypeMenuWide from '@pages/Search/SearchTypeMenuWide';
import variables from '@styles/variables';
import CONST from '@src/CONST';
import SCREENS from '@src/SCREENS';
import {useSearchSidebarCollapse} from './SearchSidebarCollapseStore';
import TopBar from './TopBar';

type SearchSidebarProps = {
    state: PlatformStackNavigationState<ParamListBase>;
};

function SearchSidebar({state}: SearchSidebarProps) {
    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const theme = useTheme();
    const {isOffline} = useNetwork();
    const shouldShowLoadingBarForReports = useLoadingBarVisibility();
    const {shouldUseNarrowLayout} = useResponsiveLayout();
    const {collapseProgress, peekProgress, isCollapsed, toggleSidebar, startPeek, endPeek} = useSearchSidebarCollapse();

    const route = state.routes.at(-1);
    const {lastSearchType, currentSearchResults, currentSearchQueryJSON} = useSearchStateContext();
    const {setLastSearchType} = useSearchActionsContext();

    const searchType = currentSearchResults?.search?.type;
    const isSearchLoading = currentSearchResults?.search?.isLoading;

    useEffect(() => {
        if (!searchType) {
            return;
        }

        setLastSearchType(searchType);
    }, [lastSearchType, setLastSearchType, searchType]);

    // Layout spacer: width tracks ONLY collapseProgress so the content marginLeft animates
    // with the toggle, not the peek.
    const layoutSpacerStyle = useAnimatedStyle(() => {
        const progress = collapseProgress.get();
        return {
            width: variables.sideBarWithLHBWidth + (variables.searchSidebarCollapsedWidth - variables.sideBarWithLHBWidth) * progress,
        };
    });

    // Visual overlay: width tracks visualExpansion (collapseProgress + peekProgress) so peek
    // grows the visible sidebar without pushing the central content.
    const overlayAnimatedStyle = useAnimatedStyle(() => {
        const visualExpansion = 1 - collapseProgress.get() * (1 - peekProgress.get());
        return {
            width: variables.searchSidebarCollapsedWidth + (variables.sideBarWithLHBWidth - variables.searchSidebarCollapsedWidth) * visualExpansion,
        };
    });

    // Nudge the chevron toward the rail's horizontal center as we collapse, so it doesn't hang
    // off the right edge of the 76px rail.
    const chevronContainerAnimatedStyle = useAnimatedStyle(() => {
        const visualExpansion = 1 - collapseProgress.get() * (1 - peekProgress.get());
        return {transform: [{translateX: -10 * (1 - visualExpansion)}]};
    });

    const breadcrumbAnimatedStyle = useAnimatedStyle(() => {
        const visualExpansion = 1 - collapseProgress.get() * (1 - peekProgress.get());
        return {
            opacity: visualExpansion,
            transform: [{translateX: -8 * (1 - visualExpansion)}],
        };
    });

    const shouldShowLoadingState = route?.name === SCREENS.RIGHT_MODAL.SEARCH_MONEY_REQUEST_REPORT ? false : !isOffline && !!isSearchLoading;

    if (shouldUseNarrowLayout) {
        return null;
    }

    const toggleButton = (
        <Animated.View style={chevronContainerAnimatedStyle}>
            <PressableWithoutFeedback
                accessibilityLabel="Toggle sidebar"
                onPress={toggleSidebar}
                sentryLabel={CONST.SENTRY_LABEL.TOP_BAR.CANCEL_BUTTON}
                style={[styles.p2, styles.br2]}
            >
                <Icon
                    src={isCollapsed ? SidebarRightIcon : SidebarLeftIcon}
                    width={variables.iconSizeNormal}
                    height={variables.iconSizeNormal}
                    fill={theme.icon}
                />
            </PressableWithoutFeedback>
        </Animated.View>
    );

    return (
        <Animated.View style={[{height: '100%'}, layoutSpacerStyle]}>
            <Hoverable
                onHoverIn={startPeek}
                onHoverOut={endPeek}
            >
                <Animated.View style={[styles.searchSidebar, overlayAnimatedStyle, {position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 1}]}>
                    <View style={styles.flex1}>
                        <TopBar
                            shouldShowLoadingBar={shouldShowLoadingState || shouldShowLoadingBarForReports}
                            breadcrumbLabel={translate('common.spend')}
                            breadcrumbAnimatedStyle={breadcrumbAnimatedStyle}
                            shouldDisplaySearch={false}
                            shouldDisplayHelpButton={false}
                        >
                            {toggleButton}
                        </TopBar>
                        <SearchTypeMenuWide queryJSON={currentSearchQueryJSON} />
                    </View>
                </Animated.View>
            </Hoverable>
        </Animated.View>
    );
}

export default SearchSidebar;
