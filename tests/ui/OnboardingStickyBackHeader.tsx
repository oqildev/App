import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import OnyxListItemProvider from '@components/OnyxListItemProvider';

import {CurrentReportIDContextProvider} from '@hooks/useCurrentReportID';
import * as useResponsiveLayoutModule from '@hooks/useResponsiveLayout';
import type ResponsiveLayoutResult from '@hooks/useResponsiveLayout/types';

import * as Browser from '@libs/Browser';
import OnboardingModalNavigatorContentWrapper from '@libs/Navigation/AppNavigator/Navigators/OnboardingModalNavigatorContentWrapper';
import Navigation from '@libs/Navigation/Navigation';

import BaseOnboardingAccounting from '@pages/OnboardingAccounting/BaseOnboardingAccounting';
import BaseOnboardingInterestedFeatures from '@pages/OnboardingInterestedFeatures/BaseOnboardingInterestedFeatures';
import BaseOnboardingPurpose from '@pages/OnboardingPurpose/BaseOnboardingPurpose';

import type {OnboardingModalNavigatorParamList} from '@src/libs/Navigation/types';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import SCREENS from '@src/SCREENS';

import type {ValueOf} from 'type-fest';

import {createNavigationContainerRef, NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import React from 'react';
import {View} from 'react-native';
import Onyx from 'react-native-onyx';

import * as TestHelper from '../utils/TestHelper';
import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

jest.mock('@hooks/useCompleteOnboarding', () => () => ({
    completeOnboardingFlow: jest.fn(),
    isLoading: false,
}));

TestHelper.setupGlobalFetchMock();

const Stack = createStackNavigator<OnboardingModalNavigatorParamList>();
const goBack = jest.spyOn(Navigation, 'goBack').mockImplementation(() => {});
jest.spyOn(Navigation, 'getTopmostReportId').mockReturnValue(undefined);
jest.spyOn(Browser, 'isMobileSafari').mockReturnValue(false);

// Where the header placeholder sits inside the onboarding modal. Native views are mocked in tests, so this stands in for real layout.
const PLACEHOLDER_TOP = 8;

function renderOnboardingSteps(initialRouteName: ValueOf<typeof SCREENS.ONBOARDING>) {
    const navigationRef = createNavigationContainerRef<OnboardingModalNavigatorParamList>();
    render(
        <ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider, CurrentReportIDContextProvider]}>
            <NavigationContainer ref={navigationRef}>
                <OnboardingModalNavigatorContentWrapper onboardingIsMediumOrLargerScreenWidth>
                    <Stack.Navigator initialRouteName={initialRouteName}>
                        <Stack.Screen name={SCREENS.ONBOARDING.PURPOSE}>
                            {(props) => (
                                <BaseOnboardingPurpose
                                    {...props}
                                    shouldUseNativeStyles={false}
                                    shouldEnableMaxHeight={false}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name={SCREENS.ONBOARDING.INTERESTED_FEATURES}>
                            {(props) => (
                                <BaseOnboardingInterestedFeatures
                                    {...props}
                                    shouldUseNativeStyles={false}
                                />
                            )}
                        </Stack.Screen>
                        <Stack.Screen name={SCREENS.ONBOARDING.ACCOUNTING}>
                            {(props) => (
                                <BaseOnboardingAccounting
                                    {...props}
                                    shouldUseNativeStyles={false}
                                />
                            )}
                        </Stack.Screen>
                    </Stack.Navigator>
                </OnboardingModalNavigatorContentWrapper>
            </NavigationContainer>
        </ComposeProviders>,
    );
    return navigationRef;
}

/** Hidden cards stay mounted in a stack, so count every caret, not only the accessible ones. */
function getAllBackCarets() {
    return screen.queryAllByLabelText(TestHelper.translateLocal('common.back'), {includeHiddenElements: true});
}

describe('Onboarding back caret header', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
    });

    beforeEach(() => {
        jest.spyOn(useResponsiveLayoutModule, 'default').mockReturnValue({
            isSmallScreenWidth: false,
            shouldUseNarrowLayout: false,
            isInNarrowPaneModal: false,
            isExtraSmallScreenHeight: false,
            isMediumScreenWidth: false,
            isLargeScreenWidth: true,
            isExtraLargeScreenWidth: false,
            isExtraSmallScreenWidth: false,
            isSmallScreen: false,
            onboardingIsMediumOrLargerScreenWidth: true,
            isInLandscapeMode: false,
        } satisfies ResponsiveLayoutResult);
        jest.spyOn(View.prototype, 'measureLayout').mockImplementation((_relativeTo, onSuccess) => onSuccess(0, PLACEHOLDER_TOP, 400, 60));
    });

    afterEach(async () => {
        await act(async () => {
            await Onyx.clear();
        });
        jest.clearAllMocks();
    });

    it('draws a single caret outside the step screens while both steps are mounted', async () => {
        const navigationRef = renderOnboardingSteps(SCREENS.ONBOARDING.INTERESTED_FEATURES);
        await waitForBatchedUpdatesWithAct();

        act(() => navigationRef.navigate(SCREENS.ONBOARDING.ACCOUNTING));
        await waitForBatchedUpdatesWithAct();

        expect(await screen.findByTestId('BaseOnboardingAccounting')).toBeOnTheScreen();

        // Both step screens are still mounted, but only one caret exists and neither screen owns it, so it cannot slide with either of them
        expect(screen.getByTestId('BaseOnboardingInterestedFeatures', {includeHiddenElements: true})).toBeTruthy();
        expect(getAllBackCarets()).toHaveLength(1);
        expect(within(screen.getByTestId('BaseOnboardingAccounting')).queryByLabelText(TestHelper.translateLocal('common.back'), {includeHiddenElements: true})).toBeNull();
        expect(
            within(screen.getByTestId('BaseOnboardingInterestedFeatures', {includeHiddenElements: true})).queryByLabelText(TestHelper.translateLocal('common.back'), {
                includeHiddenElements: true,
            }),
        ).toBeNull();

        // The caret runs the handler of the step that is focused now
        fireEvent.press(screen.getByLabelText(TestHelper.translateLocal('common.back')));
        expect(goBack).toHaveBeenCalledWith(ROUTES.ONBOARDING_INTERESTED_FEATURES.getRoute());
    });

    it('hides the caret again when going back to a step that has none', async () => {
        const navigationRef = renderOnboardingSteps(SCREENS.ONBOARDING.PURPOSE);
        await waitForBatchedUpdatesWithAct();

        expect(await screen.findByTestId('BaseOnboardingPurpose')).toBeOnTheScreen();
        expect(getAllBackCarets()).toHaveLength(0);

        act(() => navigationRef.navigate(SCREENS.ONBOARDING.INTERESTED_FEATURES));
        await waitForBatchedUpdatesWithAct();
        await waitFor(() => expect(getAllBackCarets()).toHaveLength(1));

        act(() => navigationRef.goBack());
        await waitForBatchedUpdatesWithAct();
        expect(await screen.findByTestId('BaseOnboardingPurpose')).toBeOnTheScreen();
        expect(getAllBackCarets()).toHaveLength(0);
    });
});
