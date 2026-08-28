import {act, render} from '@testing-library/react-native';

import ShareTabParticipantsSelector from '@components/Share/ShareTabParticipantsSelector';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {Policy, Report} from '@src/types/onyx';

import {getUnixTime, subDays} from 'date-fns';
import React from 'react';
import Onyx from 'react-native-onyx';

import createRandomPolicy from '../utils/collections/policies';
import {createPolicyExpenseChat} from '../utils/collections/reports';
import waitForBatchedUpdates from '../utils/waitForBatchedUpdates';

const ACCOUNT_ID = 1;
const DEFAULT_POLICY_ID = 'defaultPolicy';
const LOCKED_POLICY_ID = 'lockedPolicy';

const defaultWorkspaceChat: Report = {...createPolicyExpenseChat(2), policyID: DEFAULT_POLICY_ID, ownerAccountID: ACCOUNT_ID};
const lockedWorkspaceChat: Report = {...createPolicyExpenseChat(3), policyID: LOCKED_POLICY_ID, ownerAccountID: ACCOUNT_ID};

const defaultExpensePolicy: Policy = {
    ...createRandomPolicy(2, CONST.POLICY.TYPE.TEAM),
    id: DEFAULT_POLICY_ID,
    ownerAccountID: ACCOUNT_ID,
    isPolicyExpenseChatEnabled: true,
};

jest.mock('@hooks/useCurrentUserPersonalDetails', () => ({
    __esModule: true,
    default: () => ({accountID: ACCOUNT_ID, login: 'test@test.com'}),
}));

// The default workspace resolution itself is covered by `useDefaultExpensePolicy`; what this suite asserts is what the
// selector does with the policy it hands back, so the hook is stubbed with a value each test controls.
let mockDefaultExpensePolicy: Policy | undefined = defaultExpensePolicy;
jest.mock('@hooks/useDefaultExpensePolicy', () => ({
    __esModule: true,
    default: () => mockDefaultExpensePolicy,
}));

type PreferredPolicy = {isRestrictedToPreferredPolicy: boolean; preferredPolicyID: string | undefined; isRestrictedPolicyCreation: boolean};

const UNRESTRICTED_PREFERRED_POLICY: PreferredPolicy = {isRestrictedToPreferredPolicy: false, preferredPolicyID: undefined, isRestrictedPolicyCreation: false};

let mockPreferredPolicy: PreferredPolicy = UNRESTRICTED_PREFERRED_POLICY;
jest.mock('@hooks/usePreferredPolicy', () => ({
    __esModule: true,
    default: () => mockPreferredPolicy,
}));

const mockNavigate = jest.fn((route: string, options?: {afterTransition?: () => void}) => options?.afterTransition?.());
jest.mock('@libs/Navigation/Navigation', () => ({
    __esModule: true,
    default: {
        navigate: (route: string, options?: {afterTransition?: () => void}) => mockNavigate(route, options),
        getActiveRoute: () => '',
    },
}));

jest.mock('@libs/actions/IOU/MoneyRequest');
jest.mock('@libs/telemetry/activeSpans');

// Rendering the real picker isn't what's under test — whether it is reached at all is.
const mockParticipantsSelector = jest.fn();
jest.mock('@pages/iou/request/MoneyRequestParticipantsSelector', () => ({
    __esModule: true,
    default: () => {
        mockParticipantsSelector();
        return null;
    },
}));

async function renderSelector(detailsPageRouteObject: typeof ROUTES.SHARE_SUBMIT_DETAILS | typeof ROUTES.SHARE_DETAILS = ROUTES.SHARE_SUBMIT_DETAILS) {
    const rendered = render(<ShareTabParticipantsSelector detailsPageRouteObject={detailsPageRouteObject} />);
    await act(waitForBatchedUpdates);
    return rendered;
}

describe('ShareTabParticipantsSelector', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        mockDefaultExpensePolicy = defaultExpensePolicy;
        mockPreferredPolicy = UNRESTRICTED_PREFERRED_POLICY;

        // `getPolicyExpenseChat` scans the report collection, so both workspace chats have to exist in Onyx.
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${defaultWorkspaceChat.reportID}`, defaultWorkspaceChat);
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${lockedWorkspaceChat.reportID}`, lockedWorkspaceChat);
        await Onyx.multiSet({[ONYXKEYS.SESSION]: {email: '', accountID: ACCOUNT_ID}});
        await waitForBatchedUpdates();
    });

    afterEach(async () => {
        // Clearing Onyx re-renders whatever is still mounted, so it has to happen inside act().
        await act(async () => {
            await Onyx.clear();
            await waitForBatchedUpdates();
        });
    });

    it('skips the participant picker and lands on the confirmation page of the default group workspace', async () => {
        await renderSelector();

        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(ROUTES.SHARE_SUBMIT_DETAILS.getRoute(defaultWorkspaceChat.reportID), expect.anything());
    });

    it('renders the picker underneath the confirmation page so the user can go back and change the To', async () => {
        await renderSelector();

        expect(mockParticipantsSelector).toHaveBeenCalled();
    });

    it('keeps the picker when the user has no single default group workspace', async () => {
        mockDefaultExpensePolicy = undefined;

        await renderSelector();

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockParticipantsSelector).toHaveBeenCalled();
    });

    it('keeps the picker when billing restrictions suppress the default workspace shortcut', async () => {
        // Owner of the default workspace, past due and owing money — the same condition that suppresses the shortcut in
        // the in-product create flow.
        await Onyx.multiSet({
            [ONYXKEYS.NVP_PRIVATE_AMOUNT_OWED]: 500,
            [ONYXKEYS.NVP_PRIVATE_OWNER_BILLING_GRACE_PERIOD_END]: getUnixTime(subDays(new Date(), 3)),
        });
        await waitForBatchedUpdates();

        await renderSelector();

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockParticipantsSelector).toHaveBeenCalled();
    });

    it('still auto-navigates a domain-restricted user to the locked workspace, which wins over the default workspace', async () => {
        mockPreferredPolicy = {isRestrictedToPreferredPolicy: true, preferredPolicyID: LOCKED_POLICY_ID, isRestrictedPolicyCreation: false};

        await renderSelector();

        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith(ROUTES.SHARE_SUBMIT_DETAILS.getRoute(lockedWorkspaceChat.reportID), expect.anything());
    });

    it('does not auto-navigate in the share flow, which has no workspace destination to default to', async () => {
        await renderSelector(ROUTES.SHARE_DETAILS);

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockParticipantsSelector).toHaveBeenCalled();
    });
});
