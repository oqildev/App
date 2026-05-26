import React, {useMemo, useRef} from 'react';
import type {GestureResponderEvent, StyleProp, ViewStyle} from 'react-native';
import {View} from 'react-native';
import type {ValueOf} from 'type-fest';
import Badge from '@components/Badge';
import Button from '@components/Button';
import FormHelpMessage from '@components/FormHelpMessage';
import Icon from '@components/Icon';
import MenuItem from '@components/MenuItem';
import OfflineWithFeedback from '@components/OfflineWithFeedback';
import type {PopoverMenuItem} from '@components/PopoverMenu';
import PressableWithFeedback from '@components/Pressable/PressableWithFeedback';
import Text from '@components/Text';
import ThreeDotsMenu from '@components/ThreeDotsMenu';
import {useMemoizedLazyExpensifyIcons} from '@hooks/useLazyAsset';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import {openExternalLink} from '@libs/actions/Link';
import type {BankAccountStatusActionKey, BankAccountStatusDisplay} from '@libs/BankAccountUtils';
import {getBankAccountStatusDisplay} from '@libs/BankAccountUtils';
import Log from '@libs/Log';
import variables from '@styles/variables';
import {clearAddPaymentMethodError, clearDeletePaymentMethodError} from '@userActions/PaymentMethods';
import CONST from '@src/CONST';
import type {TranslationPaths} from '@src/languages/types';
import ONYXKEYS from '@src/ONYXKEYS';
import type {BankIcon} from '@src/types/onyx/Bank';
import type {Errors} from '@src/types/onyx/OnyxCommon';
import type PaymentMethod from '@src/types/onyx/PaymentMethod';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import type IconAsset from '@src/types/utils/IconAsset';

type CardStatusOverride = {
    /** Translation key for the inline message under the row (e.g. "Please fix this connection"). */
    messageKey: TranslationPaths;
    /** Translation key for the CTA button label (optional). */
    ctaLabelKey?: TranslationPaths;
    /** Handler invoked when the CTA button is pressed. */
    onCtaPress?: () => void;
};

type PaymentMethodItem = PaymentMethod & {
    key?: string;
    title?: string;
    description: string;
    onPress?: (e: GestureResponderEvent | KeyboardEvent | undefined) => void;
    isGroupedCardDomain?: boolean;
    canDismissError?: boolean;
    disabled?: boolean;
    shouldShowRightIcon?: boolean;
    shouldShowThreeDotsMenu?: boolean;
    interactive?: boolean;
    brickRoadIndicator?: ValueOf<typeof CONST.BRICK_ROAD_INDICATOR_STATUS>;
    errors?: Errors;
    iconRight?: IconAsset;
    isMethodActive?: boolean;
    isInactive?: boolean;
    cardID?: number;
    plaidUrl?: string;
    onThreeDotsMenuPress?: (e: GestureResponderEvent | KeyboardEvent | undefined) => void;
    isCardFrozen?: boolean;
    /** Optional inline-message + CTA for broken card connections (personal/admin/employee variants). */
    cardStatusOverride?: CardStatusOverride;
} & BankIcon;

type PaymentMethodListItemProps = {
    /** The payment method item to render */
    item: PaymentMethodItem;

    /** Whether to show the default badge for this payment method */
    shouldShowDefaultBadge: boolean;

    /** Optional array of menu items to be displayed in the three dots menu */
    threeDotsMenuItems?: PopoverMenuItem[];

    /** Callback for when the three dots menu is pressed */
    onThreeDotsMenuPress?: (e: GestureResponderEvent | KeyboardEvent | undefined) => void;

    /** Handler invoked when the inline status CTA (Finish / Confirm / Unlock) is pressed. */
    onBankAccountStatusActionPress?: (actionKey: BankAccountStatusActionKey, item: PaymentMethodItem) => void;

    /** List item style */
    listItemStyle?: StyleProp<ViewStyle>;
};

