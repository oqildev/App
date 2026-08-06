import HeaderWithBackButton from '@components/HeaderWithBackButton';
import {ModalActions} from '@components/Modal/Global/ModalContext';
import RenderHTML from '@components/RenderHTML';
import ScreenWrapper from '@components/ScreenWrapper';
import SelectionList from '@components/SelectionList';
import SingleSelectListItem from '@components/SelectionList/ListItem/SingleSelectListItem';

import useConfirmModal from '@hooks/useConfirmModal';
import useEnvironment from '@hooks/useEnvironment';
import useLocalize from '@hooks/useLocalize';
import usePermissions from '@hooks/usePermissions';
import usePolicy from '@hooks/usePolicy';
import useThemeStyles from '@hooks/useThemeStyles';

import Navigation from '@libs/Navigation/Navigation';
import type {PlatformStackScreenProps} from '@libs/Navigation/PlatformStackNavigation/types';
import type {SettingsNavigatorParamList} from '@libs/Navigation/types';

import AccessOrNotFoundWrapper from '@pages/workspace/AccessOrNotFoundWrapper';
import ToggleSettingOptionRow from '@pages/workspace/workflows/ToggleSettingsOptionRow';

import {getBillableExpensesPendingAction, getPolicyBillableMode, setPolicyBillableModeChoice, toggleBillableExpenses} from '@userActions/Policy/Policy';

import CONST from '@src/CONST';
import ROUTES from '@src/ROUTES';
import type SCREENS from '@src/SCREENS';

import React, {useMemo, useState} from 'react';
import {View} from 'react-native';

type RulesBillableDefaultPageProps = PlatformStackScreenProps<SettingsNavigatorParamList, typeof SCREENS.WORKSPACE.RULES_BILLABLE_DEFAULT>;

