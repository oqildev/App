import {renderHook} from '@testing-library/react-native';

import useIsDomainUsingCard from '@hooks/useIsDomainUsingCard';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

import Onyx from 'react-native-onyx';

import waitForBatchedUpdates from '../utils/waitForBatchedUpdates';

const domainAccountID = 4242;
const otherDomainAccountID = 9999;

const domainFeedsKey = `${ONYXKEYS.COLLECTION.SHARED_NVP_PRIVATE_DOMAIN_MEMBER}${domainAccountID}` as const;
const otherDomainFeedsKey = `${ONYXKEYS.COLLECTION.SHARED_NVP_PRIVATE_DOMAIN_MEMBER}${otherDomainAccountID}` as const;
const expensifyCardSettingsKey = `${ONYXKEYS.COLLECTION.PRIVATE_EXPENSIFY_CARD_SETTINGS}${domainAccountID}` as const;

describe('useIsDomainUsingCard', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
        return waitForBatchedUpdates();
    });

    beforeEach(async () => {
        await Onyx.clear();
        await waitForBatchedUpdates();
    });

    it('should be false when the domain has neither an Expensify Card feed nor a company card feed', () => {
        // Given a domain with no card data at all
        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the setting stays locked
        expect(result.current).toBe(false);
    });

    it('should be true when the domain has only an Expensify Card feed', async () => {
        // Given a domain that has Expensify Card settings
        await Onyx.set(expensifyCardSettingsKey, {paymentBankAccountID: 1});
        await waitForBatchedUpdates();

        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the setting unlocks, exactly as it does today
        expect(result.current).toBe(true);
    });

    it('should be true when the domain has only a third-party company card feed', async () => {
        // Given a domain whose only feed is a third-party company card feed
        await Onyx.set(domainFeedsKey, {settings: {companyCards: {[CONST.COMPANY_CARD.FEED_BANK_NAME.MASTER_CARD]: {liabilityType: 'corporate'}}}});
        await waitForBatchedUpdates();

        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the setting unlocks - this is the case the issue is about, and it fails on main
        expect(result.current).toBe(true);
    });

    it('should be true when the domain has both an Expensify Card feed and a company card feed', async () => {
        // Given a domain with both kinds of feed
        await Onyx.set(expensifyCardSettingsKey, {paymentBankAccountID: 1});
        await Onyx.set(domainFeedsKey, {settings: {companyCards: {[CONST.COMPANY_CARD.FEED_BANK_NAME.MASTER_CARD]: {liabilityType: 'corporate'}}}});
        await waitForBatchedUpdates();

        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the setting unlocks
        expect(result.current).toBe(true);
    });

    it('should be true for a company card feed that has no cards assigned yet', async () => {
        // Given a feed that was just connected and has no oAuthAccountDetails and no assigned cards
        await Onyx.set(domainFeedsKey, {settings: {companyCards: {[CONST.COMPANY_CARD.FEED_BANK_NAME.MASTER_CARD]: {}}}});
        await waitForBatchedUpdates();

        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the setting still unlocks, because we do not pass feedKeysWithCards
        expect(result.current).toBe(true);
    });

    it('should be false when the only company card entry is the Expensify Card bank', async () => {
        // Given a domain whose companyCards holds only the Expensify Card entry, with no Expensify Card settings
        await Onyx.set(domainFeedsKey, {settings: {companyCards: {[CONST.EXPENSIFY_CARD.BANK]: {liabilityType: 'corporate'}}}});
        await waitForBatchedUpdates();

        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the two terms stay disjoint and the setting stays locked
        expect(result.current).toBe(false);
    });

    it('should be false when the only company card feed is pending or pending deletion', async () => {
        // Given a domain whose feeds are all pending or being removed
        await Onyx.set(domainFeedsKey, {
            settings: {
                companyCards: {
                    [CONST.COMPANY_CARD.FEED_BANK_NAME.MASTER_CARD]: {pending: true},
                    [CONST.COMPANY_CARD.FEED_BANK_NAME.VISA]: {pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE},
                },
            },
        });
        await waitForBatchedUpdates();

        // When we render the hook
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then the setting stays locked
        expect(result.current).toBe(false);
    });

    it('should be false when the company card feed belongs to a different domain', async () => {
        // Given a feed that exists, but under another domain's key
        await Onyx.set(otherDomainFeedsKey, {settings: {companyCards: {[CONST.COMPANY_CARD.FEED_BANK_NAME.MASTER_CARD]: {liabilityType: 'corporate'}}}});
        await waitForBatchedUpdates();

        // When we render the hook for this domain
        const {result} = renderHook(() => useIsDomainUsingCard(domainAccountID));

        // Then a multi-domain admin cannot unlock the setting on the wrong domain
        expect(result.current).toBe(false);
    });
});