function dismissError(item: PaymentMethodItem) {
    if (item.cardID) {
        clearDeletePaymentMethodError(ONYXKEYS.CARD_LIST, item.cardID);
        return;
    }

    const hasErrors = !isEmptyObject(item.errors);
    const isBankAccount = item.accountType === CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT;
    const paymentList = isBankAccount ? ONYXKEYS.BANK_ACCOUNT_LIST : ONYXKEYS.FUND_LIST;
    const paymentID = isBankAccount ? item.accountData?.bankAccountID : item.accountData?.fundID;

    if (!paymentID) {
        Log.info('Unable to clear payment method error: ', undefined, item);
        return;
    }

    if (item.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE || hasErrors) {
        clearDeletePaymentMethodError(paymentList, paymentID);
        if (!isBankAccount) {
            clearDeletePaymentMethodError(ONYXKEYS.FUND_LIST, paymentID);
        }
    } else {
        clearAddPaymentMethodError(paymentList, paymentID);
        if (!isBankAccount) {
            clearAddPaymentMethodError(ONYXKEYS.FUND_LIST, paymentID);
        }
    }
}

function getBankAccountState(item: PaymentMethodItem): string | undefined {
    if (item.accountData && 'state' in item.accountData) {
        return item.accountData.state;
    }
    return undefined;
}