function RulesBillableDefaultPage({
    route: {
        params: {policyID},
    },
}: RulesBillableDefaultPageProps) {
    const policy = usePolicy(policyID);

    const {translate} = useLocalize();
    const styles = useThemeStyles();
    const {environmentURL} = useEnvironment();
    const {isBetaEnabled} = usePermissions();
    const {showConfirmModal} = useConfirmModal();
    const isRevamp = isBetaEnabled(CONST.BETAS.RULES_REVAMP);

    const persistedMode = getPolicyBillableMode(policy);
    // The draft holds the user's in-page selection. Until they pick a row it stays undefined and we fall back to the
    // persisted mode, which also covers the page rendering before the policy is in Onyx.
    const [draftMode, setDraftMode] = useState<typeof persistedMode>();
    const selectedMode = draftMode ?? persistedMode;
    const hasChanges = !!selectedMode && selectedMode !== persistedMode;

    // The revamp path represents the disabled state with its own "Track billable" toggle, so it keeps the two-option list.
    const availableModes = isRevamp
        ? [CONST.POLICY_BILLABLE_MODES.BILLABLE, CONST.POLICY_BILLABLE_MODES.NON_BILLABLE]
        : [CONST.POLICY_BILLABLE_MODES.DISABLED, CONST.POLICY_BILLABLE_MODES.NON_BILLABLE, CONST.POLICY_BILLABLE_MODES.BILLABLE];

    const billableModes = availableModes.map((mode) => ({
        value: mode,
        text: translate(`workspace.rules.individualExpenseRules.${mode}`),
        alternateText: translate(`workspace.rules.individualExpenseRules.${mode}Description`),
        keyForList: mode,
        isSelected: selectedMode === mode,
    }));

    const saveAndGoBack = () => {
        if (!selectedMode) {
            return;
        }
        setPolicyBillableModeChoice(policy, selectedMode);
        Navigation.setNavigationActionToMicrotaskQueue(Navigation.goBack);
    };

    const confirmButtonOptions = {
        showButton: true,
        text: translate('common.save'),
        onConfirm: saveAndGoBack,
        isDisabled: !hasChanges,
    };

    const isBillableTrackingEnabled = policy?.disabledFields?.defaultBillable !== true;
    const isTrackBillableToggleDisabled = !policy?.areTagsEnabled;
    const shouldShowBillableModeList = !isRevamp || (isBillableTrackingEnabled && !isTrackBillableToggleDisabled);

    const tagsPageLink = useMemo(() => {
        if (policy?.areTagsEnabled) {
            return `${environmentURL}/${ROUTES.WORKSPACE_TAGS.getRoute(policyID)}`;
        }

        return `${environmentURL}/${ROUTES.WORKSPACE_MORE_FEATURES.getRoute(policyID)}`;
    }, [environmentURL, policy?.areTagsEnabled, policyID]);

    const promptEnableTagsToUnlockTrackBillable = async () => {
        const {action} = await showConfirmModal({
            title: translate('workspace.rules.individualExpenseRules.enableTagsToUnlockTitle'),
            prompt: translate('workspace.rules.individualExpenseRules.enableTagsToUnlockPrompt'),
            confirmText: translate('common.ok'),
            cancelText: translate('common.cancel'),
        });
        if (action !== ModalActions.CONFIRM) {
            return;
        }
        Navigation.navigate(ROUTES.WORKSPACE_MORE_FEATURES.getRoute(policyID));
    };

    return (
        <AccessOrNotFoundWrapper
            policyID={policyID}
            accessVariants={[CONST.POLICY.ACCESS_VARIANTS.ADMIN, CONST.POLICY.ACCESS_VARIANTS.PAID]}
            featureName={CONST.POLICY.MORE_FEATURES.ARE_RULES_ENABLED}
        >
            <ScreenWrapper
                enableEdgeToEdgeBottomSafeAreaPadding
                shouldEnableMaxHeight
                testID="RulesBillableDefaultPage"
            >
                <HeaderWithBackButton
                    title={translate(isRevamp ? 'workspace.rules.generalTab.billableExpenses' : 'workspace.rules.individualExpenseRules.billableDefault')}
                    onBackButtonPress={() => Navigation.goBack()}
                />
                <View style={[styles.flexRow, styles.renderHTML, styles.mt3, styles.mh5, isRevamp ? styles.mb3 : styles.mb5]}>
                    <RenderHTML html={translate('workspace.rules.individualExpenseRules.billableDefaultDescription', tagsPageLink)} />
                </View>
                {isRevamp && (
                    <ToggleSettingOptionRow
                        title={translate('workspace.tags.trackBillable')}
                        switchAccessibilityLabel={translate('workspace.tags.trackBillable')}
                        shouldPlaceSubtitleBelowSwitch
                        wrapperStyle={[styles.mh5, styles.mv4]}
                        isActive={isBillableTrackingEnabled}
                        disabled={isTrackBillableToggleDisabled}
                        showLockIcon={isTrackBillableToggleDisabled}
                        disabledText={isTrackBillableToggleDisabled ? translate('workspace.rules.individualExpenseRules.enableTagsToUnlockPrompt') : undefined}
                        disabledAction={isTrackBillableToggleDisabled ? promptEnableTagsToUnlockTrackBillable : undefined}
                        pendingAction={getBillableExpensesPendingAction(policy)}
                        onToggle={() => toggleBillableExpenses(policy)}
                    />
                )}
                {shouldShowBillableModeList && (
                    <SelectionList
                        data={billableModes}
                        ListItem={SingleSelectListItem}
                        onSelectRow={(item) => {
                            setDraftMode(item.value);
                        }}
                        confirmButtonOptions={confirmButtonOptions}
                        shouldSingleExecuteRowSelect
                        initiallyFocusedItemKey={persistedMode}
                        addBottomSafeAreaPadding
                    />
                )}
            </ScreenWrapper>
        </AccessOrNotFoundWrapper>
    );
}

export default RulesBillableDefaultPage;
