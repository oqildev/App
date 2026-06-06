import ONYXKEYS from '@src/ONYXKEYS';
import type {IntroSelectedTask} from '@src/types/onyx/IntroSelected';
import isLoadingOnyxValue from '@src/types/utils/isLoadingOnyxValue';
import useHasOutstandingChildTask from './useHasOutstandingChildTask';
import useOnyx from './useOnyx';
import useParentReportAction from './useParentReportAction';
import useReportIsArchived from './useReportIsArchived';

function useOnboardingTaskInformation(taskName: IntroSelectedTask) {
    const [introSelected, introSelectedMetadata] = useOnyx(ONYXKEYS.NVP_INTRO_SELECTED);
    const taskReportID = introSelected?.[taskName];
    const [taskReport, taskReportMetadata] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${taskReportID}`, undefined, [taskReportID]);
    const [taskParentReport] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT}${taskReport?.parentReportID}`);
    const hasOutstandingChildTask = useHasOutstandingChildTask(taskReport);
    const isOnboardingTaskParentReportArchived = useReportIsArchived(taskParentReport?.reportID);
    const parentReportAction = useParentReportAction(taskReport);
    // True while introSelected itself is loading, or a known task report ID hasn't hydrated yet — so callers
    // can wait instead of treating it as "no task" (which would skip completion on a timing race).
    const isLoadingTaskReport = isLoadingOnyxValue(introSelectedMetadata) || (!!taskReportID && isLoadingOnyxValue(taskReportMetadata));
    return {
        taskReportID,
        taskReport,
        taskParentReport,
        isOnboardingTaskParentReportArchived,
        hasOutstandingChildTask,
        parentReportAction,
        isLoadingTaskReport,
    };
}

export default useOnboardingTaskInformation;
