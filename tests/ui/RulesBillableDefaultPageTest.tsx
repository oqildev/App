import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import {ModalProvider} from '@components/Modal/Global/ModalContext';
import OnyxListItemProvider from '@components/OnyxListItemProvider';

import {CurrentReportIDContextProvider} from '@hooks/useCurrentReportID';
import * as useResponsiveLayoutModule from '@hooks/useResponsiveLayout';

import {isBillableEnabledOnPolicy} from '@libs/MoneyRequestReportUtils';
import createPlatformStackNavigator from '@libs/Navigation/PlatformStackNavigation/createPlatformStackNavigator';

import type {SettingsNavigatorParamList} from '@navigation/types';

import RulesBillableDefaultPage from '@pages/workspace/rules/RulesBillableDefaultPage';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import SCREENS from '@src/SCREENS';
import type {Beta, Policy} from '@src/types/onyx';

import type {ValueOf} from 'type-fest';

import {PortalProvider} from '@gorhom/portal';
import {NavigationContainer} from '@react-navigation/native';
import React from 'react';
import Onyx from 'react-native-onyx';

import getOnyxValue from '../utils/getOnyxValue';
import * as LHNTestUtils from '../utils/LHNTestUtils';
import * as TestHelper from '../utils/TestHelper';
import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

// The page renders its description through RenderHTML, which react-native-render-html cannot mount under Jest.
jest.mock(
    '@components/RenderHTML',
    () =>
        ({html}: {html: string}) =>
            html.replaceAll(/<[^>]*>/g, ''),
);

TestHelper.setupGlobalFetchMock();

const Stack = createPlatformStackNavigator<SettingsNavigatorParamList>();

const renderBillableDefaultPage = (policyID: string) =>
    render(
        <ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider, CurrentReportIDContextProvider]}>
            <PortalProvider>
                <ModalProvider>
                    <NavigationContainer>
                        <Stack.Navigator initialRouteName={SCREENS.WORKSPACE.RULES_BILLABLE_DEFAULT}>
                            <Stack.Screen
                                name={SCREENS.WORKSPACE.RULES_BILLABLE_DEFAULT}
                                component={RulesBillableDefaultPage}
                                initialParams={{policyID}}
                            />
                        </Stack.Navigator>
                    </NavigationContainer>
                </ModalProvider>
            </PortalProvider>
        </ComposeProviders>,
    );

const MODE_LABEL_KEYS = {
    [CONST.POLICY_BILLABLE_MODES.DISABLED]: 'workspace.rules.individualExpenseRules.billableDisabled',
    [CONST.POLICY_BILLABLE_MODES.BILLABLE]: 'workspace.rules.individualExpenseRules.billable',
    [CONST.POLICY_BILLABLE_MODES.NON_BILLABLE]: 'workspace.rules.individualExpenseRules.nonBillable',
} as const;

// IntlStore loads the locale asynchronously, so only call this once the first render has settled.
const getLabel = (mode: ValueOf<typeof CONST.POLICY_BILLABLE_MODES>) => TestHelper.translateLocal(MODE_LABEL_KEYS[mode]);

beforeAll(() => {
    Onyx.init({keys: ONYXKEYS});
});

beforeEach(async () => {
    await act(async () => {
        await Onyx.set(ONYXKEYS.NVP_PREFERRED_LOCALE, CONST.LOCALES.EN);
    });
    jest.spyOn(useResponsiveLayoutModule, 'default').mockReturnValue({
        shouldUseNarrowLayout: true,
        isSmallScreenWidth: true,
        isInNarrowPaneModal: false,
        isExtraSmallScreenHeight: false,
        isMediumScreenWidth: false,
        isLargeScreenWidth: false,
        isExtraLargeScreenWidth: false,
        isExtraSmallScreenWidth: false,
        isSmallScreen: true,
        onboardingIsMediumOrLargerScreenWidth: false,
        isInLandscapeMode: false,
    });
});

afterEach(async () => {
    await act(async () => {
        await Onyx.clear();
    });
    jest.clearAllMocks();
});