function PaymentMethodListItem({item, shouldShowDefaultBadge, threeDotsMenuItems, onBankAccountStatusActionPress, listItemStyle}: PaymentMethodListItemProps) {
    const icons = useMemoizedLazyExpensifyIcons(['DotIndicator', 'FreezeCard', 'QuestionMark']);
    const theme = useTheme();
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const {isOffline} = useNetwork();
    const {shouldUseNarrowLayout} = useResponsiveLayout();

    const threeDotsMenuRef = useRef<{hidePopoverMenu: () => void; isPopupMenuVisible: boolean; onThreeDotsPress: () => void}>(null);

    const bankAccountState = getBankAccountState(item);
    const isBankAccountRow = bankAccountState !== undefined;
    const bankStatus: BankAccountStatusDisplay | undefined = isBankAccountRow ? getBankAccountStatusDisplay(bankAccountState) : undefined;
    const isLockedWithDebit = bankAccountState === CONST.BANK_ACCOUNT.STATE.LOCKED && !!item.accountData && 'allowDebit' in item.accountData && !!item.accountData.allowDebit;

    const showThreeDotsMenu = item.shouldShowThreeDotsMenu !== false && !!threeDotsMenuItems && !isLockedWithDebit;

    // Check if this is a Chase personal bank account connected via Plaid
    const isChaseAccountConnectedViaPlaid =
        item.accountType === CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT &&
        item.accountData?.additionalData?.bankName?.toLowerCase() === CONST.BANK_NAMES.CHASE &&
        !!(item.accountData?.additionalData?.plaidAccountID ?? item.accountData?.plaidAccountID);

    const handleRowPress = (e: GestureResponderEvent | KeyboardEvent | undefined) => {
        if (isLockedWithDebit) {
            if (item.onThreeDotsMenuPress) {
                item.onThreeDotsMenuPress(e);
            } else {
                item.onPress?.(e);
            }
            return;
        }

        const isSetupLike = bankStatus?.actionKey === 'finish' || bankStatus?.actionKey === 'confirm';
        if (!showThreeDotsMenu || (item.cardID && item.onThreeDotsMenuPress) || isSetupLike) {
            item.onPress?.(e);
        } else if (threeDotsMenuRef.current) {
            threeDotsMenuRef.current.onThreeDotsPress();
        }
    };

    // Account-level status badges (right side of the row)
    const badgeText = useMemo(() => {
        if (bankStatus && bankStatus.tone !== 'default') {
            return translate(bankStatus.labelKey);
        }
        return shouldShowDefaultBadge ? translate('paymentMethodList.defaultPaymentMethod') : undefined;
    }, [bankStatus, shouldShowDefaultBadge, translate]);

    const badgeIcon = useMemo(() => {
        if (bankStatus?.tone === 'warning' || bankStatus?.tone === 'error') {
            return icons.DotIndicator;
        }
        return undefined;
    }, [bankStatus?.tone, icons.DotIndicator]);

    const isBadgeSuccess = bankStatus?.tone === 'success' || bankStatus?.tone === 'warning';
    const isBadgeError = bankStatus?.tone === 'error';

    // Card state pills (below title, next to description)
    const descriptionAddon = useMemo(() => {
        if (item.isCardFrozen) {
            return (
                <Badge
                    text={translate('cardPage.frozen')}
                    icon={icons.FreezeCard}
                    isCondensed
                    badgeStyles={[styles.ml0]}
                    iconStyles={[styles.mr1]}
                />
            );
        }
        if (item.isInactive) {
            return (
                <Badge
                    text={translate('walletPage.cardInactive')}
                    isCondensed
                    badgeStyles={[styles.ml0]}
                />
            );
        }
        return undefined;
    }, [item.isCardFrozen, item.isInactive, icons.FreezeCard, styles.ml0, styles.mr1, translate]);

    // Inline message + CTA for bank-account states (Incomplete/Pending/Locked) and
    // a neutral tooltip-style message for Verifying. Rendered as a second row beneath
    // the MenuItem so the existing row-press behaviour is unchanged.
    const statusMessageBlock = useMemo(() => {
        const messageKey = bankStatus?.messageKey ?? bankStatus?.tooltipKey;
        if (!messageKey) {
            return null;
        }
        const actionKey = bankStatus?.actionKey;
        let ctaLabel: string | undefined;
        if (actionKey === 'finish') {
            ctaLabel = translate('bankAccount.status.finishAction');
        } else if (actionKey === 'confirm') {
            ctaLabel = translate('bankAccount.status.confirmAction');
        } else if (actionKey === 'unlock') {
            ctaLabel = translate('bankAccount.status.unlockAction');
        }
        const canShowCta = !!ctaLabel && !!onBankAccountStatusActionPress && !!actionKey;
        return (
            <View style={[styles.pb3, shouldUseNarrowLayout ? styles.pl5 : styles.pl8, styles.pr5]}>
                <FormHelpMessage
                    isError={bankStatus?.tone === 'error'}
                    message={translate(messageKey)}
                    style={styles.mb2}
                />
                {canShowCta && (
                    <Button
                        small
                        text={ctaLabel}
                        onPress={() => onBankAccountStatusActionPress?.(actionKey, item)}
                        isDisabled={isOffline}
                        success={bankStatus?.tone !== 'error'}
                        danger={bankStatus?.tone === 'error'}
                        style={styles.alignSelfStart}
                    />
                )}
            </View>
        );
    }, [bankStatus?.messageKey, bankStatus?.tooltipKey, bankStatus?.actionKey, bankStatus?.tone, item, onBankAccountStatusActionPress, isOffline, translate, styles, shouldUseNarrowLayout]);

    // Inline message + CTA for broken card connections.
    const cardStatusBlock = useMemo(() => {
        if (!item.cardStatusOverride) {
            return null;
        }
        const {messageKey, ctaLabelKey, onCtaPress} = item.cardStatusOverride;
        return (
            <View style={[styles.pb3, shouldUseNarrowLayout ? styles.pl5 : styles.pl8, styles.pr5]}>
                <FormHelpMessage
                    isError
                    message={translate(messageKey)}
                    style={styles.mb2}
                />
                {!!ctaLabelKey && !!onCtaPress && (
                    <Button
                        small
                        text={translate(ctaLabelKey)}
                        onPress={onCtaPress}
                        isDisabled={isOffline}
                        style={styles.alignSelfStart}
                    />
                )}
            </View>
        );
    }, [item.cardStatusOverride, isOffline, translate, styles, shouldUseNarrowLayout]);

    const brickRoadIndicator = item.brickRoadIndicator ?? (bankStatus?.shouldShowBrickRoadIndicator ? CONST.BRICK_ROAD_INDICATOR_STATUS.ERROR : undefined);

    return (
        <OfflineWithFeedback
            onClose={item.canDismissError ? () => dismissError(item) : undefined}
            pendingAction={item.pendingAction}
            errors={item.errors}
            errorRowStyles={styles.paymentMethodErrorRow}
            shouldShowErrorMessages={!!item.errors}
        >
            <MenuItem
                onPress={handleRowPress}
                title={item.title}
                description={item.description}
                descriptionAddon={descriptionAddon}
                icon={item.icon}
                plaidUrl={item.plaidUrl}
                disabled={item.disabled}
                iconType={item.plaidUrl ? CONST.ICON_TYPE_PLAID : CONST.ICON_TYPE_ICON}
                displayInDefaultIconColor={!item.iconFill}
                iconHeight={item.iconHeight ?? item.iconSize}
                iconWidth={item.iconWidth ?? item.iconSize}
                iconStyles={item.iconStyles}
                iconFill={item.iconFill}
                badgeText={badgeText}
                badgeIcon={badgeIcon}
                isBadgeSuccess={isBadgeSuccess}
                isBadgeError={isBadgeError}
                wrapperStyle={[styles.paymentMethod, listItemStyle]}
                iconRight={bankStatus?.actionKey === 'finish' || bankStatus?.actionKey === 'confirm' ? undefined : item.iconRight}
                shouldShowRightIcon={!showThreeDotsMenu && item.shouldShowRightIcon}
                shouldShowRightComponent={showThreeDotsMenu}
                rightComponent={
                    showThreeDotsMenu ? (
                        <View style={styles.alignSelfCenter}>
                            <ThreeDotsMenu
                                shouldSelfPosition
                                onIconPress={item.onThreeDotsMenuPress ?? item.onPress}
                                menuItems={threeDotsMenuItems}
                                anchorAlignment={{horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.RIGHT, vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.TOP}}
                                shouldOverlay
                                isNested
                                threeDotsMenuRef={threeDotsMenuRef}
                                disabled={item.disabled}
                            />
                        </View>
                    ) : undefined
                }
                interactive={item.interactive}
                brickRoadIndicator={brickRoadIndicator}
                success={item.isMethodActive}
            />
            {statusMessageBlock}
            {cardStatusBlock}
            {isChaseAccountConnectedViaPlaid && (
                <View style={[styles.pb3, shouldUseNarrowLayout ? styles.pl5 : styles.pl8]}>
                    <PressableWithFeedback
                        onPress={() => openExternalLink(CONST.CHASE_ACCOUNT_NUMBER_HELP_URL)}
                        style={[styles.flexRow, styles.alignItemsCenter, styles.alignSelfStart]}
                        accessibilityLabel={translate('walletPage.chaseAccountNumberDifferent')}
                        role={CONST.ROLE.LINK}
                        sentryLabel={CONST.SENTRY_LABEL.PAYMENT_METHOD_LIST_ITEM.CHASE_ACCOUNT_HELP}
                    >
                        <Icon
                            src={icons.QuestionMark}
                            height={variables.iconSizeSmall}
                            width={variables.iconSizeSmall}
                            fill={theme.textSupporting}
                            additionalStyles={[styles.mr1]}
                        />
                        <Text style={[styles.mutedNormalTextLabel, styles.label]}>{translate('walletPage.chaseAccountNumberDifferent')}</Text>
                    </PressableWithFeedback>
                </View>
            )}
        </OfflineWithFeedback>
    );
}

export type {PaymentMethodItem, CardStatusOverride};
export default PaymentMethodListItem;
