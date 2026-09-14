import {getGuidedSetupDataForOpenReport, openReport} from '@libs/actions/Report';
import {getOnboardingTaskReportFromGuidedSetup, getReviewWorkspaceSettingsTaskCompletionData} from '@libs/actions/Task';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

import {guidedSetupAndTourStatusSelector} from '@selectors/Onboarding';

import useCurrentUserPersonalDetails from './useCurrentUserPersonalDetails';
import useOnboardingTaskInformation from './useOnboardingTaskInformation';
import useOnyx from './useOnyx';

/**
 * Returns a getter that builds the optimistic Onyx data completing the "Review your workspace settings" onboarding
 * task, to be merged into a workspace-settings write command's onyxData.
 *
 * The getter is intentionally lazy: `getReviewWorkspaceSettingsTaskCompletionData` mints a fresh optimistic
 * `reportActionID` on every call, so it must run at save time (not eagerly per render).
 *
 * If the task doesn't exist yet (an invited admin saves a setting before any guided setup ran), the getter enqueues
 * the Concierge OpenReport that creates it, ahead of the caller's write, and completes that same task.
 */
function useReviewWorkspaceSettingsTaskCompletion() {
    const {accountID} = useCurrentUserPersonalDetails();
    const taskInformation = useOnboardingTaskInformation(CONST.ONBOARDING_TASK_TYPE.REVIEW_WORKSPACE_SETTINGS);
    const [introSelected] = useOnyx(ONYXKEYS.NVP_INTRO_SELECTED);
    const [conciergeReportID] = useOnyx(ONYXKEYS.CONCIERGE_REPORT_ID);
    const [conciergeChat] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${conciergeReportID}`);
    const [hasConciergeReportActions] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${conciergeReportID}`, {selector: Boolean});
    const [betas] = useOnyx(ONYXKEYS.BETAS);
    const [guidedSetupAndTourStatus] = useOnyx(ONYXKEYS.NVP_ONBOARDING, {selector: guidedSetupAndTourStatusSelector});

    return () => {
        if (taskInformation.taskReport || !conciergeReportID) {
            return getReviewWorkspaceSettingsTaskCompletionData(taskInformation, accountID);
        }

        const guidedSetup = getGuidedSetupDataForOpenReport(
            introSelected,
            accountID,
            conciergeChat,
            guidedSetupAndTourStatus?.isSelfTourViewed,
            guidedSetupAndTourStatus?.hasCompletedGuidedSetupFlow,
        );
        const taskReport = getOnboardingTaskReportFromGuidedSetup(guidedSetup, CONST.ONBOARDING_TASK_TYPE.REVIEW_WORKSPACE_SETTINGS);
        if (!taskReport) {
            return {};
        }

        // Hand openReport the guided setup we just read the task from: building it again would mint new task report IDs.
        // The sequential queue sends this OpenReport before the caller's write, so the task exists when the backend completes it.
        openReport({
            reportID: conciergeReportID,
            introSelected,
            betas,
            conciergeChat,
            hasReportActions: hasConciergeReportActions,
            currentUserAccountID: accountID,
            isSelfTourViewed: guidedSetupAndTourStatus?.isSelfTourViewed,
            hasCompletedGuidedSetupFlow: guidedSetupAndTourStatus?.hasCompletedGuidedSetupFlow,
            shouldMarkAsRead: false,
            guidedSetup,
        });

        // No parent report: guided setup's own optimistic data already sets Concierge's hasOutstandingChildTask.
        return getReviewWorkspaceSettingsTaskCompletionData(
            {taskReport, taskParentReport: undefined, isOnboardingTaskParentReportArchived: false, hasOutstandingChildTask: false, parentReportAction: undefined},
            accountID,
        );
    };
}

export default useReviewWorkspaceSettingsTaskCompletion;
