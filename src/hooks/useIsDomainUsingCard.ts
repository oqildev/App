import {getOriginalCompanyFeeds} from '@libs/CardUtils';

import ONYXKEYS from '@src/ONYXKEYS';
import type {CardFeeds, ExpensifyCardSettings} from '@src/types/onyx';

import type {OnyxEntry} from 'react-native-onyx';

import useOnyx from './useOnyx';

const hasExpensifyCardFeedSelector = (domainCardSettings: OnyxEntry<ExpensifyCardSettings>) => !!domainCardSettings;

/**
 * `getOriginalCompanyFeeds` already drops the Expensify Card entry, pending feeds and feeds pending deletion, so this
 * term is disjoint from the Expensify Card one. It is deliberately called without `feedKeysWithCards` so a feed that is
 * connected but has no cards assigned yet still counts.
 */
const hasCompanyCardFeedSelector = (domainCardFeeds: OnyxEntry<CardFeeds>) => Object.keys(getOriginalCompanyFeeds(domainCardFeeds)).length > 0;

/**
 * Whether a domain has any card feed that the domain-group "Card preferred workspace" setting can apply to, i.e. an
 * Expensify Card feed or a third-party company card feed.
 *
 * Both reads are scoped to the domain's own key, so feeds belonging to another domain - or to a workspace - can never
 * unlock the setting for this domain.
 */
function useIsDomainUsingCard(domainAccountID: number): boolean {
    const [hasExpensifyCardFeed] = useOnyx(`${ONYXKEYS.COLLECTION.PRIVATE_EXPENSIFY_CARD_SETTINGS}${domainAccountID}`, {selector: hasExpensifyCardFeedSelector});
    const [hasCompanyCardFeed] = useOnyx(`${ONYXKEYS.COLLECTION.SHARED_NVP_PRIVATE_DOMAIN_MEMBER}${domainAccountID}`, {selector: hasCompanyCardFeedSelector});

    return !!hasExpensifyCardFeed || !!hasCompanyCardFeed;
}

export default useIsDomainUsingCard;
