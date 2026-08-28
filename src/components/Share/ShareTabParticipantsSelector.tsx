import useCurrentUserPersonalDetails from '@hooks/useCurrentUserPersonalDetails';
import useDefaultExpensePolicy from '@hooks/useDefaultExpensePolicy';
import useOnyx from '@hooks/useOnyx';
import usePreferredPolicy from '@hooks/usePreferredPolicy';

import {clearMoneyRequest} from '@libs/actions/IOU/MoneyRequest';
import {saveUnknownUserDetails} from '@libs/actions/Share';
import Navigation from '@libs/Navigation/Navigation';
import {getPolicyExpenseChat} from '@libs/ReportUtils';
import shouldUseDefaultExpensePolicy from '@libs/shouldUseDefaultExpensePolicy';
import {cancelSpan, getSpan, startSpan} from '@libs/telemetry/activeSpans';

import MoneyRequestParticipantsSelector from '@pages/iou/request/MoneyRequestParticipantsSelector';

import {getOptimisticChatReport, saveReportDraft} from '@userActions/Report';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import {validTransactionDraftIDsSelector} from '@src/selectors/TransactionDraft';
import isLoadingOnyxValue from '@src/types/utils/isLoadingOnyxValue';

import React, {useEffect, useRef, useState} from 'react';

type ShareTabParticipantsSelectorProps = {
    detailsPageRouteObject: typeof ROUTES.SHARE_SUBMIT_DETAILS | typeof ROUTES.SHARE_DETAILS;
};

