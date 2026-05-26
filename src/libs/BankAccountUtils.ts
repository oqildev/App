import {Str} from 'expensify-common';
import type {OnyxEntry} from 'react-native-onyx';
import CONST from '@src/CONST';
import type {TranslationPaths} from '@src/languages/types';
import type * as OnyxTypes from '@src/types/onyx';

type BankAccountStatusTone = 'success' | 'warning' | 'neutral' | 'error' | 'default';

type BankAccountStatusActionKey = 'finish' | 'confirm' | 'unlock' | undefined;

type BankAccountStatusDisplay = {
    /** Translation path for the status badge label (e.g. "Active", "Incomplete"). */
    labelKey: TranslationPaths;
    /** Visual tone for the badge. */
    tone: BankAccountStatusTone;
    /** Translation path for the inline message below the row (e.g. "Finish adding bank account"). */
    messageKey?: TranslationPaths;
    /** Translation path for a tooltip / hover hint (e.g. "We're reviewing your documentation"). */
    tooltipKey?: TranslationPaths;
    /** Action key the caller switches on to wire navigation. Same status can mean different routes per surface. */
    actionKey: BankAccountStatusActionKey;
    /** Whether the row should show a Red Brick Road indicator. */
    shouldShowBrickRoadIndicator: boolean;
};

function getDefaultCompanyWebsite(session: OnyxEntry<OnyxTypes.Session>, account: OnyxEntry<OnyxTypes.Account>, shouldShowPublicDomain = false): string {
    return account?.isFromPublicDomain && !shouldShowPublicDomain ? '' : `https://www.${Str.extractEmailDomain(session?.email ?? '')}`;
}

function getLastFourDigits(bankAccountNumber: string): string {
    return bankAccountNumber ? bankAccountNumber.slice(-4) : '';
}

function isBankAccountPartiallySetup(state: string | undefined) {
    return state === CONST.BANK_ACCOUNT.STATE.SETUP || state === CONST.BANK_ACCOUNT.STATE.VERIFYING || state === CONST.BANK_ACCOUNT.STATE.PENDING;
}

function doesPolicyHavePartiallySetupBankAccount(bankAccountList: OnyxEntry<OnyxTypes.BankAccountList>, policyID: string) {
    if (!bankAccountList) {
        return false;
    }

    const bankAccounts = Object.values(bankAccountList);
    const matchingBankAccount = bankAccounts.find((bankAccount) => bankAccount.accountData?.policyIDs?.includes(policyID));

    return isBankAccountPartiallySetup(matchingBankAccount?.accountData?.state);
}

function hasPartiallySetupBankAccount(bankAccountList: OnyxEntry<OnyxTypes.BankAccountList>): boolean {
    return Object.values(bankAccountList ?? {}).some((bankAccount) => isBankAccountPartiallySetup(bankAccount?.accountData?.state));
}

/**
 * Maps a bank account `state` to the visible status pill, inline message, tooltip, and a
 * caller-switchable action key. State values come from the backend (see CONST.BANK_ACCOUNT.STATE),
 * but the visible labels are presentational only — renaming "Verified" → "Active" or
 * "Setup" → "Incomplete" happens here, not on the data model.
 */
function getBankAccountStatusDisplay(state: string | undefined): BankAccountStatusDisplay {
    switch (state) {
        case CONST.BANK_ACCOUNT.STATE.OPEN:
            return {labelKey: 'bankAccount.status.active', tone: 'success', actionKey: undefined, shouldShowBrickRoadIndicator: false};
        case CONST.BANK_ACCOUNT.STATE.SETUP:
            return {
                labelKey: 'bankAccount.status.incomplete',
                tone: 'warning',
                messageKey: 'bankAccount.status.incompleteMessage',
                actionKey: 'finish',
                shouldShowBrickRoadIndicator: true,
            };
        case CONST.BANK_ACCOUNT.STATE.PENDING:
            return {
                labelKey: 'bankAccount.status.pending',
                tone: 'warning',
                messageKey: 'bankAccount.status.pendingMessage',
                actionKey: 'confirm',
                shouldShowBrickRoadIndicator: true,
            };
        case CONST.BANK_ACCOUNT.STATE.VERIFYING:
        case CONST.BANK_ACCOUNT.STATE.VALIDATING:
            return {
                labelKey: 'bankAccount.status.verifying',
                tone: 'neutral',
                tooltipKey: 'bankAccount.status.verifyingTooltip',
                actionKey: undefined,
                shouldShowBrickRoadIndicator: false,
            };
        case CONST.BANK_ACCOUNT.STATE.LOCKED:
            return {
                labelKey: 'bankAccount.status.locked',
                tone: 'error',
                messageKey: 'bankAccount.status.lockedMessage',
                actionKey: 'unlock',
                shouldShowBrickRoadIndicator: true,
            };
        default:
            return {labelKey: 'bankAccount.status.active', tone: 'default', actionKey: undefined, shouldShowBrickRoadIndicator: false};
    }
}

export type {BankAccountStatusDisplay, BankAccountStatusTone, BankAccountStatusActionKey};
export {getBankAccountStatusDisplay, getDefaultCompanyWebsite, getLastFourDigits, hasPartiallySetupBankAccount, isBankAccountPartiallySetup, doesPolicyHavePartiallySetupBankAccount};