/** Seeds a workspace in the exact state the issue describes: Rules on, billable default non-billable, tracking off. */
const setupPolicy = async (policyOverrides: Partial<Policy> = {}, betas: Beta[] = []) => {
    await TestHelper.signInWithTestUser();
    // signInWithTestUser seeds BETAS with 'all', which turns rulesRevamp on everywhere. Pin the exact list instead,
    // because the non-revamp path is the one the issue reproduces on.
    await act(async () => {
        await Onyx.set(ONYXKEYS.BETAS, betas);
    });
    const policy = {
        ...LHNTestUtils.getFakePolicy(),
        type: CONST.POLICY.TYPE.CORPORATE,
        role: CONST.POLICY.ROLE.ADMIN,
        areRulesEnabled: true,
        areTagsEnabled: true,
        defaultBillable: false,
        disabledFields: {defaultBillable: true, reimbursable: false},
        ...policyOverrides,
    };
    await act(async () => {
        await Onyx.merge(`${ONYXKEYS.COLLECTION.POLICY}${policy.id}`, policy);
    });
    return policy;
};

describe('RulesBillableDefaultPage', () => {
    it('offers all three billable states on the non-revamp path', async () => {
        const policy = await setupPolicy();
        const {unmount} = renderBillableDefaultPage(policy.id);
        await waitForBatchedUpdatesWithAct();

        await waitFor(() => {
            expect(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.DISABLED))).toBeOnTheScreen();
        });
        expect(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.NON_BILLABLE))).toBeOnTheScreen();
        expect(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.BILLABLE))).toBeOnTheScreen();

        unmount();
        await waitForBatchedUpdatesWithAct();
    });

    it('keeps the two-option list on the revamp path, where the Track billable toggle owns the disabled state', async () => {
        const policy = await setupPolicy({}, [CONST.BETAS.RULES_REVAMP]);
        const {unmount} = renderBillableDefaultPage(policy.id);
        await waitForBatchedUpdatesWithAct();

        await waitFor(() => {
            expect(screen.getAllByLabelText(TestHelper.translateLocal('workspace.tags.trackBillable')).at(0)).toBeOnTheScreen();
        });
        // Tracking is off, so the revamp path hides the mode list entirely instead of showing a Disabled row.
        expect(screen.queryByText(getLabel(CONST.POLICY_BILLABLE_MODES.DISABLED))).not.toBeOnTheScreen();

        unmount();
        await waitForBatchedUpdatesWithAct();
    });

    it('enables billable tracking after a single Save, with no Billable/Non-billable round trip', async () => {
        const policy = await setupPolicy();
        expect(isBillableEnabledOnPolicy(policy)).toBe(false);

        const {unmount} = renderBillableDefaultPage(policy.id);
        await waitForBatchedUpdatesWithAct();

        await waitFor(() => {
            expect(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.NON_BILLABLE))).toBeOnTheScreen();
        });

        // Pick the mode the Rules page already claimed was active, then save once.
        fireEvent.press(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.NON_BILLABLE)));
        await waitForBatchedUpdatesWithAct();
        fireEvent.press(screen.getByText(TestHelper.translateLocal('common.save')));
        await waitForBatchedUpdatesWithAct();

        const updatedPolicy = await getOnyxValue(`${ONYXKEYS.COLLECTION.POLICY}${policy.id}`);
        expect(updatedPolicy?.defaultBillable).toBe(false);
        expect(updatedPolicy?.disabledFields?.defaultBillable).toBe(false);
        // This is exactly `shouldShowBillable` on the expense confirm page.
        expect(isBillableEnabledOnPolicy(updatedPolicy)).toBe(true);

        unmount();
        await waitForBatchedUpdatesWithAct();
    });

    it('turns tracking off when Disabled is saved', async () => {
        const policy = await setupPolicy({defaultBillable: true, disabledFields: {defaultBillable: false, reimbursable: false}});
        const {unmount} = renderBillableDefaultPage(policy.id);
        await waitForBatchedUpdatesWithAct();

        await waitFor(() => {
            expect(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.DISABLED))).toBeOnTheScreen();
        });

        fireEvent.press(screen.getByText(getLabel(CONST.POLICY_BILLABLE_MODES.DISABLED)));
        await waitForBatchedUpdatesWithAct();
        fireEvent.press(screen.getByText(TestHelper.translateLocal('common.save')));
        await waitForBatchedUpdatesWithAct();

        const updatedPolicy = await getOnyxValue(`${ONYXKEYS.COLLECTION.POLICY}${policy.id}`);
        expect(updatedPolicy?.disabledFields?.defaultBillable).toBe(true);
        expect(isBillableEnabledOnPolicy(updatedPolicy)).toBe(false);

        unmount();
        await waitForBatchedUpdatesWithAct();
    });
});