function ShareTabParticipantsSelectorComponent({detailsPageRouteObject}: ShareTabParticipantsSelectorProps) {
    const {accountID: currentUserAccountID} = useCurrentUserPersonalDetails();
    const [draftTransactionIDs] = useOnyx(ONYXKEYS.COLLECTION.TRANSACTION_DRAFT, {selector: validTransactionDraftIDsSelector});
    const [selectedReportID, setSelectedReportID] = useState<string | number | undefined>();

    const isSubmitFlow = detailsPageRouteObject === ROUTES.SHARE_SUBMIT_DETAILS;

    const {isRestrictedToPreferredPolicy, preferredPolicyID} = usePreferredPolicy();

    // When the user's domain security group restricts submission to a single workspace, skip the participant picker and
    // go straight to confirmation for the locked workspace's expense chat, matching the in-product submit flow. Falls back
    // to the picker if the locked policy's expense chat isn't in Onyx yet, so we never navigate to an empty report.
    const lockedExpenseChatReportID =
        isSubmitFlow && isRestrictedToPreferredPolicy && preferredPolicyID ? getPolicyExpenseChat(currentUserAccountID, preferredPolicyID)?.reportID : undefined;

    const defaultExpensePolicy = useDefaultExpensePolicy();
    const [amountOwed, amountOwedResult] = useOnyx(ONYXKEYS.NVP_PRIVATE_AMOUNT_OWED);
    const [userBillingGracePeriodEnds, userBillingGracePeriodEndsResult] = useOnyx(ONYXKEYS.COLLECTION.SHARED_NVP_PRIVATE_USER_BILLING_GRACE_PERIOD_END);
    const [ownerBillingGracePeriodEnd, ownerBillingGracePeriodEndResult] = useOnyx(ONYXKEYS.NVP_PRIVATE_OWNER_BILLING_GRACE_PERIOD_END);
    const [, policyCollectionResult] = useOnyx(ONYXKEYS.COLLECTION.POLICY, {selector: () => null});

    // The values below resolve asynchronously, and `useDefaultExpensePolicy` reports "no default workspace" while they
    // are still loading. Without this we would mount the picker for a user who is about to be auto-navigated away.
    const isResolvingDefaultExpensePolicy =
        isSubmitFlow && !isRestrictedToPreferredPolicy && isLoadingOnyxValue(policyCollectionResult, amountOwedResult, userBillingGracePeriodEndsResult, ownerBillingGracePeriodEndResult);

    // Same optimization for the unrestricted mainline case: when the user has a single default *group* workspace, skip
    // the picker as well. `shouldUseDefaultExpensePolicy` is the helper the in-product create flow uses, so the billing
    // restrictions (overdue balance / grace period) that suppress the shortcut there suppress it here too. It is called
    // with `CONST.IOU.TYPE.CREATE` because its `iouType` argument only gates which entry point may use a default
    // workspace, and auto-picking the default workspace for a fresh share is that same entry point — passing `SUBMIT`
    // would instead loosen the helper for its other mainline callers.
    const canUseDefaultExpensePolicy =
        isSubmitFlow &&
        !isRestrictedToPreferredPolicy &&
        shouldUseDefaultExpensePolicy(CONST.IOU.TYPE.CREATE, defaultExpensePolicy, amountOwed, userBillingGracePeriodEnds, ownerBillingGracePeriodEnd, currentUserAccountID);

    // Same Onyx fallback as the locked branch: keep the picker when the expense chat isn't available yet.
    const defaultExpenseChatReportID = canUseDefaultExpensePolicy ? getPolicyExpenseChat(currentUserAccountID, defaultExpensePolicy?.id)?.reportID : undefined;

    // The domain lock wins: it is a restriction, while the default workspace is only a preference. It also stays
    // un-gated by the billing checks above, preserving today's behavior for restricted users.
    const autoNavigationExpenseChatReportID = lockedExpenseChatReportID ?? defaultExpenseChatReportID;

    // Synchronous one-shot guard for the auto-navigation effect. A ref (rather than the render state below) is used so
    // the guard flips immediately: clearing the draft transaction mutates draftTransactionIDs, which re-runs the effect
    // before a state update could commit, so a state-based guard would navigate twice.
    const hasAutoNavigatedRef = useRef(false);

    // Drives rendering: once the one-shot auto-navigation has run, we stop returning null and render the picker
    // underneath instead, so backing out of the details page lands on a usable screen rather than a blank Submit tab.
    const [hasAutoNavigatedToTargetReport, setHasAutoNavigatedToTargetReport] = useState(false);

    // This span belongs to the submit flow, so the share flow instance must not cancel a span it never started. For the submit flow this cancels an attempt that closes before SubmitDetailsPage mounts to end the span, so it is
    useEffect(
        () => () => {
            if (!isSubmitFlow) {
                return;
            }
            cancelSpan(CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW);
        },
        [isSubmitFlow],
    );

    // One-shot: auto-navigate straight to the target workspace's confirmation the first time that report resolves — the
    // domain-locked workspace for a restricted user, the default group workspace otherwise. The hasAutoNavigatedRef
    // guard keeps this from re-running (and re-navigating) if draftTransactionIDs later changes, while still keeping
    // every captured value in the dependency array so we clear the up-to-date drafts at navigation time and no
    // dependency lint has to be suppressed.
    useEffect(() => {
        if (!autoNavigationExpenseChatReportID || hasAutoNavigatedRef.current) {
            return;
        }
        hasAutoNavigatedRef.current = true;

        // clear the existing draft transaction from the previous flow to prevent the old data from being displayed
        clearMoneyRequest(CONST.IOU.OPTIMISTIC_TRANSACTION_ID, draftTransactionIDs);

        startSpan(CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW, {
            name: CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW,
            op: CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW,
            forceTransaction: true,
            attributes: {
                [CONST.TELEMETRY.ATTRIBUTE_REPORT_ID]: autoNavigationExpenseChatReportID.toString(),
                [CONST.TELEMETRY.ATTRIBUTE_ROUTE_FROM]: Navigation.getActiveRoute() || 'unknown',
            },
        });

        // Flip the render state once the transition to the details page completes so the picker mounts underneath it,
        // giving the user a usable screen when they back out. Doing this in the afterTransition callback (rather than
        // calling setState synchronously in the effect body) avoids the react-hooks/set-state-in-effect violation.
        Navigation.navigate(detailsPageRouteObject.getRoute(autoNavigationExpenseChatReportID.toString()), {
            afterTransition: () => setHasAutoNavigatedToTargetReport(true),
        });
    }, [autoNavigationExpenseChatReportID, draftTransactionIDs, detailsPageRouteObject]);

    // Render null only until the auto-navigation has run, to avoid flashing the full picker while we route the user to
    // the target workspace. Afterwards we fall through to the picker so that backing out of the details page shows a
    // usable screen instead of a blank tab — still limited to the locked workspace by the option-list filter for a
    // restricted user, and the full list for everyone else, which is how they change the `To` after landing.
    if (isResolvingDefaultExpensePolicy || (autoNavigationExpenseChatReportID && !hasAutoNavigatedToTargetReport)) {
        return null;
    }

    return (
        <MoneyRequestParticipantsSelector
            iouType={CONST.IOU.TYPE.SUBMIT}
            initiallySelectedReportID={typeof selectedReportID === 'string' ? selectedReportID : undefined}
            onParticipantsAdded={(value) => {
                // clear the existing draft transaction from the previous flow to prevent the old data from being displayed
                clearMoneyRequest(CONST.IOU.OPTIMISTIC_TRANSACTION_ID, draftTransactionIDs);

                const participant = value.at(0);
                let reportID = participant?.reportID ?? CONST.DEFAULT_NUMBER_ID;
                const accountID = participant?.accountID;

                if (isSubmitFlow) {
                    startSpan(CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW, {
                        name: CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW,
                        op: CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW,
                        forceTransaction: true,
                        attributes: {
                            [CONST.TELEMETRY.ATTRIBUTE_REPORT_ID]: reportID.toString(),
                            [CONST.TELEMETRY.ATTRIBUTE_ROUTE_FROM]: Navigation.getActiveRoute() || 'unknown',
                        },
                    });
                }

                if (accountID && !reportID) {
                    saveUnknownUserDetails(participant);
                    const optimisticReport = getOptimisticChatReport(accountID, currentUserAccountID);
                    reportID = optimisticReport.reportID;

                    if (isSubmitFlow) {
                        getSpan(CONST.TELEMETRY.SPAN_SHARE_EXTENSION_OPEN_SUBMIT_FLOW)?.setAttribute(CONST.TELEMETRY.ATTRIBUTE_REPORT_ID, reportID.toString());
                    }

                    setSelectedReportID(reportID);
                    saveReportDraft(reportID, optimisticReport).then(() => {
                        Navigation.navigate(detailsPageRouteObject.getRoute(reportID.toString()));
                    });
                } else {
                    setSelectedReportID(reportID);
                    Navigation.navigate(detailsPageRouteObject.getRoute(reportID.toString()));
                }
            }}
            action="create"
        />
    );
}

export default ShareTabParticipantsSelectorComponent;
